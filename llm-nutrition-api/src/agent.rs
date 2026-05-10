use std::num::NonZeroU32;
use std::sync::Arc;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use serde::Deserialize;

use crate::NutritionItem;

const MAX_ROUNDS: usize = 5;
const MAX_NEW_TOKENS: usize = 1024;

const SYSTEM_PROMPT: &str = "\
You are a nutrition expert. Look up or estimate nutritional values for the food the user describes.

You have access to two tools. To call a tool, output ONLY a JSON object:
  Search the web:  {\"action\": \"search_web\", \"query\": \"your search query\"}
  Read a webpage:  {\"action\": \"read_webpage\", \"url\": \"https://...\"}

Use tools for branded products or restaurant items where exact values matter.
For common foods (e.g. \"1 egg\", \"100g chicken breast\"), estimate directly.

When you have enough information, output ONLY this JSON (no markdown, no extra text):
{\"description\": \"...\", \"calories\": 0, \"total_fat_grams\": 0, \"saturated_fat_grams\": 0, \
\"trans_fat_grams\": 0, \"polyunsaturated_fat_grams\": 0, \"monounsaturated_fat_grams\": 0, \
\"cholesterol_milligrams\": 0, \"sodium_milligrams\": 0, \"total_carbohydrate_grams\": 0, \
\"dietary_fiber_grams\": 0, \"total_sugars_grams\": 0, \"added_sugars_grams\": 0, \"protein_grams\": 0}";

#[derive(Deserialize)]
struct ToolCall {
    action: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    url: String,
}

fn nutrition_item_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "description": {"type": "string"},
            "calories": {"type": "number"},
            "total_fat_grams": {"type": "number"},
            "saturated_fat_grams": {"type": "number"},
            "trans_fat_grams": {"type": "number"},
            "polyunsaturated_fat_grams": {"type": "number"},
            "monounsaturated_fat_grams": {"type": "number"},
            "cholesterol_milligrams": {"type": "number"},
            "sodium_milligrams": {"type": "number"},
            "total_carbohydrate_grams": {"type": "number"},
            "dietary_fiber_grams": {"type": "number"},
            "total_sugars_grams": {"type": "number"},
            "added_sugars_grams": {"type": "number"},
            "protein_grams": {"type": "number"}
        },
        "required": [
            "description", "calories", "total_fat_grams", "saturated_fat_grams",
            "trans_fat_grams", "polyunsaturated_fat_grams", "monounsaturated_fat_grams",
            "cholesterol_milligrams", "sodium_milligrams", "total_carbohydrate_grams",
            "dietary_fiber_grams", "total_sugars_grams", "added_sugars_grams", "protein_grams"
        ],
        "additionalProperties": false
    })
}

// Build a Gemma-formatted prompt from a message history.
// In Gemma 4 the system message is prepended to the first user turn.
fn build_prompt(conversation: &[(String, String)]) -> String {
    let mut prompt = String::new();
    let mut system_content: Option<&str> = None;
    let mut first_user = true;

    for (role, content) in conversation {
        match role.as_str() {
            "system" => {
                system_content = Some(content.as_str());
            }
            "user" => {
                if first_user {
                    if let Some(sys) = system_content {
                        prompt.push_str(&format!(
                            "<start_of_turn>user\n{sys}\n\n{content}<end_of_turn>\n"
                        ));
                    } else {
                        prompt.push_str(&format!(
                            "<start_of_turn>user\n{content}<end_of_turn>\n"
                        ));
                    }
                    first_user = false;
                } else {
                    prompt.push_str(&format!(
                        "<start_of_turn>user\n{content}<end_of_turn>\n"
                    ));
                }
            }
            "assistant" | "tool" => {
                prompt.push_str(&format!(
                    "<start_of_turn>model\n{content}<end_of_turn>\n"
                ));
            }
            _ => {}
        }
    }
    // Open the model's turn
    prompt.push_str("<start_of_turn>model\n");
    prompt
}

// Synchronous inference — must run inside tokio::task::spawn_blocking.
fn run_inference(
    backend: &LlamaBackend,
    model: &LlamaModel,
    conversation: &[(String, String)],
    gbnf_grammar: Option<String>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let prompt = build_prompt(conversation);

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(8192))
        .with_n_batch(512);

    let mut ctx = model.new_context(backend, ctx_params)?;

    // Tokenize the prompt
    let tokens = model.str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)?;
    let n_prompt = tokens.len();

    let mut batch = LlamaBatch::new(n_prompt.max(512), 1);
    let last_idx = (n_prompt - 1) as i32;
    for (i, &tok) in tokens.iter().enumerate() {
        batch.add(tok, i as i32, &[0], i as i32 == last_idx)?;
    }
    ctx.decode(&mut batch)?;

    // Build sampler chain
    let mut sampler_parts: Vec<LlamaSampler> = Vec::new();
    if let Some(ref grammar) = gbnf_grammar {
        sampler_parts.push(LlamaSampler::grammar(model, grammar, "root")?);
    }
    sampler_parts.push(LlamaSampler::temp(0.1));
    sampler_parts.push(LlamaSampler::greedy());
    let mut sampler = LlamaSampler::chain_simple(sampler_parts);

    // Token decoder for multi-byte UTF-8 sequences
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    // Generation loop
    let mut output = String::new();
    let mut n_cur = n_prompt;

    loop {
        let token = sampler.sample(&ctx, -1);
        sampler.accept(token);

        if model.is_eog_token(token) || n_cur >= n_prompt + MAX_NEW_TOKENS {
            break;
        }

        let piece = model.token_to_piece(token, &mut decoder, false, None)?;
        output.push_str(&piece);

        batch.clear();
        batch.add(token, n_cur as i32, &[0], true)?;
        ctx.decode(&mut batch)?;
        n_cur += 1;
    }

    Ok(output.trim().to_string())
}

// Extract the first JSON object from arbitrary text output.
fn extract_json(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let slice = &text[start..];
    let end = slice.rfind('}')?;
    Some(&slice[..=end])
}

pub async fn run_agent(
    backend: Arc<LlamaBackend>,
    model: Arc<LlamaModel>,
    description: String,
) -> Result<NutritionItem, Box<dyn std::error::Error + Send + Sync>> {
    let mut conversation: Vec<(String, String)> = vec![
        ("system".to_string(), SYSTEM_PROMPT.to_string()),
        ("user".to_string(), description),
    ];

    for round in 0..MAX_ROUNDS {
        log::debug!("Agent round {round}");

        let backend_arc = Arc::clone(&backend);
        let model_arc = Arc::clone(&model);
        let conv_snapshot = conversation.clone();

        let output = tokio::task::spawn_blocking(move || {
            run_inference(&backend_arc, &model_arc, &conv_snapshot, None)
        })
        .await??;

        log::debug!("Model output: {output}");

        // Try to parse as a tool call
        let json_str = extract_json(&output).unwrap_or(&output);
        if let Ok(call) = serde_json::from_str::<ToolCall>(json_str) {
            match call.action.as_str() {
                "search_web" if !call.query.is_empty() => {
                    log::info!("Tool call: search_web({:?})", call.query);
                    let result = crate::tools::search_web(&call.query).await?;
                    conversation.push(("assistant".to_string(), output));
                    conversation.push((
                        "tool".to_string(),
                        format!("Search results for '{}':\n{result}", call.query),
                    ));
                    continue;
                }
                "read_webpage" if !call.url.is_empty() => {
                    log::info!("Tool call: read_webpage({:?})", call.url);
                    let result = crate::tools::read_webpage(&call.url).await?;
                    conversation.push(("assistant".to_string(), output));
                    conversation.push((
                        "tool".to_string(),
                        format!("Page content from {}:\n{result}", call.url),
                    ));
                    continue;
                }
                _ => {}
            }
        }

        // No tool call — run a final grammar-constrained pass for clean nutrition JSON
        let schema = nutrition_item_schema().to_string();
        let gbnf = llama_cpp_2::json_schema_to_grammar(&schema)
            .map_err(|e| format!("Grammar conversion failed: {e}"))?;

        let backend_arc = Arc::clone(&backend);
        let model_arc = Arc::clone(&model);
        let mut final_conv = conversation.clone();
        final_conv.push(("assistant".to_string(), output));
        final_conv.push((
            "user".to_string(),
            "Now output ONLY the JSON nutrition object for the food described above.".to_string(),
        ));

        let final_json = tokio::task::spawn_blocking(move || {
            run_inference(&backend_arc, &model_arc, &final_conv, Some(gbnf))
        })
        .await??;

        log::debug!("Final JSON: {final_json}");

        let json_str = extract_json(&final_json).unwrap_or(&final_json);
        let item: NutritionItem = serde_json::from_str(json_str)?;
        return Ok(item);
    }

    Err("Max agent rounds exceeded without a nutrition answer".into())
}
