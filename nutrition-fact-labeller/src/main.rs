use std::path::Path;
use std::io::Write;
use std::sync::Arc;
use log::info;
use std::collections::HashMap;
use warp::Filter;
use warp::multipart::FormData;
use futures_util::TryStreamExt;
use bytes::BufMut;
use nutrition_fact_labeller::{ParsedNutritionFacts, VlmBackend};
use nutrition_fact_labeller::vlm::llava::LlavaBackend;
use nutrition_fact_labeller::vlm::openrouter::{LlmApiBackend, DEFAULT_MODEL};

#[tokio::main]
async fn main() {
    env_logger::init();

    // Optionally load VLM backend at startup. Requires VLM_MODEL_PATH and
    // VLM_MMPROJ_PATH env vars pointing to GGUF files.
    let vlm: Option<Arc<LlavaBackend>> = {
        let model_path = std::env::var("VLM_MODEL_PATH").ok();
        let mmproj_path = std::env::var("VLM_MMPROJ_PATH").ok();
        match (model_path, mmproj_path) {
            (Some(m), Some(p)) => {
                info!("Loading VLM model from {m}");
                match LlavaBackend::new("gemma-4-e2b", Path::new(&m), Path::new(&p), 4) {
                    Ok(b) => {
                        info!("VLM loaded");
                        Some(Arc::new(b))
                    }
                    Err(e) => {
                        eprintln!("Warning: failed to load VLM: {e}");
                        None
                    }
                }
            }
            _ => {
                info!("VLM disabled (set VLM_MODEL_PATH and VLM_MMPROJ_PATH to enable)");
                None
            }
        }
    };

    let api_backend: Option<Arc<LlmApiBackend>> = {
        let api_key = std::env::var("LLM_API_KEY")
            .or_else(|_| std::env::var("OPENROUTER_API_KEY"))
            .ok();
        match api_key {
            Some(key) => {
                let model = std::env::var("LLM_MODEL")
                    .or_else(|_| std::env::var("OPENROUTER_MODEL"))
                    .unwrap_or_else(|_| DEFAULT_MODEL.to_string());
                info!("LLM API VLM backend enabled with model {model}");
                Some(Arc::new(LlmApiBackend::new(key, model)))
            }
            None => {
                info!("LLM API disabled (set LLM_API_KEY to enable)");
                None
            }
        }
    };

    let vlm_filter = {
        let vlm = vlm.clone();
        warp::any().map(move || vlm.clone())
    };
    let api_filter = {
        let api_backend = api_backend.clone();
        warp::any().map(move || api_backend.clone())
    };

    let upload = vlm_filter
        .and(api_filter)
        .and(warp::multipart::form().max_length(50 * 1024 * 1024))
        .and_then(|vlm: Option<Arc<LlavaBackend>>, api_backend: Option<Arc<LlmApiBackend>>, form: FormData| async move {
            // Drain all multipart parts into memory before dispatching.
            let parts: Vec<(String, Vec<u8>)> = form
                .and_then(|mut part| async move {
                    let name = part.name().to_string();
                    let mut bytes: Vec<u8> = Vec::new();
                    while let Some(chunk) = part.data().await {
                        bytes.put(chunk?);
                    }
                    Ok((name, bytes))
                })
                .try_collect()
                .await
                .map_err(|_| warp::reject::reject())?;

            let mut image_bytes: Option<Vec<u8>> = None;
            for (name, bytes) in parts {
                if name == "image" {
                    image_bytes = Some(bytes);
                }
            }
            let image_bytes = image_bytes.ok_or_else(|| warp::reject::reject())?;

            // Prefer the API backend (OpenRouter Gemma-4-31B by default, see
            // openrouter.rs's DEFAULT_MODEL/DEFAULT_BASE_URL) if configured, fall back
            // to local llama.cpp — see eval-results/README.md Known Issues #13.
            let facts: ParsedNutritionFacts = if let Some(api) = api_backend {
                api.infer(&image_bytes)
                    .await
                    .map_err(|e| { eprintln!("LLM API VLM failed: {e}"); warp::reject::reject() })?
            } else if let Some(vlm_backend) = vlm {
                tokio::task::spawn_blocking(move || -> anyhow::Result<ParsedNutritionFacts> {
                    // VLM infer() takes a path, so write to a temp file.
                    let mut tmp_path = std::env::temp_dir();
                    tmp_path.push(format!(
                        "labeller_{}.jpg",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_nanos()
                    ));
                    std::fs::File::create(&tmp_path)?.write_all(&image_bytes)?;
                    let result = vlm_backend.infer(&tmp_path);
                    std::fs::remove_file(&tmp_path).ok();
                    result
                })
                .await
                .map_err(|_| warp::reject::reject())?
                .map_err(|e| { eprintln!("VLM inference failed: {e}"); warp::reject::reject() })?
            } else {
                eprintln!("No VLM backend configured (set OPENROUTER_API_KEY or VLM_MODEL_PATH+VLM_MMPROJ_PATH)");
                return Err(warp::reject::reject());
            };

            let mut map = HashMap::new();
            map.insert("image", facts);
            Ok::<_, warp::Rejection>(warp::reply::json(&map))
        });

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse::<u16>().ok()).unwrap_or(3030);
    info!("running and listening on {port}");

    let server = warp::serve(upload)
        .bind(([0, 0, 0, 0], port))
        .await
        .run();

    tokio::select! {
        _ = server => {},
        _ = tokio::signal::ctrl_c() => {
            println!("Shutting down...");
        },
    }
}

