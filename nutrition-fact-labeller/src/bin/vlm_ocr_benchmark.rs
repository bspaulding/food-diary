use std::path::{Path, PathBuf};

use clap::Parser;
use nutrition_fact_labeller::parsing::parse_facts_from_lines;
use nutrition_fact_labeller::vlm::llava::LlavaBackend;
use nutrition_fact_labeller::{load_test_cases, ParsedNutritionFacts};

/// Benchmarks a VLM used purely as an OCR engine: image -> transcribed text lines ->
/// the same regex/spellcheck parser (`parsing::parse_facts_from_lines`) that the
/// PaddleOCR backend runs on its detected text regions. This isolates "can the VLM read
/// the label" from "can the VLM emit well-typed structured JSON" (see vlm_benchmark.rs
/// for the latter).
#[derive(Parser)]
#[command(about = "Benchmark a VLM as an OCR-only text source for the nutrition fact labeller test suite")]
struct Args {
    /// Path to a GGUF model file.
    #[arg(long)]
    model: PathBuf,

    /// Path to the corresponding mmproj GGUF file.
    #[arg(long)]
    mmproj: PathBuf,

    /// Display name for the model.
    #[arg(long, default_value = "vlm-ocr")]
    model_name: String,

    /// Path to test_cases.csv.
    #[arg(long, default_value = "test_cases.csv")]
    csv: String,

    /// Directory containing test images.
    #[arg(long, default_value = "images")]
    images_dir: PathBuf,

    /// Number of CPU threads for inference.
    #[arg(long, default_value_t = 4)]
    threads: i32,

    /// Only run the first N test cases (e.g. --limit 2 for a quick smoke test that a
    /// model loads and produces output, without running the full suite). Baseline
    /// comparison is skipped when this is set, since it's only meaningful over all 33.
    #[arg(long)]
    limit: Option<usize>,
}

const BASELINE_PASS: usize = 9;
const BASELINE_TOTAL: usize = 33;

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let mut cases = load_test_cases(&args.csv);
    if let Some(limit) = args.limit {
        cases.truncate(limit);
        println!("Loaded {} test cases (--limit {limit}: smoke test, not a full eval)", cases.len());
    } else {
        println!("Loaded {} test cases", cases.len());
    }

    println!("\nLoading [{}] from {}", args.model_name, args.model.display());
    let backend = LlavaBackend::new(&args.model_name, &args.model, &args.mmproj, args.threads)?;

    println!("Running OCR-only inference on {} images...", cases.len());
    let mut pass = 0;
    let mut passing_files: Vec<String> = Vec::new();
    let mut failing_files: Vec<String> = Vec::new();

    for (filename, expected) in &cases {
        let image_path: &Path = &args.images_dir.join(filename);
        match backend.transcribe(image_path) {
            Ok(text) => {
                let lines: Vec<&str> = text
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty())
                    .collect();
                let actual: ParsedNutritionFacts = parse_facts_from_lines(&lines);
                if &actual == expected {
                    pass += 1;
                    passing_files.push(filename.clone());
                } else {
                    eprintln!("  FAIL {filename}");
                    eprintln!("    transcribed: {lines:?}");
                    eprintln!("    got:      {actual:?}");
                    eprintln!("    expected: {expected:?}");
                    failing_files.push(filename.clone());
                }
            }
            Err(e) => {
                eprintln!("  ERROR {filename}: {e}");
                failing_files.push(filename.clone());
            }
        }
    }

    println!("\n{}", "─".repeat(55));
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
        args.model_name,
        pass,
        cases.len() - pass,
        pass,
        cases.len(),
        vs_baseline,
    );
    println!("{}", "─".repeat(55));

    if !passing_files.is_empty() {
        println!("\n[{}] passing ({}/{}):", args.model_name, pass, cases.len());
        for f in &passing_files {
            println!("  ✓ {f}");
        }
    }

    Ok(())
}
