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
    pub backend: Arc<LlamaBackend>,
    pub model: Arc<LlamaModel>,
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let model_path = std::env::var("GEMMA_MODEL_PATH")
        .expect("GEMMA_MODEL_PATH must be set to the path of the Gemma 4 E2B GGUF file");

    info!("Loading model from {model_path}");
    let backend = LlamaBackend::init().expect("Failed to initialize llama backend");
    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, &model_path, &model_params)
        .expect("Failed to load model");
    info!("Model loaded successfully");

    let state = Arc::new(AppState {
        backend: Arc::new(backend),
        model: Arc::new(model),
    });

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
    let reply = match agent::run_agent(
        Arc::clone(&state.backend),
        Arc::clone(&state.model),
        req.description,
    )
    .await
    {
        Ok(item) => {
            warp::reply::with_status(
                warp::reply::json(&LookupResponse { item }),
                warp::http::StatusCode::OK,
            )
        }
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
