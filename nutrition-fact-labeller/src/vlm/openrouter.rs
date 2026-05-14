use anyhow::Context as _;
use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::ParsedNutritionFacts;
use super::{extract_json, NUTRITION_PROMPT};

const MAX_TOKENS: u32 = 512;
const MAX_RETRIES: u32 = 4;

pub const DEFAULT_MODEL: &str = "google/gemma-4-31b-it:free";

const DEFAULT_BASE_URL: &str = "https://openrouter.ai";

pub struct OpenRouterBackend {
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub client: reqwest::Client,
}

impl OpenRouterBackend {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        let base_url = std::env::var("OPENROUTER_BASE_URL")
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Self::with_base_url(api_key, model, base_url)
    }

    pub fn with_base_url(
        api_key: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            base_url: base_url.into(),
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

        let endpoint = format!("{}/api/v1/chat/completions", self.base_url);
        let mut attempt = 0u32;
        loop {
            let response = self.client
                .post(&endpoint)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;

    const SKIP: &[&str] = &[
        "IMG_5421_1200.png", "IMG_5423_1200.png", "IMG_5422_1200.png",
        "IMG_5436_1200.png", "IMG_5426_1200.png", "IMG_5430_1200.png",
        "IMG_5457_1200.png", "IMG_5456_1200.png", "IMG_5442_1200.png",
        "IMG_5445_1200.png", "IMG_5444_1200.png", "IMG_5450_1200.png",
        "IMG_5446_1200.png", "IMG_5452_1200.png", "IMG_5447_1200.png",
        "IMG_5462_1200.png", "IMG_5461_1200.png", "IMG_5460_1200.png",
        "IMG_5448_1200.png", "IMG_5464_1200.png", "IMG_5458_1200.png",
        "IMG_5429_1200.png", "IMG_5428_1200.png", "IMG_5439_1200.png",
    ];

    struct MockResult {
        validation_errors: Vec<String>,
    }

    /// Minimal HTTP/1.1 mock server: binds to a random port, handles one request,
    /// validates the OpenAI vision message shape, returns the canned response JSON,
    /// then sends a `MockResult` through the returned channel.
    async fn spawn_mock(
        response: serde_json::Value,
    ) -> (String, oneshot::Receiver<MockResult>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = oneshot::channel::<MockResult>();
        let resp_str = serde_json::to_string(&response).unwrap();

        tokio::spawn(async move {
            let Ok((stream, _)) = listener.accept().await else { return };
            let (read_half, mut write_half) = stream.into_split();
            let mut reader = BufReader::new(read_half);

            // Read request line + headers, extract Content-Length.
            let mut content_length = 0usize;
            let mut first = String::new();
            reader.read_line(&mut first).await.ok();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).await.ok();
                if line.trim().is_empty() { break; }
                if line.to_lowercase().starts_with("content-length:") {
                    content_length = line.split(':').nth(1).unwrap_or("0")
                        .trim().parse().unwrap_or(0);
                }
            }

            // Read body.
            let mut body = vec![0u8; content_length];
            reader.read_exact(&mut body).await.ok();

            // Validate OpenAI vision request shape.
            let mut errors: Vec<String> = Vec::new();
            match serde_json::from_slice::<serde_json::Value>(&body) {
                Ok(json) => {
                    match json["messages"][0]["content"].as_array() {
                        None => errors.push("content is not an array".into()),
                        Some(parts) => {
                            if !parts.iter().any(|p| p["type"] == "image_url") {
                                errors.push("missing image_url part".into());
                            }
                            if !parts.iter().any(|p| p["type"] == "text") {
                                errors.push("missing text part".into());
                            }
                            if let Some(url) = parts.iter()
                                .find(|p| p["type"] == "image_url")
                                .and_then(|p| p["image_url"]["url"].as_str())
                            {
                                if !url.starts_with("data:image/") {
                                    errors.push(format!("image_url not a data URL: {}…", &url[..40.min(url.len())]));
                                }
                            }
                        }
                    }
                }
                Err(e) => errors.push(format!("body not valid JSON: {e}")),
            }

            // Write response.
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                resp_str.len(), resp_str
            );
            write_half.write_all(resp.as_bytes()).await.ok();
            tx.send(MockResult { validation_errors: errors }).ok();
        });

        (format!("http://127.0.0.1:{port}"), rx)
    }

    fn openrouter_response(nutrition: &ParsedNutritionFacts) -> serde_json::Value {
        let content = serde_json::to_string(nutrition).unwrap();
        serde_json::json!({
            "choices": [{"message": {"role": "assistant", "content": content}}]
        })
    }

    #[tokio::test]
    async fn openrouter_infer_passing_cases() {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let cases = crate::load_test_cases(&format!("{manifest}/test_cases.csv"));
        let passing: Vec<_> = cases.into_iter()
            .filter(|(f, _)| !SKIP.contains(&f.as_str()))
            .collect();
        assert!(!passing.is_empty(), "no passing cases found");

        for (filename, expected) in &passing {
            let img_bytes = std::fs::read(Path::new(manifest).join("images").join(filename))
                .unwrap_or_else(|_| panic!("missing image: {filename}"));

            let (base_url, mock_rx) = spawn_mock(openrouter_response(&expected)).await;
            let backend = OpenRouterBackend::with_base_url("test-key", "test-model", &base_url);
            let actual = backend.infer(&img_bytes).await
                .unwrap_or_else(|e| panic!("infer failed for {filename}: {e}"));

            let mock = mock_rx.await.expect("mock server dropped");
            assert!(
                mock.validation_errors.is_empty(),
                "bad request shape for {filename}: {:?}",
                mock.validation_errors,
            );
            assert_eq!(actual, *expected, "output mismatch for {filename}");
        }
    }
}
