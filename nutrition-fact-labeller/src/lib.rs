use std::path::Path;

use serde_derive::{Deserialize, Serialize};

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

/// Field names in the same order `field_matches` returns them, for labeling per-field
/// scoring output.
pub const FIELD_NAMES: [&str; 11] = [
    "servings_per_container",
    "serving_size_grams",
    "calories",
    "total_fat_grams",
    "cholesterol_mg",
    "sodium_mg",
    "total_carbohydrates_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
    "protein_g",
];

pub const FIELD_COUNT: usize = FIELD_NAMES.len();

impl ParsedNutritionFacts {
    /// Per-field exact-match comparison against `expected`, in `FIELD_NAMES` order.
    /// Whole-record exact match (`==`) requires all 11 fields correct simultaneously,
    /// which understates real accuracy for models that get most fields right but rarely
    /// all of them at once — this backs the "all fields" partial-credit score alongside
    /// whole-record pass/fail. See eval-results/README.md's Results table.
    pub fn field_matches(&self, expected: &ParsedNutritionFacts) -> [bool; FIELD_COUNT] {
        [
            self.servings_per_container == expected.servings_per_container,
            self.serving_size_grams == expected.serving_size_grams,
            self.calories == expected.calories,
            self.total_fat_grams == expected.total_fat_grams,
            self.cholesterol_mg == expected.cholesterol_mg,
            self.sodium_mg == expected.sodium_mg,
            self.total_carbohydrates_g == expected.total_carbohydrates_g,
            self.dietary_fiber_g == expected.dietary_fiber_g,
            self.total_sugars_g == expected.total_sugars_g,
            self.added_sugars_g == expected.added_sugars_g,
            self.protein_g == expected.protein_g,
        ]
    }
}

/// Accumulates per-field correct counts across a set of cases for "all fields"
/// partial-credit scoring. A case that fails to parse at all (see `record_miss`) still
/// counts toward the denominator but contributes zero correct fields — a conservative
/// lower bound, since some parse failures do contain recoverable values (e.g. 10 of 11
/// fields valid, one field malformed) that this doesn't credit.
#[derive(Default, Clone)]
pub struct FieldScore {
    pub correct: [usize; FIELD_COUNT],
    pub total_cases: usize,
}

impl FieldScore {
    pub fn record(&mut self, matches: [bool; FIELD_COUNT]) {
        for (i, m) in matches.iter().enumerate() {
            if *m {
                self.correct[i] += 1;
            }
        }
        self.total_cases += 1;
    }

    /// Records a case that couldn't be scored at all (e.g. the model's output failed to
    /// parse into `ParsedNutritionFacts`). Still counts toward the denominator.
    pub fn record_miss(&mut self) {
        self.total_cases += 1;
    }

    pub fn total_correct(&self) -> usize {
        self.correct.iter().sum()
    }

    pub fn total_fields(&self) -> usize {
        self.total_cases * FIELD_COUNT
    }

    pub fn percent(&self) -> f64 {
        if self.total_fields() == 0 {
            0.0
        } else {
            100.0 * self.total_correct() as f64 / self.total_fields() as f64
        }
    }
}

/// Prints the "all fields" partial-credit summary line and per-field breakdown for one
/// model's `FieldScore`. Shared by `vlm_benchmark` and `vlm_benchmark_api` so both
/// harnesses report this the same way.
pub fn print_field_score(score: &FieldScore) {
    println!(
        "  All-fields: {}/{} ({:.1}%) — prioritize this over whole-record pass/fail",
        score.total_correct(),
        score.total_fields(),
        score.percent(),
    );
    print!("  Per-field:  ");
    for (i, field) in FIELD_NAMES.iter().enumerate() {
        print!("{field}={}/{} ", score.correct[i], score.total_cases);
    }
    println!();
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
