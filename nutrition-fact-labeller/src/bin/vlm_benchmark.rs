use std::path::{Path, PathBuf};

use clap::Parser;
use nutrition_fact_labeller::{load_test_cases, ParsedNutritionFacts, VlmBackend};
use nutrition_fact_labeller::vlm::llava::LlavaBackend;

#[derive(Parser)]
#[command(about = "Benchmark VLMs against the nutrition fact labeller test suite")]
struct Args {
    /// Path to a GGUF model file. Repeat for multiple models.
    #[arg(long)]
    model: Vec<PathBuf>,

    /// Path to the corresponding mmproj GGUF file (one per --model).
    #[arg(long)]
    mmproj: Vec<PathBuf>,

    /// Display name for the model (one per --model, defaults to filename stem).
    #[arg(long)]
    model_name: Vec<String>,

    /// Path to test_cases.csv.
    #[arg(long, default_value = "test_cases.csv")]
    csv: String,

    /// Directory containing test images.
    #[arg(long, default_value = "images")]
    images_dir: PathBuf,

    /// Number of CPU threads for inference.
    #[arg(long, default_value_t = 4)]
    threads: i32,
}

const BASELINE_PASS: usize = 9;
const BASELINE_TOTAL: usize = 33;

struct BenchResult {
    name: String,
    pass: usize,
    total: usize,
    passing_files: Vec<String>,
    #[allow(dead_code)]
    failing_files: Vec<String>,
}

fn run_backend(
    backend: &dyn VlmBackend,
    cases: &[(String, ParsedNutritionFacts)],
    images_dir: &Path,
) -> BenchResult {
    let mut passing = Vec::new();
    let mut failing = Vec::new();

    for (filename, expected) in cases {
        let image_path = images_dir.join(filename);
        match backend.infer(&image_path) {
            Ok(actual) if &actual == expected => passing.push(filename.clone()),
            Ok(actual) => {
                eprintln!("  FAIL {filename}");
                eprintln!("    got:      {actual:?}");
                eprintln!("    expected: {expected:?}");
                failing.push(filename.clone());
            }
            Err(e) => {
                eprintln!("  ERROR {filename}: {e}");
                failing.push(filename.clone());
            }
        }
    }

    BenchResult {
        name: backend.name().to_string(),
        pass: passing.len(),
        total: cases.len(),
        passing_files: passing,
        failing_files: failing,
    }
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    if args.model.len() != args.mmproj.len() {
        anyhow::bail!("--model and --mmproj must be provided the same number of times");
    }
    if args.model.is_empty() {
        anyhow::bail!("Provide at least one --model / --mmproj pair");
    }

    let cases = load_test_cases(&args.csv);
    println!("Loaded {} test cases", cases.len());

    let mut results: Vec<BenchResult> = Vec::new();

    for (i, (model_path, mmproj_path)) in args.model.iter().zip(&args.mmproj).enumerate() {
        let name = args
            .model_name
            .get(i)
            .cloned()
            .unwrap_or_else(|| {
                model_path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            });

        println!("\nLoading [{name}] from {}", model_path.display());
        let backend = LlavaBackend::new(&name, model_path, mmproj_path, args.threads)?;

        println!("Running inference on {} images...", cases.len());
        let result = run_backend(&backend, &cases, &args.images_dir);
        results.push(result);
    }

    // Print comparison table
    println!("\n{}", "─".repeat(55));
    println!("{:<32} {:>5} {:>5}  {}", "Model", "Pass", "Fail", "Score");
    println!("{}", "─".repeat(55));
    println!(
        "{:<32} {:>5} {:>5}  {}/{} (baseline)",
        "PaddleOCR",
        BASELINE_PASS,
        BASELINE_TOTAL - BASELINE_PASS,
        BASELINE_PASS,
        BASELINE_TOTAL,
    );
    for r in &results {
        let vs_baseline = if r.pass > BASELINE_PASS {
            format!(" ▲ +{}", r.pass - BASELINE_PASS)
        } else if r.pass < BASELINE_PASS {
            format!(" ▼ -{}", BASELINE_PASS - r.pass)
        } else {
            " = tie".to_string()
        };
        println!(
            "{:<32} {:>5} {:>5}  {}/{}{}",
            r.name,
            r.pass,
            r.total - r.pass,
            r.pass,
            r.total,
            vs_baseline,
        );
    }
    println!("{}", "─".repeat(55));

    // Per-model passing case details
    for r in &results {
        if !r.passing_files.is_empty() {
            println!("\n[{}] passing ({}/{}):", r.name, r.pass, r.total);
            for f in &r.passing_files {
                println!("  ✓ {f}");
            }
        }
    }

    Ok(())
}
