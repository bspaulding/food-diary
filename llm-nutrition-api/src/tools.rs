use websearch::providers::DuckDuckGoProvider;
use websearch::{web_search, SearchOptions};

pub async fn search_web(query: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let results = web_search(SearchOptions {
        query: query.to_string(),
        provider: Box::new(DuckDuckGoProvider::new()),
        max_results: Some(5),
        ..Default::default()
    })
    .await?;

    let formatted = results
        .iter()
        .map(|r| {
            let snippet = r.snippet.as_deref().unwrap_or("");
            format!("Title: {}\nURL: {}\nSnippet: {}\n---", r.title, r.url, snippet)
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(formatted)
}

pub async fn read_webpage(url: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let html = reqwest::get(url).await?.text().await?;
    let mut reader = dom_smoothie::Readability::new(html, Some(url), None)?;
    let article = reader.parse()?;
    let text = article.text_content.to_string();
    // Truncate to avoid overflowing the context window
    let max_chars = 4000;
    if text.len() > max_chars {
        Ok(text[..max_chars].to_string())
    } else {
        Ok(text)
    }
}
