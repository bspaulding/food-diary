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
            } else if i > 0 {
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

/// Finds the number (by character distance) nearest any occurrence of a label phrase,
/// within `max_gap` characters, regardless of whether the number comes before the label
/// ("8 servings per container", "Includes 3g Added Sugars") or after it ("Calories 110",
/// "Total Fat 4g"). When `require_unit` is set, only numbers directly followed by a
/// weight unit (g/mg, tolerating a misread "g" as "9") are considered candidates — this
/// is what lets `serving_size_grams` skip over an unrelated bare number like the "1" in
/// "Serving size 1 bar (36g)" to find the real "36g", and lets `added_sugars_g` prefer
/// the immediately adjacent "9g" over the farther "10g" in "Total Sugars 10g Includes 9g
/// Added Sugars 17%" — the *nearest* valid candidate wins, not the first one found.
fn find_near(text: &str, label_pattern: &str, max_gap: usize, require_unit: bool) -> Option<f64> {
    let label_re = Regex::new(&format!(r"(?i)\b{label_pattern}")).ok()?;
    let num_re = if require_unit {
        Regex::new(r"(?i)([\do]+(?:\.[\do]+)?)\s*(?:g|mg|9)\b").ok()?
    } else {
        Regex::new(r"([\do]+(?:\.[\do]+)?)").ok()?
    };

    let label_spans: Vec<(usize, usize)> = label_re.find_iter(text).map(|m| (m.start(), m.end())).collect();
    if label_spans.is_empty() {
        return None;
    }

    let mut best: Option<(usize, f64)> = None;
    for cap in num_re.captures_iter(text) {
        let m = cap.get(0).unwrap();
        // The "o" in "[\do]" tolerates a digit OCR-misread as the letter O, but a run
        // with *no* real digit at all is just an ordinary word (e.g. the "o" inside
        // "calories" or "sodium" themselves) — require at least one genuine digit so
        // label words don't get treated as zero-distance number candidates for
        // themselves.
        if !cap[1].chars().any(|c| c.is_ascii_digit()) {
            continue;
        }
        let Some(value) = normalize_number(&cap[1]) else { continue };
        for &(lstart, lend) in &label_spans {
            let dist = if m.start() >= lend {
                m.start() - lend
            } else if lstart >= m.end() {
                lstart - m.end()
            } else {
                0
            };
            if dist <= max_gap && best.is_none_or(|(bd, _)| dist < bd) {
                best = Some((dist, value));
            }
        }
    }
    best.map(|(_, v)| v)
}

fn normalize_number(s: &str) -> Option<f64> {
    s.replace(['O', 'o'], "0").parse::<f64>().ok()
}

/// Fills in any fields the primary line-based parser above left as `None` by scanning
/// the full transcription text (all lines joined, ignoring where the line breaks fell)
/// for each label's nearest number. `parse_facts` assumes something close to
/// one-label-per-line, which mostly holds for PaddleOCR's per-detected-box output but
/// not for a VLM transcription, which may merge several label/value pairs onto one
/// line or even collapse the whole label into a single run-on paragraph. This pass is
/// purely additive — it only ever fills a `None`, never overrides a value the primary
/// parser already found — so it can't regress the primary parser's existing behavior.
fn fill_gaps_from_blob(mut facts: ParsedNutritionFacts, blob: &str) -> ParsedNutritionFacts {
    if facts.servings_per_container.is_none() {
        facts.servings_per_container = find_near(blob, r"servings\s*per\s*container", 20, false);
    }
    if facts.serving_size_grams.is_none() {
        facts.serving_size_grams = find_near(blob, r"serving\s*size", 25, true);
    }
    if facts.calories.is_none() {
        facts.calories = find_near(blob, r"calories\b", 20, false).map(|n| n as i32);
    }
    if facts.total_fat_grams.is_none() {
        facts.total_fat_grams = find_near(blob, r"total\s*fat\b", 20, true);
    }
    if facts.cholesterol_mg.is_none() {
        facts.cholesterol_mg = find_near(blob, r"cholesterol\b", 20, true);
    }
    if facts.sodium_mg.is_none() {
        facts.sodium_mg = find_near(blob, r"sodium\b", 20, true);
    }
    if facts.total_carbohydrates_g.is_none() {
        facts.total_carbohydrates_g = find_near(blob, r"total\s*carbohydrate", 20, true);
    }
    if facts.dietary_fiber_g.is_none() {
        facts.dietary_fiber_g = find_near(blob, r"dietary\s*fiber", 20, true);
    }
    if facts.total_sugars_g.is_none() {
        facts.total_sugars_g = find_near(blob, r"total\s*sugars", 20, true);
    }
    if facts.added_sugars_g.is_none() {
        facts.added_sugars_g = find_near(blob, r"added\s*sugars", 25, true);
    }
    if facts.protein_g.is_none() {
        facts.protein_g = find_near(blob, r"protein\b", 20, true);
    }
    facts
}

/// Spellchecks each word of each line against the fixed nutrition-label dictionary, then
/// parses the corrected lines with `parse_facts`, and finally fills in any fields that
/// left with a blob-wide scan (see `fill_gaps_from_blob`) so the result is resilient to
/// however many lines the caller actually provided — from PaddleOCR's many short
/// per-detection-box lines down to a VLM's single run-on paragraph.
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
    let refs: Vec<&str> = spellchecked.iter().map(|s| s.as_str()).collect();
    let facts = parse_facts(refs.clone());
    let blob = refs.join(" ");
    fill_gaps_from_blob(facts, &blob)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    // Real MiniCPM-V 4.6 transcriptions captured from a vlm_ocr_benchmark run
    // (see eval-results/2026-07-11-minicpm-v-4.6-ocr-only.md), used as fixtures so the
    // blob-fallback fix can be verified without re-running the VLM.

    #[test]
    fn merged_calories_line_is_recovered() {
        // IMG_5437_1200.png: every field transcribed onto its own line except
        // "Calories 110", which the primary line-based parser can't see because it
        // requires "Calories" and its number on separate lines.
        let lines = vec![
            "Nutrition Facts",
            "About 8 servings per container",
            "Serving size 1/3 cup (30g)",
            "Calories 110",
            "Amount per serving",
            "Calories 110",
            "% Daily Value",
            "Total Fat 1.5g 2%",
            "Saturated Fat 0g 0%",
            "Trans Fat 0g",
            "Cholesterol 0mg 0%",
            "Sodium 350mg 15%",
            "Total Carbohydrate 20g 7%",
            "Dietary Fiber <1g 3%",
            "Total Sugars 0g",
            "Includes 0g Added Sugars 0%",
            "Protein 3g",
            "Vitamin D 0mcg %",
        ];
        let actual = parse_facts_from_lines(&lines);
        assert_eq!(
            actual,
            ParsedNutritionFacts {
                servings_per_container: Some(8.0),
                serving_size_grams: Some(30.0),
                calories: Some(110),
                total_fat_grams: Some(1.5),
                cholesterol_mg: Some(0.0),
                sodium_mg: Some(350.0),
                total_carbohydrates_g: Some(20.0),
                dietary_fiber_g: Some(1.0),
                total_sugars_g: Some(0.0),
                added_sugars_g: Some(0.0),
                protein_g: Some(3.0),
            }
        );
    }

    #[test]
    fn fully_collapsed_transcription_is_recovered() {
        // IMG_5423_1200.png: MiniCPM ignored the "one line per line" instruction and
        // returned the entire label (twice over, plus ingredients) as a single line.
        let lines = vec![
            "Nutrition Facts 12 servings per container Serving size 1 bar (36g) \
             Calories 140 Total Fat 5g % Daily Value 6% Saturated Fat 1g 6% Trans Fat 0g \
             Cholesterol 0mg 0% Sodium 105mg 5% Total Carbohydrate 24g 9% Dietary Fiber 2g 10% \
             Total Sugars 10g Includes 9g Added Sugars 17% Protein 2g Vit. D 0mcg Calcium 15mg 2% \
             Iron 1mg 6%. Potas. 92mg 2% Vit. E 8% Phosphorus 4% Magnesium 6% *t the % Daily Value \
             tells you how much a nutrient in a day is used for a general nutrition advice.",
        ];
        let actual = parse_facts_from_lines(&lines);
        assert_eq!(
            actual,
            ParsedNutritionFacts {
                servings_per_container: Some(12.0),
                serving_size_grams: Some(36.0),
                calories: Some(140),
                total_fat_grams: Some(5.0),
                cholesterol_mg: Some(0.0),
                sodium_mg: Some(105.0),
                total_carbohydrates_g: Some(24.0),
                dietary_fiber_g: Some(2.0),
                total_sugars_g: Some(10.0),
                added_sugars_g: Some(9.0),
                protein_g: Some(2.0),
            }
        );
    }

    #[test]
    fn does_not_regress_well_formed_line_per_entry_input() {
        // A tidy, one-value-per-line PaddleOCR-style input (the common case) should
        // still parse correctly with the fallback pass in place.
        let lines = vec![
            "5 servings per container",
            "serving size",
            "30",
            "calories",
            "120",
            "total fat 4g",
            "cholesterol 0mg",
            "sodium 85mg",
            "total carbohydrate 20g",
            "dietary fiber 2g",
            "total sugars 6g",
            "added sugars",
            "protein 2g",
            "vitamin d 0mcg",
        ];
        let actual = parse_facts_from_lines(&lines);
        assert_eq!(actual.servings_per_container, Some(5.0));
        assert_eq!(actual.calories, Some(120));
        assert_eq!(actual.total_fat_grams, Some(4.0));
        assert_eq!(actual.protein_g, Some(2.0));
    }
}
