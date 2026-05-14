use anyhow::Context as _;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::ParsedNutritionFacts;
use super::{extract_json, NUTRITION_PROMPT};

const MAX_TOKENS: u32 = 512;
const MAX_RETRIES: u32 = 4;

pub const DEFAULT_MODEL: &str = "google/gemma-4-31b-it:free";

pub struct OpenRouterBackend {
    pub api_key: String,
    pub model: String,
    pub client: reqwest::Client,
}

impl OpenRouterBackend {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn infer(&self, image_bytes: &[u8]) -> anyhow::Result<ParsedNutritionFacts> {
        let b64 = STANDARD.encode(image_bytes);
        let data_url = format!("data:image/jpeg;base64,{b64}");

        let body = serde_json::json!({
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        },
                        {
                            "type": "text",
                            "text": NUTRITION_PROMPT
                        }
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": MAX_TOKENS
        });

        let mut attempt = 0u32;
        loop {
            let response = self.client
                .post("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Failed to send OpenRouter request")?;

            if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                if attempt >= MAX_RETRIES {
                    let text = response.text().await.unwrap_or_default();
                    return Err(anyhow::anyhow!(
                        "OpenRouter rate limit exceeded after {attempt} retries: {text}"
                    ));
                }
                let delay_secs = response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(1u64 << attempt);
                log::warn!("OpenRouter 429, retrying in {delay_secs}s");
                tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                attempt += 1;
                continue;
            }

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(anyhow::anyhow!("OpenRouter API error {status}: {text}"));
            }

            let json: serde_json::Value = response
                .json()
                .await
                .context("Failed to parse OpenRouter response")?;
            let output = json["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing content in OpenRouter response"))?
                .trim()
                .to_string();

            let json_str = extract_json(&output).unwrap_or(output.trim());
            return serde_json::from_str::<ParsedNutritionFacts>(json_str)
                .with_context(|| format!("Failed to parse VLM JSON output:\n{output}"));
        }
    }
}
