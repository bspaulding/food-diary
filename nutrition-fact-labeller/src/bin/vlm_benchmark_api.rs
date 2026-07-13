use std::path::{Path, PathBuf};

use clap::Parser;
use nutrition_fact_labeller::vlm::openrouter::LlmApiBackend;
use nutrition_fact_labeller::{load_test_cases, print_field_score, FieldScore, VlmBackend};

/// Benchmarks a hosted OpenAI-compatible chat-completions API (OpenRouter, Gemini
/// directly, or any compatible endpoint) against the nutrition fact labeller test
/// suite, using the same full-JSON extraction task (`NUTRITION_PROMPT`) as
/// `vlm_benchmark`. Reads auth/routing from the same env vars main.rs's serving path
/// uses: `LLM_API_KEY`/`OPENROUTER_API_KEY`, `LLM_BASE_URL`/`OPENROUTER_BASE_URL`.
#[derive(Parser)]
#[command(about = "Benchmark an OpenRouter/OpenAI-compatible API VLM against the nutrition fact labeller test suite")]
struct Args {
    /// Model identifier to send to the API (e.g. "google/gemma-4-31b-it:free").
    #[arg(long)]
    model: String,

    /// Display name for reporting (defaults to the model identifier).
    #[arg(long)]
    model_name: Option<String>,

    /// Path to test_cases.csv.
    #[arg(long, default_value = "test_cases.csv")]
    csv: String,

    /// Directory containing test images.
    #[arg(long, default_value = "images")]
    images_dir: PathBuf,

    /// Only run the first N test cases (smoke test, not a full eval).
    #[arg(long)]
    limit: Option<usize>,
}

const BASELINE_PASS: usize = 9;
const BASELINE_TOTAL: usize = 33;

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let api_key = std::env::var("LLM_API_KEY")
        .or_else(|_| std::env::var("OPENROUTER_API_KEY"))
        .map_err(|_| anyhow::anyhow!("Set LLM_API_KEY or OPENROUTER_API_KEY in the environment"))?;

    let name = args.model_name.clone().unwrap_or_else(|| args.model.clone());
    let backend: Box<dyn VlmBackend> = Box::new(LlmApiBackend::new(api_key, args.model.clone()));

    let mut cases = load_test_cases(&args.csv);
    if let Some(limit) = args.limit {
        cases.truncate(limit);
        println!("Loaded {} test cases (--limit {limit}: smoke test, not a full eval)", cases.len());
    } else {
        println!("Loaded {} test cases", cases.len());
    }

    println!("\nUsing API backend [{name}] model={}", args.model);
    println!("Running inference on {} images...", cases.len());

    let mut passing: Vec<String> = Vec::new();
    let mut failing: Vec<String> = Vec::new();
    let mut field_score = FieldScore::default();

    for (filename, expected) in &cases {
        let image_path: &Path = &args.images_dir.join(filename);
        match backend.infer(image_path) {
            Ok(actual) if &actual == expected => {
                field_score.record(actual.field_matches(expected));
                passing.push(filename.clone());
            }
            Ok(actual) => {
                eprintln!("  FAIL {filename}");
                eprintln!("    got:      {actual:?}");
                eprintln!("    expected: {expected:?}");
                field_score.record(actual.field_matches(expected));
                failing.push(filename.clone());
            }
            Err(e) => {
                eprintln!("  ERROR {filename}: {e}");
                field_score.record_miss();
                failing.push(filename.clone());
            }
        }
    }

    let pass = passing.len();

    // Primary metric: "all fields" partial-credit scoring.
    println!("\n{}", "─".repeat(55));
    println!("All-fields scoring (primary metric — partial credit per field):");
    println!("{}", "─".repeat(55));
    println!("(no PaddleOCR baseline all-fields figure available: the baseline test doesn't emit per-field results in this environment)");
    println!("\n{name}:");
    print_field_score(&field_score);
    println!("{}", "─".repeat(55));

    // Secondary metric: whole-record exact match.
    println!("\nWhole-record scoring (secondary — how many cases were a perfect match):");
    println!("{}", "─".repeat(55));
    println!("{:<32} {:>5} {:>5}  {}", "Model", "Pass", "Fail", "Score");
    println!("{}", "─".repeat(55));
    if args.limit.is_some() {
        println!("(baseline comparison skipped: --limit was set, this isn't a full run)");
    } else {
        println!(
            "{:<32} {:>5} {:>5}  {}/{} (baseline)",
            "PaddleOCR",
            BASELINE_PASS,
            BASELINE_TOTAL - BASELINE_PASS,
            BASELINE_PASS,
            BASELINE_TOTAL,
        );
    }
    let vs_baseline = if args.limit.is_some() {
        String::new()
    } else if pass > BASELINE_PASS {
        format!(" ▲ +{}", pass - BASELINE_PASS)
    } else if pass < BASELINE_PASS {
        format!(" ▼ -{}", BASELINE_PASS - pass)
    } else {
        " = tie".to_string()
    };
    println!(
        "{:<32} {:>5} {:>5}  {}/{}{}",
        name,
        pass,
        cases.len() - pass,
        pass,
        cases.len(),
        vs_baseline,
    );
    println!("{}", "─".repeat(55));

    if !passing.is_empty() {
        println!("\n[{name}] passing ({}/{}):", pass, cases.len());
        for f in &passing {
            println!("  ✓ {f}");
        }
    }

    Ok(())
}
