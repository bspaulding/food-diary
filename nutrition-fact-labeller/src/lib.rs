use std::path::Path;

use serde_derive::{Deserialize, Serialize};

pub mod parsing;
pub mod spellcheck;
pub mod vlm;

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

/// Load test cases from a CSV file. Returns `(filename, expected_facts)` pairs.
pub fn load_test_cases(csv_path: &str) -> Vec<(String, ParsedNutritionFacts)> {
    let content = std::fs::read_to_string(csv_path)
        .unwrap_or_else(|e| panic!("Failed to read {csv_path}: {e}"));
    let mut facts_reader = csv::Reader::from_reader(content.as_bytes());
    let facts: Vec<ParsedNutritionFacts> = facts_reader
        .deserialize()
        .map(|r: Result<ParsedNutritionFacts, _>| r.expect("Failed to deserialize CSV row"))
        .collect();
    let mut files_reader = csv::Reader::from_reader(content.as_bytes());
    let files: Vec<String> = files_reader
        .records()
        .map(|r| r.expect("Failed to read CSV record").get(0).unwrap().to_string())
        .collect();
    assert_eq!(facts.len(), files.len(), "CSV row count mismatch");
    files.into_iter().zip(facts).collect()
}

pub trait VlmBackend {
    fn name(&self) -> &str;
    fn infer(&self, image_path: &Path) -> anyhow::Result<ParsedNutritionFacts>;
}
