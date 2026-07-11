use std::ffi::CString;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};

use anyhow::Context as _;
use encoding_rs::UTF_8;
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{LlamaChatMessage, LlamaModel};
use llama_cpp_2::mtmd::{mtmd_default_marker, MtmdBitmap, MtmdContext, MtmdContextParams, MtmdInputText};
use llama_cpp_2::sampling::LlamaSampler;

use crate::{ParsedNutritionFacts, VlmBackend};
use super::{extract_json, NUTRITION_PROMPT, OCR_TRANSCRIBE_PROMPT};

/// A VLM backend for LLaVA-style GGUF models (moondream2, llava-phi3, etc.).
/// Loads the model once and creates fresh contexts per inference call.
pub struct LlavaBackend {
    name: String,
    // model must be declared before backend so it drops first
    model: LlamaModel,
    backend: LlamaBackend,
    mmproj_path: PathBuf,
    n_threads: i32,
}

impl LlavaBackend {
    pub fn new(
        name: impl Into<String>,
        model_path: &Path,
        mmproj_path: &Path,
        n_threads: i32,
    ) -> anyhow::Result<Self> {
        let backend = LlamaBackend::init().context("Failed to init LlamaBackend")?;
        let model_params = LlamaModelParams::default().with_n_gpu_layers(1_000_000);
        let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
            .context("Failed to load GGUF model")?;
        Ok(Self {
            name: name.into(),
            model,
            backend,
            mmproj_path: mmproj_path.to_path_buf(),
            n_threads,
        })
    }
}

impl LlavaBackend {
    /// Runs the model on `image_path` with the given text prompt and returns the raw
    /// generated text (up to 512 tokens, greedy sampling). Shared by `infer` (which
    /// expects JSON back) and `transcribe` (which expects raw label text back).
    fn generate(&self, image_path: &Path, prompt_text: &str) -> anyhow::Result<String> {
        let marker = mtmd_default_marker().to_string();

        // Load vision encoder
        let mtmd_params = MtmdContextParams {
            use_gpu: true,
            print_timings: false,
            n_threads: self.n_threads,
            media_marker: CString::new(marker.clone())?,
            image_min_tokens: -1,
            image_max_tokens: -1,
        };
        let mtmd_ctx = MtmdContext::init_from_file(
            self.mmproj_path.to_str().context("mmproj path not valid UTF-8")?,
            &self.model,
            &mtmd_params,
        )
        .context("Failed to init MtmdContext")?;

        // Create inference context
        let ctx_params = LlamaContextParams::default()
            .with_n_threads(self.n_threads)
            .with_n_batch(1)
            .with_n_ctx(Some(NonZeroU32::new(4096).unwrap()));
        let mut context = self.model
            .new_context(&self.backend, ctx_params)
            .context("Failed to create LlamaContext")?;

        // Load image as bitmap
        let image_str = image_path.to_str().context("Image path not valid UTF-8")?;
        let bitmap = MtmdBitmap::from_file(&mtmd_ctx, image_str, false)
            .context("Failed to load image bitmap")?;

        // Build prompt: image marker + instruction
        let prompt = format!("{marker}{prompt_text}");

        // Try the model's built-in chat template; fall back to raw prompt if the
        // embedded Jinja2 renderer can't handle it (e.g., Gemma 4's template uses
        // features unsupported by llama.cpp's renderer).
        //
        // We tested the canonical Gemma 4 turn-marker format as a fallback but it
        // scored 10/33 vs 14/33 for the raw prompt. For single-turn multimodal
        // extraction the model behaves more like a caption-completion task, where
        // the absence of turn markers outperforms instruction-following mode.
        let formatted = self.model.chat_template(None)
            .ok()
            .and_then(|tmpl| {
                let msg = LlamaChatMessage::new("user".to_string(), prompt.clone()).ok()?;
                self.model.apply_chat_template(&tmpl, &[msg], true).ok()
            })
            .unwrap_or(prompt);

        // Tokenize text + image together
        let input = MtmdInputText {
            text: formatted,
            add_special: true,
            parse_special: true,
        };
        let chunks = mtmd_ctx
            .tokenize(input, &[&bitmap])
            .context("Failed to tokenize input")?;

        // Prefill (eval image + prompt tokens)
        let mut batch = LlamaBatch::new(4096, 1);
        let mut n_past = chunks
            .eval_chunks(&mtmd_ctx, &mut context, 0, 0, 1, true)
            .context("Failed to eval chunks")?;

        // Decode (generate output)
        let mut sampler = LlamaSampler::chain_simple([LlamaSampler::greedy()]);
        let mut output = String::new();
        let mut decoder = UTF_8.new_decoder();

        for _ in 0..512 {
            let token = sampler.sample(&context, -1);
            sampler.accept(token);
            if self.model.is_eog_token(token) {
                break;
            }
            let piece = self.model
                .token_to_piece(token, &mut decoder, true, None)
                .context("token_to_piece failed")?;
            output.push_str(&piece);

            batch.clear();
            batch.add(token, n_past, &[0], true)?;
            n_past += 1;
            context.decode(&mut batch).context("decode failed")?;
        }

        Ok(output)
    }

    /// Uses the model purely as an OCR engine: transcribes the label's visible text and
    /// returns it raw (one line per line of output), without asking for or parsing JSON.
    pub fn transcribe(&self, image_path: &Path) -> anyhow::Result<String> {
        self.generate(image_path, OCR_TRANSCRIBE_PROMPT)
    }
}

impl VlmBackend for LlavaBackend {
    fn name(&self) -> &str {
        &self.name
    }

    fn infer(&self, image_path: &Path) -> anyhow::Result<ParsedNutritionFacts> {
        let output = self.generate(image_path, NUTRITION_PROMPT)?;
        let json_str = extract_json(&output).unwrap_or(output.trim());
        serde_json::from_str::<ParsedNutritionFacts>(json_str)
            .with_context(|| format!("Failed to parse VLM JSON output:\n{output}"))
    }
}
