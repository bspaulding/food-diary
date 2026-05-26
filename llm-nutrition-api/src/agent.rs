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
const MAX_NEW_TOKENS: usize = 1024;       // used for local llama.cpp inference
const API_MAX_NEW_TOKENS: usize = 8192;   // higher budget for API models with thinking tokens
const API_MAX_RETRIES: u32 = 8;

const SYSTEM_PROMPT: &str = "\
You are a nutrition expert. Look up or estimate nutritional values for the food the user describes.

You have access to two tools. To call a tool, output ONLY a JSON object:
  Search the web:  {\"action\": \"search_web\", \"query\": \"your search query\"}
  Read a webpage:  {\"action\": \"read_webpage\", \"url\": \"https://...\"}

RULES:
- You MUST call search_web for any branded product (protein bars, cereals, snacks), \
packaged food, chain restaurant item, or fast food. Do not guess these from memory.
- For unbranded whole foods (e.g. \"1 egg\", \"100g chicken breast\", \"1 cup milk\"), \
estimate directly — no tool call needed.
- When a query says \"cooked\", \"baked\", \"boiled\", \"grilled\", or \"prepared\", \
always use post-cooking nutritional values, not raw/dry values. \
\"1 cup cooked oatmeal\" means cooked (water absorbed, ~166 kcal), not dry (~300 kcal).
- Use the exact serving size stated in the query.

EXAMPLES:

User: CLIF BAR Chocolate Chip (68g)
Assistant: {\"action\": \"search_web\", \"query\": \"CLIF BAR Chocolate Chip 68g nutrition facts calories protein carbs fat\"}
User: Search results for 'CLIF BAR Chocolate Chip 68g nutrition facts calories protein carbs fat':
Title: CLIF BAR Chocolate Chip Energy Bar Nutrition Facts
Snippet: Serving size 1 bar (68g). Calories 250. Total Fat 6g. Protein 10g. Total Carbohydrate 44g.
Assistant: {\"description\": \"CLIF BAR Chocolate Chip\", \"calories\": 250, \"total_fat_grams\": 6, \
\"saturated_fat_grams\": 1.5, \"trans_fat_grams\": 0, \"polyunsaturated_fat_grams\": 1.5, \
\"monounsaturated_fat_grams\": 2.5, \"cholesterol_milligrams\": 0, \"sodium_milligrams\": 150, \
\"total_carbohydrate_grams\": 44, \"dietary_fiber_grams\": 4, \"total_sugars_grams\": 17, \
\"added_sugars_grams\": 17, \"protein_grams\": 10}

User: 1 cup cooked oatmeal (234g)
Assistant: {\"description\": \"1 cup cooked oatmeal\", \"calories\": 166, \"total_fat_grams\": 3.6, \
\"saturated_fat_grams\": 0.7, \"trans_fat_grams\": 0, \"polyunsaturated_fat_grams\": 1.3, \
\"monounsaturated_fat_grams\": 1.1, \"cholesterol_milligrams\": 0, \"sodium_milligrams\": 115, \
\"total_carbohydrate_grams\": 28, \"dietary_fiber_grams\": 4, \"total_sugars_grams\": 0.6, \
\"added_sugars_grams\": 0, \"protein_grams\": 5.9}

When you have enough information, output ONLY the final JSON (no markdown, no extra text):
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

pub enum BackendConfig {
    Local {
        backend: Arc<LlamaBackend>,
        model: Arc<LlamaModel>,
    },
    Api {
        api_key: String,
        model: String,
        base_url: String,
        client: reqwest::Client,
    },
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

    // Tokenize before creating the context so n_batch covers the full prompt.
    // n_batch < n_prompt triggers an assert inside llama.cpp.
    let tokens = model.str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)?;
    let n_prompt = tokens.len();
    let n_batch = (n_prompt as u32).max(512);

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(8192))
        .with_n_batch(n_batch);

    let mut ctx = model.new_context(backend, ctx_params)?;

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

fn api_error_message(text: &str) -> String {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(String::from))
        .unwrap_or_else(|| text.to_string())
}

async fn call_api(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    base_url: &str,
    conversation: &[(String, String)],
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let messages: Vec<serde_json::Value> = conversation
        .iter()
        .map(|(role, content)| {
            // OpenAI format doesn't have a "tool" role in this simple usage; treat as user.
            let api_role = if role == "tool" { "user" } else { role.as_str() };
            serde_json::json!({ "role": api_role, "content": content })
        })
        .collect();

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": API_MAX_NEW_TOKENS
    });

    let endpoint = format!("{base_url}/chat/completions");
    let mut attempt = 0u32;
    loop {
        let response = client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            if attempt >= API_MAX_RETRIES {
                let text = response.text().await.unwrap_or_default();
                let msg = api_error_message(&text);
                return Err(format!("LLM API rate limit exceeded after {attempt} retries: {msg}").into());
            }
            // Prefer Retry-After header, then retryDelay in JSON body, then exponential backoff.
            let header_secs = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            let text = response.text().await.unwrap_or_default();
            let body_secs = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    // Google returns e.g. "retryDelay": "38s" nested under details[].retryDelay
                    v["error"]["details"]
                        .as_array()?
                        .iter()
                        .find_map(|d| d["retryDelay"].as_str())
                        .and_then(|s| s.trim_end_matches('s').parse::<u64>().ok())
                });
            let delay_secs = header_secs
                .or(body_secs)
                .unwrap_or(1u64 << attempt)
                .max(1);
            log::warn!("LLM API 429 on attempt {attempt}, retrying in {delay_secs}s");
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
            attempt += 1;
            continue;
        }

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let msg = api_error_message(&text);
            return Err(format!("LLM API error {status}: {msg}").into());
        }

        let json: serde_json::Value = response.json().await?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Missing content in LLM API response")?
            .trim()
            .to_string();

        return Ok(content);
    }
}

async fn run_agent_local(
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

        let json_str = extract_json(&output).unwrap_or(&output);
        if let Ok(call) = serde_json::from_str::<ToolCall>(json_str) {
            match call.action.as_str() {
                "search_web" if !call.query.is_empty() => {
                    log::info!("Tool call: search_web({:?})", call.query);
                    let result = match crate::tools::search_web(&call.query).await {
                        Ok(r) => format!("Search results for '{}':\n{r}", call.query),
                        Err(e) => {
                            log::warn!("search_web failed: {e}");
                            format!("Search failed: {e}. Estimate from nutritional knowledge instead.")
                        }
                    };
                    conversation.push(("assistant".to_string(), output));
                    conversation.push(("tool".to_string(), result));
                    continue;
                }
                "read_webpage" if !call.url.is_empty() => {
                    log::info!("Tool call: read_webpage({:?})", call.url);
                    let result = match crate::tools::read_webpage(&call.url).await {
                        Ok(r) => format!("Page content from {}:\n{r}", call.url),
                        Err(e) => {
                            log::warn!("read_webpage failed: {e}");
                            format!("Page fetch failed: {e}. Estimate from nutritional knowledge instead.")
                        }
                    };
                    conversation.push(("assistant".to_string(), output));
                    conversation.push(("tool".to_string(), result));
                    continue;
                }
                _ => {}
            }
        }

        // No tool call — do a focused final pass asking for pure JSON.
        // Grammar-constrained sampling (json_schema_to_grammar) crashes with this
        // version of llama.cpp; free-form output + extract_json is equally reliable.
        let backend_arc = Arc::clone(&backend);
        let model_arc = Arc::clone(&model);
        let mut final_conv = conversation.clone();
        final_conv.push(("assistant".to_string(), output));
        final_conv.push((
            "user".to_string(),
            "Output ONLY the JSON nutrition object. No markdown, no explanation, just the JSON object with all 14 fields.".to_string(),
        ));

        let final_json = tokio::task::spawn_blocking(move || {
            run_inference(&backend_arc, &model_arc, &final_conv, None)
        })
        .await??;

        log::debug!("Final JSON: {final_json}");

        let json_str = extract_json(&final_json).unwrap_or(&final_json);
        let item: NutritionItem = serde_json::from_str(json_str)?;
        return Ok(item);
    }

    Err("Max agent rounds exceeded without a nutrition answer".into())
}

async fn run_agent_api(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    base_url: &str,
    description: String,
) -> Result<NutritionItem, Box<dyn std::error::Error + Send + Sync>> {
    let mut conversation: Vec<(String, String)> = vec![
        ("system".to_string(), SYSTEM_PROMPT.to_string()),
        ("user".to_string(), description),
    ];

    for round in 0..MAX_ROUNDS {
        log::debug!("Agent round {round}");

        let output = call_api(client, api_key, model, base_url, &conversation).await?;
        log::debug!("Model output: {output}");

        let json_str = extract_json(&output).unwrap_or(&output);
        if let Ok(call) = serde_json::from_str::<ToolCall>(json_str) {
            match call.action.as_str() {
                "search_web" if !call.query.is_empty() => {
                    log::info!("Tool call: search_web({:?})", call.query);
                    let result = match crate::tools::search_web(&call.query).await {
                        Ok(r) => format!("Search results for '{}':\n{r}", call.query),
                        Err(e) => {
                            log::warn!("search_web failed: {e}");
                            format!("Search failed: {e}. Estimate from nutritional knowledge instead.")
                        }
                    };
                    conversation.push(("assistant".to_string(), output));
                    conversation.push(("tool".to_string(), result));
                    continue;
                }
                "read_webpage" if !call.url.is_empty() => {
                    log::info!("Tool call: read_webpage({:?})", call.url);
                    let result = match crate::tools::read_webpage(&call.url).await {
                        Ok(r) => format!("Page content from {}:\n{r}", call.url),
                        Err(e) => {
                            log::warn!("read_webpage failed: {e}");
                            format!("Page fetch failed: {e}. Estimate from nutritional knowledge instead.")
                        }
                    };
                    conversation.push(("assistant".to_string(), output));
                    conversation.push(("tool".to_string(), result));
                    continue;
                }
                _ => {}
            }
        }

        // No tool call — final pass requesting pure JSON.
        let mut final_conv = conversation.clone();
        final_conv.push(("assistant".to_string(), output));
        final_conv.push((
            "user".to_string(),
            "Output ONLY the JSON nutrition object. No markdown, no explanation, just the JSON object with all 14 fields.".to_string(),
        ));

        let final_json = call_api(client, api_key, model, base_url, &final_conv).await?;
        log::debug!("Final JSON: {final_json}");

        let json_str = extract_json(&final_json).unwrap_or(&final_json);
        let item: NutritionItem = serde_json::from_str(json_str)?;
        return Ok(item);
    }

    Err("Max agent rounds exceeded without a nutrition answer".into())
}

pub async fn run_agent(
    config: Arc<BackendConfig>,
    description: String,
) -> Result<NutritionItem, Box<dyn std::error::Error + Send + Sync>> {
    match config.as_ref() {
        BackendConfig::Local { backend, model } => {
            run_agent_local(Arc::clone(backend), Arc::clone(model), description).await
        }
        BackendConfig::Api { api_key, model, base_url, client } => {
            run_agent_api(client, api_key, model, base_url, description).await
        }
    }
}
