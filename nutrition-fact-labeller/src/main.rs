use std::time::Instant;
use log::{info, debug};
use std::collections::HashMap;
use serde_derive::{Deserialize, Serialize};
use oar_ocr::prelude::*;
use warp::Filter;
use warp::multipart::FormData;
use futures_util::TryStreamExt;
use bytes::BufMut;
use oar_ocr::utils::image::dynamic_to_rgb;
use oar_ocr::core::config::onnx::{OrtSessionConfig, OrtExecutionProvider, OrtGraphOptimizationLevel};
mod spellcheck;

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

    // GET /hello/warp => 200 OK with body "Hello, warp!"
    // let hello = warp::path!("hello" / String)
    //     .map(|name| format!("Hello, {}!", name));

    let upload = warp::multipart::form()
        .and_then(|form: FormData| async move {
        let field_names: Vec<_> = form
            .and_then(|mut field| async move {
                let mut bytes: Vec<u8> = Vec::new();

                // field.data() only returns a piece of the content, you should call over it until it replies None
                while let Some(content) = field.data().await {
                    let content = content.unwrap();
                    bytes.put(content);
                }
                let image = image::load_from_memory(&bytes).unwrap();
                let rgb_image = dynamic_to_rgb(image);
                let trs = run_ocr_rgb(rgb_image);
                Ok((
                    field.name().to_string(),
                    OCRResult {
                        filename: field.filename().unwrap().to_string(),
                        regions: trs.unwrap()
                    }
                ))
            })
            .try_collect()
            .await
            .unwrap();

        let mut map = HashMap::new();
        for field in field_names {
            map.insert(field.0, parse_facts_from_regions(field.1.regions));
        }

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
    let dictionary = spellcheck::dictionary();
    let spellchecked: Vec<String> = timeit("spellchecking", || {
        texts.iter().map(|s| s.split_whitespace().map(|w: &str| {
            spellcheck::correction(&w, &dictionary)
        }).collect::<Vec<&str>>().join(" ")).collect()
    });
    debug!("{:#?}", std::iter::zip(texts.clone(), spellchecked.clone()).collect::<Vec<(&str, String)>>());
    return parse_facts(spellchecked.iter().map(|s| s.as_str()).collect());
}

use regex::Regex;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ParsedNutritionFacts {
    pub servings_per_container: Option<f64>,
    pub serving_size_grams: Option<f64>,
    pub calories: Option<i32>,
    pub total_fat_grams: Option<f64>,
    pub cholesterol_mg: Option<f64>,
    pub sodium_mg: Option<f64>,
    pub total_carbohydrates_g: Option<f64>,
    pub dietary_fiber_g: Option<f64>,
    pub total_sugars_g: Option<f64>,
    pub added_sugars_g: Option<f64>,
    pub protein_g: Option<f64>,
}

#[derive(Debug, Serialize)]
struct LabelledValue {
    label: String,
    value: String,
    unit: Option<String>,
}

// Helper to find a value by label predicate
fn find_labelled_value<T, F, C>(
    xs: &[LabelledValue],
    flabel: F,
    convert: C,
) -> Option<T>
where
    F: Fn(&str) -> bool,
    C: Fn(&str) -> Option<T>,
{
    xs.iter()
        .find(|x| flabel(&x.label))
        .and_then(|x| convert(&x.value))
}

// Label matchers
fn starts_with<'a>(target: &'a str) -> impl Fn(&str) -> bool + 'a {
    move |label: &str| label.starts_with(target)
}

fn ends_with<'a>(target: &'a str) -> impl Fn(&str) -> bool + 'a {
    move |label: &str| label.ends_with(target)
}

fn contains<'a>(target: &'a str) -> impl Fn(&str) -> bool + 'a {
    move |label: &str| label.contains(target)
}

pub fn parse_facts(content: Vec<&str>) -> ParsedNutritionFacts {
    // sometimes "xg" is read as "x9"
    let re_g = Regex::new(r"(?i)([\do]+(?:\.[\do]+)?)(g|mg|9)").unwrap();
    let re_servings = Regex::new(r"(\d+\.?\d*) servings per container").unwrap();

    let mut results: Vec<LabelledValue> = Vec::new();

    for i in 0..content.len().saturating_sub(1) {
        let line = content[i];

        // Match "123g" or "123mg"
        if let Some(caps) = re_g.captures(line) {
            results.push(LabelledValue {
                label: line.to_lowercase().trim().to_string(),
                // sometimes 0 is read as O, so we allow it in the regex above and replace it back
                value: caps[1].to_string().replace("O", "0").replace("o", "0"),
                unit: Some(caps[2].to_string()),
            });
            continue;
        }

        // sometimes we get including xg / added sugars broken up
        if content[i].eq_ignore_ascii_case("added sugars") {
            if let Some(lvalue) = results.pop() {
                let previous_label = lvalue.label;
                results.push(LabelledValue {
                    label: format!("{previous_label} added sugars"),
                    value: lvalue.value,
                    unit: lvalue.unit
                });
            }
            continue;
        }

        // sometimes we get serving size _after_ the labelled value
        if content[i].eq_ignore_ascii_case("serving size") {
            if let Some(lvalue) = results.pop() {
                let previous_label = lvalue.label;
                results.push(LabelledValue {
                    label: format!("serving size {previous_label}"),
                    value: lvalue.value,
                    unit: lvalue.unit
                });
            }
            continue;
        }

        // Match "X servings per container"
        if let Some(caps) = re_servings.captures(line) {
            results.push(LabelledValue {
                label: line.to_lowercase().replace(".", ""),
                value: caps[1].to_string(),
                unit: None,
            });
        }
    }

    for i in 0..content.len().saturating_sub(1) {
        // Match "Calories <number>" using zip(content, content[1:])
        if content[i].eq_ignore_ascii_case("calories") {
            // did we get Calories, N or N, Calories?
            let is_after: bool = content[i + 1].chars().all(|c| c.is_numeric());
            if is_after {
                let value = content[i + 1];
                results.push(LabelledValue {
                    label: format!("{} {}", content[i], value).to_lowercase(),
                    value: value.to_string(),
                    unit: None,
                });
            } else {
                // include an inverse pair in case we get 130, Calories
                let value = content[i - 1];
                results.push(LabelledValue {
                    label: format!("{} {}", content[i], value).to_lowercase(),
                    value: value.to_string(),
                    unit: None,
                });
            }
            continue;
        }
    }

    debug!("{:#?}", results);

    ParsedNutritionFacts {
        servings_per_container: find_labelled_value(&results, ends_with("servings per container"), |s| s.parse::<f64>().ok()),
        serving_size_grams: find_labelled_value(&results, starts_with("serving size"), |s| s.parse::<f64>().ok()),
        calories: find_labelled_value(&results, starts_with("calories"), |s| s.parse::<i32>().ok()),
        total_fat_grams: find_labelled_value(&results, starts_with("total fat"), |s| s.parse::<f64>().ok()),
        cholesterol_mg: find_labelled_value(&results, starts_with("cholesterol"), |s| s.parse::<f64>().ok()),
        sodium_mg: find_labelled_value(&results, starts_with("sodium"), |s| s.parse::<f64>().ok()),
        total_carbohydrates_g: find_labelled_value(&results, starts_with("total carbohydrate"), |s| s.parse::<f64>().ok()),
        dietary_fiber_g: find_labelled_value(&results, starts_with("dietary fiber"), |s| s.parse::<f64>().ok()),
        total_sugars_g: find_labelled_value(&results, starts_with("total sugars"), |s| s.parse::<f64>().ok()),
        added_sugars_g: find_labelled_value(&results, contains("added sugars"), |s| s.parse::<f64>().ok()),
        protein_g: find_labelled_value(&results, starts_with("protein"), |s| s.parse::<f64>().ok()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;
    use std::fs;

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
        assert_eq!(facts.len(), 34);

        let mut reader = csv::Reader::from_reader(cases_csv.as_bytes());
        let mut files = vec![];
        for result in reader.records() {
            let file = result.unwrap().get(0).unwrap().to_string();
            files.push(file);
        }

        assert_eq!(files.len(), 34);

        let mut actuals = vec![];
        let mut expecteds = vec![];
        for (file, expected) in std::iter::zip(files, facts) {
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
            assert_eq!((file.clone(), actual), (file.clone(), expected));
        }

        // let num_correct = std::iter::zip(actuals.clone(), expecteds.clone()).filter(|p| p.0 == p.1).count();
        // print!("Got {num_correct} out of {}", actuals.len());
        // assert_eq!(actuals, expecteds);
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
