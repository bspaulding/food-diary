use clap::Parser;
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use warp::Filter;

use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;

mod agent;
mod auth;
mod tools;

#[derive(Deserialize)]
struct LookupRequest {
    description: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct NutritionItem {
    pub description: String,
    pub calories: f64,
    pub total_fat_grams: f64,
    pub saturated_fat_grams: f64,
    pub trans_fat_grams: f64,
    pub polyunsaturated_fat_grams: f64,
    pub monounsaturated_fat_grams: f64,
    pub cholesterol_milligrams: f64,
    pub sodium_milligrams: f64,
    pub total_carbohydrate_grams: f64,
    pub dietary_fiber_grams: f64,
    pub total_sugars_grams: f64,
    pub added_sugars_grams: f64,
    pub protein_grams: f64,
}

#[derive(Serialize)]
struct LookupResponse {
    item: NutritionItem,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

pub struct AppState {
    pub config: Arc<agent::BackendConfig>,
}

#[derive(Parser)]
#[command(about = "LLM-powered nutrition lookup API")]
struct Args {
    /// Backend to use: 'local' (llama.cpp + GEMMA_MODEL_PATH) or 'api'
    /// (LLM_API_KEY). When omitted, defaults to api if LLM_API_KEY is set,
    /// then local if GEMMA_MODEL_PATH is set.
    #[arg(long, value_enum)]
    mode: Option<CliMode>,
}

#[derive(Clone, clap::ValueEnum)]
enum CliMode {
    Local,
    Api,
}

fn load_local_model(path: String) -> Arc<agent::BackendConfig> {
    info!("Loading local model from {path}");
    let backend = LlamaBackend::init().expect("Failed to initialize llama backend");
    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, &path, &model_params)
        .expect("Failed to load model");
    info!("Local model loaded successfully");
    Arc::new(agent::BackendConfig::Local {
        backend: Arc::new(backend),
        model: Arc::new(model),
    })
}

const DEFAULT_LLM_MODEL: &str = "gemini-2.0-flash";
const DEFAULT_LLM_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";

fn build_config(mode: Option<CliMode>) -> Arc<agent::BackendConfig> {
    let llm_key = std::env::var("LLM_API_KEY")
        .or_else(|_| std::env::var("OPENROUTER_API_KEY"))
        .ok();
    let llm_model = std::env::var("LLM_MODEL")
        .or_else(|_| std::env::var("OPENROUTER_MODEL"))
        .unwrap_or_else(|_| DEFAULT_LLM_MODEL.to_string());
    let llm_base_url = std::env::var("LLM_BASE_URL")
        .or_else(|_| std::env::var("OPENROUTER_BASE_URL"))
        .unwrap_or_else(|_| DEFAULT_LLM_BASE_URL.to_string());
    let model_path = std::env::var("GEMMA_MODEL_PATH").ok();

    match mode {
        Some(CliMode::Api) => {
            let key = llm_key.unwrap_or_else(|| {
                eprintln!("--mode api requires LLM_API_KEY to be set");
                std::process::exit(1);
            });
            info!("Using LLM API backend ({llm_model} at {llm_base_url})");
            Arc::new(agent::BackendConfig::Api {
                api_key: key,
                model: llm_model,
                base_url: llm_base_url,
                client: reqwest::Client::new(),
            })
        }
        Some(CliMode::Local) => {
            let path = model_path.unwrap_or_else(|| {
                eprintln!("--mode local requires GEMMA_MODEL_PATH to be set");
                std::process::exit(1);
            });
            load_local_model(path)
        }
        None => {
            if let Some(key) = llm_key {
                info!("Auto-selected LLM API backend ({llm_model} at {llm_base_url})");
                Arc::new(agent::BackendConfig::Api {
                    api_key: key,
                    model: llm_model,
                    base_url: llm_base_url,
                    client: reqwest::Client::new(),
                })
            } else if let Some(path) = model_path {
                info!("Auto-selected local model backend (GEMMA_MODEL_PATH is set)");
                load_local_model(path)
            } else {
                eprintln!(
                    "No backend configured. Either:\n  \
                     - Set LLM_API_KEY to use an OpenAI-compatible API (default model: {DEFAULT_LLM_MODEL})\n  \
                     - Set GEMMA_MODEL_PATH to use the local Gemma model\n  \
                     - Pass --mode local|api to force a specific backend\n  \
                     - Set LLM_MODEL to override the model name\n  \
                     - Set LLM_BASE_URL to override the API endpoint (default: {DEFAULT_LLM_BASE_URL})"
                );
                std::process::exit(1);
            }
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();
    let args = Args::parse();

    let config = build_config(args.mode);

    let state = Arc::new(AppState { config });
    let state_filter = warp::any().map(move || Arc::clone(&state));

    let lookup = warp::post()
        .and(warp::path("lookup"))
        .and(auth::require_auth())
        .and(warp::body::json())
        .and(state_filter)
        .and_then(handle_lookup)
        .recover(auth::handle_rejection);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3031);

    info!("Listening on port {port}");
    warp::serve(lookup).run(([0, 0, 0, 0], port)).await;
}

static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

async fn handle_lookup(
    req: LookupRequest,
    state: Arc<AppState>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
    info!("[{request_id}] Lookup request: {:?}", req.description);
    let started = std::time::Instant::now();
    let description = req.description.clone();

    let reply = match agent::run_agent(Arc::clone(&state.config), request_id, req.description).await {
        Ok(item) => {
            info!(
                "[{request_id}] Lookup succeeded: {description:?} ({:.1}s)",
                started.elapsed().as_secs_f64()
            );
            warp::reply::with_status(
                warp::reply::json(&LookupResponse { item }),
                warp::http::StatusCode::OK,
            )
        }
        Err(e) => {
            log::error!(
                "[{request_id}] Lookup failed: {description:?} ({:.1}s): {e}",
                started.elapsed().as_secs_f64()
            );
            warp::reply::with_status(
                warp::reply::json(&ErrorResponse {
                    error: e.to_string(),
                }),
                warp::http::StatusCode::INTERNAL_SERVER_ERROR,
            )
        }
    };
    Ok(reply)
}
