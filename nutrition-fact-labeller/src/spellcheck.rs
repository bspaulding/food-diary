use std::collections::HashSet;
use strsim::levenshtein;

static WORDS: &'static [&str; 18] = &[
    "servings",
    "per",
    "container",
    "serving",
    "size",
    "calories",
    "total",
    "fat",
    "cholesterol",
    "sodium",
    "carbohydrate",
    "carbohydrates",
    "dietary",
    "fiber",
    "sugars",
    "sugar",
    "added",
    "protein",
];

/// The fixed dictionary of allowed words
pub fn dictionary() -> HashSet<&'static str> {
    WORDS.into_iter().map(|x| *x).collect()
}

// limited goal specific spell checker.
// 1. we do not care about extra or dropped characters. it is far more likely that a character was
//    misread by the OCR than that it dropped or added a character.
// 2. we have a very limited set of vocabulary for this task. we only care about the words that we
//    will try to parse out, ie the nutrition fact labels.
pub fn correction<'a>(word: &'a str, dict: &HashSet<&'a str>) -> &'a str {
    let best_result = dict
        .iter()
        .filter(|w| w.len() == word.len())
        .min_by_key(|w| levenshtein(word, w))
        .unwrap_or(&word);
    let d = levenshtein(word, best_result);
    if d > 2 {
        return word;
    } else {
        return best_result;
    }
}
