use regex::Regex;

use crate::spellcheck;
use crate::ParsedNutritionFacts;

#[derive(Debug)]
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

/// Parses lines of label text (e.g. one per detected OCR text region, or one per
/// transcribed line from a VLM) into structured nutrition facts using label/value
/// regex matching. Does not spellcheck — see `parse_facts_from_lines` for that.
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

    log::debug!("{:#?}", results);

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

/// Spellchecks each word of each line against the fixed nutrition-label dictionary, then
/// parses the corrected lines with `parse_facts`. Shared by the PaddleOCR backend (one line
/// per detected text region) and VLM-transcription backends (one line per transcribed line).
pub fn parse_facts_from_lines(lines: &[&str]) -> ParsedNutritionFacts {
    let dictionary = spellcheck::dictionary();
    let spellchecked: Vec<String> = lines
        .iter()
        .map(|s| {
            s.split_whitespace()
                .map(|w: &str| spellcheck::correction(w, &dictionary))
                .collect::<Vec<&str>>()
                .join(" ")
        })
        .collect();
    parse_facts(spellchecked.iter().map(|s| s.as_str()).collect())
}
