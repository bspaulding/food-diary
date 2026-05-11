pub mod llava;

pub const NUTRITION_PROMPT: &str =
    "Analyze this nutrition facts label. Return ONLY a valid JSON object with these exact fields:\n\
     {\"servings_per_container\": <number|null>, \"serving_size_grams\": <number|null>, \
     \"calories\": <integer|null>, \"total_fat_grams\": <number|null>, \
     \"cholesterol_mg\": <number|null>, \"sodium_mg\": <number|null>, \
     \"total_carbohydrates_g\": <number|null>, \"dietary_fiber_g\": <number|null>, \
     \"total_sugars_g\": <number|null>, \"added_sugars_g\": <number|null>, \
     \"protein_g\": <number|null>}\n\
     CRITICAL RULES:\n\
     - Use the exact numeric value shown on the label, including 0 when the label says \"0 g\" or \"0 mg\".\n\
     - Use null ONLY if that nutrient field does not appear on the label at all.\n\
     - Do NOT use null when the label shows 0. Use 0 instead.\n\
     No explanation. No markdown. No code blocks. JSON only.";

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
