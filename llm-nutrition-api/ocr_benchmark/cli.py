"""CLI entry point: python -m ocr_benchmark.cli [options]"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import frontends as frontend_registry
from .dataset import load_dataset
from .report import find_universal_field_failures, render_markdown, summarize
from .runner import run_all
from .scoring import ToleranceConfig


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark OCR frontends + Needle extraction")
    parser.add_argument("--csv", type=Path, default=Path("test_cases.csv"))
    parser.add_argument("--images-dir", type=Path, default=Path("images"))
    parser.add_argument("--output-dir", type=Path, default=Path("ocr_benchmark_results"))
    parser.add_argument(
        "--frontends",
        nargs="*",
        default=list(frontend_registry.FRONTENDS.keys()),
        choices=list(frontend_registry.FRONTENDS.keys()),
        help="Subset of frontends to run (default: all registered)",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only run the first N test cases")
    parser.add_argument("--numeric-tolerance", type=float, default=0.0)
    parser.add_argument("--numeric-tolerance-pct", type=float, default=0.0)
    args = parser.parse_args(argv)

    field_specs, cases = load_dataset(args.csv, args.images_dir)
    if args.limit:
        cases = cases[: args.limit]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    results_path = args.output_dir / "raw_results.jsonl"
    results_path.unlink(missing_ok=True)

    tolerance = ToleranceConfig(
        numeric_tolerance=args.numeric_tolerance, numeric_tolerance_pct=args.numeric_tolerance_pct
    )

    print(f"Loaded {len(cases)} test cases, {len(field_specs)} schema fields.")
    print(f"Running frontends: {', '.join(args.frontends)}\n")

    results, skipped = run_all(args.frontends, field_specs, cases, tolerance, results_path)

    for sk in skipped:
        print(f"[SKIPPED] {sk.frontend}: {sk.reason}")

    summaries = summarize(results, skipped, field_specs)
    universal_failures = find_universal_field_failures(results, field_specs)

    report_md = render_markdown(summaries, skipped, field_specs, universal_failures)
    (args.output_dir / "report.md").write_text(report_md)

    report_json = {
        "frontends": {
            name: {
                "n_cases": s.n_cases,
                "n_ok": s.n_ok,
                "n_ocr_error": s.n_ocr_error,
                "n_extract_error": s.n_extract_error,
                "overall_accuracy": s.overall_accuracy,
                "exact_match_rate": s.exact_match_rate,
                "per_field_accuracy": s.per_field_accuracy(),
                "ocr_latency_mean_median": s.ocr_latency_stats(),
                "extract_latency_mean_median": s.extract_latency_stats(),
            }
            for name, s in summaries.items()
        },
        "skipped": [{"frontend": sk.frontend, "reason": sk.reason} for sk in skipped],
        "universal_field_failures": universal_failures,
    }
    (args.output_dir / "report.json").write_text(json.dumps(report_json, indent=2))

    print("\n" + report_md)
    print(f"\nRaw results: {results_path}")
    print(f"Report: {args.output_dir / 'report.md'} / report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
