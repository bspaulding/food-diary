use std::path::{Path, PathBuf};

use clap::Parser;
use nutrition_fact_labeller::{load_test_cases, print_field_score, FieldScore, ParsedNutritionFacts, VlmBackend};
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

    /// Only run the first N test cases (e.g. --limit 2 for a quick smoke test that a
    /// model loads and produces output, without running the full suite). Baseline
    /// comparison is skipped when this is set, since it's only meaningful over all 33.
    #[arg(long)]
    limit: Option<usize>,
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
    field_score: FieldScore,
}

fn run_backend(
    backend: &dyn VlmBackend,
    cases: &[(String, ParsedNutritionFacts)],
    images_dir: &Path,
) -> BenchResult {
    let mut passing = Vec::new();
    let mut failing = Vec::new();
    let mut field_score = FieldScore::default();

    for (filename, expected) in cases {
        let image_path = images_dir.join(filename);
        match backend.infer(&image_path) {
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

    BenchResult {
        name: backend.name().to_string(),
        pass: passing.len(),
        total: cases.len(),
        passing_files: passing,
        failing_files: failing,
        field_score,
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

    let mut cases = load_test_cases(&args.csv);
    if let Some(limit) = args.limit {
        cases.truncate(limit);
        println!("Loaded {} test cases (--limit {limit}: smoke test, not a full eval)", cases.len());
    } else {
        println!("Loaded {} test cases", cases.len());
    }

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

    // Primary metric: "all fields" partial-credit scoring. Prioritize this over
    // whole-record pass/fail below — models often get most fields right without
    // matching all 11 simultaneously, so whole-record scoring alone understates real
    // accuracy (see eval-results/README.md's Results table and Known Issues).
    println!("\n{}", "─".repeat(55));
    println!("All-fields scoring (primary metric — partial credit per field):");
    println!("{}", "─".repeat(55));
    println!("(no PaddleOCR baseline all-fields figure available: the baseline test doesn't emit per-field results in this environment)");
    for r in &results {
        println!("\n{}:", r.name);
        print_field_score(&r.field_score);
    }
    println!("{}", "─".repeat(55));

    // Secondary metric: whole-record exact match (all 11 fields correct at once).
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
    for r in &results {
        let vs_baseline = if args.limit.is_some() {
            String::new()
        } else if r.pass > BASELINE_PASS {
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
