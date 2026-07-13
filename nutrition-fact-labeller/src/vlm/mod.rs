pub mod llava;
pub mod openrouter;

pub const NUTRITION_PROMPT: &str =
    "Analyze this nutrition facts label. Return ONLY a valid JSON object with these exact fields:\n\
     {\"servings_per_container\": <number>, \"serving_size_grams\": <number>, \
     \"calories\": <integer>, \"total_fat_grams\": <number>, \
     \"cholesterol_mg\": <number>, \"sodium_mg\": <number>, \
     \"total_carbohydrates_g\": <number>, \"dietary_fiber_g\": <number>, \
     \"total_sugars_g\": <number>, \"added_sugars_g\": <number>, \
     \"protein_g\": <number>}\n\
     CRITICAL RULES:\n\
     - Use the exact numeric value shown on the label, including 0 when the label says \"0 g\" or \"0 mg\".\n\
     - NEVER return null for any field, under any circumstances. If a nutrient's own line, \
     sub-line, or value isn't printed on the label at all (e.g. no separate \"Added Sugars\" line, \
     or the label states \"not a significant source of\" a nutrient), infer 0 rather than null.\n\
     - Read each nutrient strictly from its own printed line. A small or near-zero value \
     (e.g. \"<1g\" means 1, not 0), a nested sub-line (e.g. \"Includes Xg Added Sugars\" under \
     Total Sugars means added_sugars_g is X), or a much larger nearby number (e.g. cholesterol_mg \
     is often far smaller than the sodium_mg on the next line) should never cause you to default a \
     field to 0 or borrow a neighboring line's value.\n\
     No explanation. No markdown. No code blocks. JSON only.";

/// Prompt for using a VLM purely as an OCR engine: transcribe the label's text
/// verbatim, one line per line of output, with no interpretation. The output is
/// meant to be fed into the same line-oriented regex parser (`parsing::parse_facts_from_lines`)
/// that the PaddleOCR backend uses on its detected text regions.
pub const OCR_TRANSCRIBE_PROMPT: &str =
    "Transcribe every line of text visible on this nutrition facts label exactly as printed, \
     top to bottom, one line of output per line of text on the label. \
     Do not translate, summarize, reformat, or interpret the text. \
     Do not add labels, explanations, JSON, or punctuation that isn't on the label. \
     Output only the raw transcribed text.";

/// Extract the first complete `{...}` block from a string.
/// Handles models that prepend preamble text before the JSON.
pub fn extract_json(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end >= start {
        Some(&s[start..=end])
    } else {
        None
    }
}
