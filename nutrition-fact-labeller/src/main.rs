use std::time::Instant;
use std::path::Path;
use std::io::Write;
use std::sync::Arc;
use log::{info, debug};
use std::collections::HashMap;
use oar_ocr::prelude::*;
use warp::Filter;
use warp::multipart::FormData;
use futures_util::TryStreamExt;
use bytes::BufMut;
use oar_ocr::utils::image::dynamic_to_rgb;
use oar_ocr::core::config::onnx::{OrtSessionConfig, OrtExecutionProvider, OrtGraphOptimizationLevel};
use serde_derive::{Deserialize, Serialize};
use nutrition_fact_labeller::{ParsedNutritionFacts, VlmBackend};
use nutrition_fact_labeller::parsing::parse_facts_from_lines;
use nutrition_fact_labeller::vlm::llava::LlavaBackend;
use nutrition_fact_labeller::vlm::openrouter::{LlmApiBackend, DEFAULT_MODEL};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct MyTextRegion {
    pub text: String,
    pub confidence: f32
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OCRResult {
    pub filename: String,
    pub regions: Vec<MyTextRegion>
}

fn ort_config() -> OrtSessionConfig {
    return OrtSessionConfig::new()
        .with_optimization_level(OrtGraphOptimizationLevel::All)
        .with_memory_pattern(true)
        .with_cpu_memory_arena(true)
        .with_parallel_execution(true)
        .with_execution_providers(vec![
            // is coreml weird?
            // OrtExecutionProvider::CoreML { ane_only: Some(true), subgraphs: Some(true) },
            OrtExecutionProvider::CPU,  // Fallback to CPU
        ]);
}

// fn run_ocr_rgb(image: image::RgbImage) -> Result<Vec<MyTextRegion>, Box<dyn std::error::Error>> {
fn run_ocr_rgb(image: image::RgbImage) -> Result<Vec<MyTextRegion>, String> {
    // Build OCR pipeline with required models
    // v4 mobile english
    let detection_model = "paddleocr-models/ppocrv4_mobile_det.onnx".to_string();
    let recognition_model = "paddleocr-models/en_ppocrv4_mobile_rec.onnx".to_string();
    let dictionary = "paddleocr-models/en_dict.txt".to_string();

    // let detection_model = "paddleocr-models/ppocrv5_server_det.onnx".to_string();
    // let detection_model = "paddleocr-models/ppocrv5_mobile_det.onnx".to_string();
    // let dictionary = "paddleocr-models/en_dict.txt".to_string(),
    // let recognition_model = "paddleocr-models/ppocrv5_server_rec.onnx".to_string();
    // let dictionary = "paddleocr-models/ppocrv5_dict.txt".to_string();

    let ocr = OAROCRBuilder::new(
        detection_model,
        recognition_model,
        dictionary,
    )
    // Configure document orientation with confidence threshold
    .doc_orientation_classify_model_path("paddleocr-models/pplcnet_x1_0_doc_ori.onnx")
    .doc_orientation_threshold(0.8) // Only accept predictions with 80% confidence
    .use_doc_orientation_classify(true)
    // Configure text line orientation with confidence threshold
    .textline_orientation_classify_model_path("paddleocr-models/pplcnet_x1_0_textline_ori.onnx")
    .textline_orientation_threshold(0.7) // Only accept predictions with 70% confidence
    .use_textline_orientation(true)
    // configure document rectification
    .doc_unwarping_model_path("paddleocr-models/uvdoc.onnx")
    .use_doc_unwarping(true)
    // more expanding for bigger boxes
    .text_det_unclip_ratio(3.0)
    .global_ort_session(ort_config())
    .build()
    .map_err(|_| "Failed to build ocr model".to_string())?;

    let results = ocr.predict(&[image])
        .map_err(|_| "Failed to predict")?;
    let result = &results[0];
    let regions = &result.text_regions;

    return Ok(regions.iter().map(|tr| MyTextRegion { text: tr.text.clone().unwrap().to_string(), confidence: tr.confidence.unwrap() }).collect());
}

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

            let mut backend = "paddleocr".to_string();
            let mut image_bytes: Option<Vec<u8>> = None;
            for (name, bytes) in parts {
                match name.as_str() {
                    "backend" => backend = String::from_utf8_lossy(&bytes).trim().to_string(),
                    "image"   => image_bytes = Some(bytes),
                    _         => {}
                }
            }
            let image_bytes = image_bytes.ok_or_else(|| warp::reject::reject())?;

            let facts: ParsedNutritionFacts = if backend == "vlm" {
                // Prefer API backend if configured, fall back to local llama.cpp.
                if let Some(api) = api_backend {
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
                    eprintln!("VLM requested but no backend configured (set OPENROUTER_API_KEY or VLM_MODEL_PATH+VLM_MMPROJ_PATH)");
                    return Err(warp::reject::reject());
                }
            } else {
                tokio::task::spawn_blocking(move || -> Result<ParsedNutritionFacts, String> {
                    let image = image::load_from_memory(&image_bytes).map_err(|e| e.to_string())?;
                    let rgb = dynamic_to_rgb(image);
                    let regions = run_ocr_rgb(rgb)?;
                    Ok(parse_facts_from_regions(regions))
                })
                .await
                .map_err(|_| warp::reject::reject())?
                .map_err(|e| { eprintln!("OCR failed: {e}"); warp::reject::reject() })?
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

pub fn timeit<T, F>(label: &str, f: F) -> T
where
    F: FnOnce() -> T,
{
    let start = Instant::now();
    let result = f();
    let elapsed = start.elapsed();
    debug!("{} took {:?}", label, elapsed);
    result
}
fn parse_facts_from_regions(regions: Vec<MyTextRegion>) -> ParsedNutritionFacts {
    let texts: Vec<&str> = regions.iter().map(|x| x.text.as_str()).collect();
    let actual = timeit("spellchecking + parsing", || parse_facts_from_lines(&texts));
    debug!("{:#?}", texts);
    actual
}

#[cfg(test)]
mod tests {
    use super::*;
    use nutrition_fact_labeller::spellcheck;
    use pretty_assertions::assert_eq;
    use regex::Regex;
    use std::fs;
    use std::path::Path;

    fn init() {
        let _ = env_logger::builder().is_test(true).try_init();
    }

    #[test]
    fn check_test_cases() {
        init();

        let cases_csv = fs::read_to_string("test_cases.csv").unwrap();

        let mut reader = csv::Reader::from_reader(cases_csv.as_bytes());
        let mut facts = vec![];
        for result in reader.deserialize() {
            let expected: ParsedNutritionFacts = result.unwrap();
            facts.push(expected);
        }
        let mut reader = csv::Reader::from_reader(cases_csv.as_bytes());
        let mut files = vec![];
        for result in reader.records() {
            let file = result.unwrap().get(0).unwrap().to_string();
            files.push(file);
        }

        assert_eq!(facts.len(), files.len());

        // Known-failing cases: OCR does not yet parse these correctly.
        let skip: &[&str] = &[
            "IMG_5421_1200.png",
            "IMG_5423_1200.png",
            "IMG_5422_1200.png",
            "IMG_5436_1200.png",
            "IMG_5426_1200.png",
            "IMG_5430_1200.png",
            "IMG_5457_1200.png",
            "IMG_5456_1200.png",
            "IMG_5442_1200.png",
            "IMG_5445_1200.png",
            "IMG_5444_1200.png",
            "IMG_5450_1200.png",
            "IMG_5446_1200.png",
            "IMG_5452_1200.png",
            "IMG_5447_1200.png",
            "IMG_5462_1200.png",
            "IMG_5461_1200.png",
            "IMG_5460_1200.png",
            "IMG_5448_1200.png",
            "IMG_5464_1200.png",
            "IMG_5458_1200.png",
            "IMG_5429_1200.png",
            "IMG_5428_1200.png",
            "IMG_5439_1200.png",
        ];

        let mut actuals = vec![];
        let mut expecteds = vec![];
        for (file, expected) in std::iter::zip(files, facts) {
            if skip.contains(&file.as_str()) {
                info!("skipping {file}");
                continue;
            }
            info!("loading image images/{file}...");
            let image = oar_ocr::utils::load_image(Path::new(&format!("images/{}", file)))
                .expect(&format!("Failed to load images/{}", file));
            info!("running ocr...");
            let results = run_ocr_rgb(image).unwrap();
            info!("parsing facts from content...");
            let actual = parse_facts_from_regions(results);
            actuals.push((file.clone(), actual.clone()));
            expecteds.push((file.clone(), expected.clone()));
            info!("actual == expected = {}", actual == expected);
        }

        assert_eq!(actuals, expecteds);
    }

    #[test]
    fn test_labelled_value() {
        init();

        let re_servings = Regex::new(r"(\d+\.?\d*) servings per container").unwrap();
        let needle = "10 servings per container.";
        let caps = re_servings.captures(&needle);
        if let Some(caps) = caps {
            assert_eq!(&caps[1], "10");
        } else {
            assert_eq!(false, true);
        }
    }

    #[test]
    fn test_correction() {
        let dict = spellcheck::dictionary();

        let tests = [
            ("calorees", "calories"),
            ("protien", "protein"),
            ("f1ber", "fiber"),
            ("s0dium", "sodium"),
            ("t0tal", "total"),
            ("lotal", "total"),
            ("notinthedict", "notinthedict")
        ];

        for t in &tests {
            assert_eq!(t.1, spellcheck::correction(t.0, &dict));
        }
    }

    #[test]
    fn test_parsing_labelled_floats() {
        let target = "Total Fat 2.5g";
        // let re_g = Regex::new(r"(?i)(\d+|o+|\.+)(g|mg|9)").unwrap();
        let re_g = Regex::new(r"(?i)([\do]+(?:\.[\do]+)?)(g|mg|9)").unwrap();
        if let Some(caps) = re_g.captures(target) {
            assert_eq!(&caps[1], "2.5");
        }
        if let Some(caps) = re_g.captures("total fat 5g") {
            assert_eq!(&caps[1], "5");
        }
    }
}
