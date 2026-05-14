use clap::Parser;
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use warp::Filter;

use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;

mod agent;
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
    /// Backend to use: 'local' (llama.cpp + GEMMA_MODEL_PATH) or 'openrouter'
    /// (OPENROUTER_API_KEY). When omitted, defaults to openrouter if
    /// OPENROUTER_API_KEY is set, then local if GEMMA_MODEL_PATH is set.
    #[arg(long, value_enum)]
    mode: Option<CliMode>,
}

#[derive(Clone, clap::ValueEnum)]
enum CliMode {
    Local,
    Openrouter,
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

fn build_config(mode: Option<CliMode>) -> Arc<agent::BackendConfig> {
    let openrouter_key = std::env::var("OPENROUTER_API_KEY").ok();
    let model_path = std::env::var("GEMMA_MODEL_PATH").ok();

    match mode {
        Some(CliMode::Openrouter) => {
            let key = openrouter_key.unwrap_or_else(|| {
                eprintln!("--mode openrouter requires OPENROUTER_API_KEY to be set");
                std::process::exit(1);
            });
            info!("Using OpenRouter backend (google/gemma-4-31b-it:free)");
            Arc::new(agent::BackendConfig::OpenRouter {
                api_key: key,
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
            if let Some(key) = openrouter_key {
                info!("Auto-selected OpenRouter backend (OPENROUTER_API_KEY is set)");
                Arc::new(agent::BackendConfig::OpenRouter {
                    api_key: key,
                    client: reqwest::Client::new(),
                })
            } else if let Some(path) = model_path {
                info!("Auto-selected local model backend (GEMMA_MODEL_PATH is set)");
                load_local_model(path)
            } else {
                eprintln!(
                    "No backend configured. Either:\n  \
                     - Set OPENROUTER_API_KEY to use OpenRouter (google/gemma-4-31b-it:free)\n  \
                     - Set GEMMA_MODEL_PATH to use the local Gemma model\n  \
                     - Pass --mode local|openrouter to force a specific backend"
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
        .and(warp::body::json())
        .and(state_filter)
        .and_then(handle_lookup);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3031);

    info!("Listening on port {port}");
    warp::serve(lookup).run(([0, 0, 0, 0], port)).await;
}

async fn handle_lookup(
    req: LookupRequest,
    state: Arc<AppState>,
) -> Result<impl warp::Reply, warp::Rejection> {
    let reply = match agent::run_agent(Arc::clone(&state.config), req.description).await {
        Ok(item) => warp::reply::with_status(
            warp::reply::json(&LookupResponse { item }),
            warp::http::StatusCode::OK,
        ),
        Err(e) => {
            log::error!("Agent error: {e}");
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
