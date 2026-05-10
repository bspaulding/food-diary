#!/usr/bin/env python3
"""
Eval runner for the LLM nutrition agent.

Usage:
    # Start the service first:
    GEMMA_MODEL_PATH=/path/to/model.gguf cargo run --manifest-path ../Cargo.toml

    # Then run evals:
    python3 run_evals.py [--url http://localhost:3031] [--output results/]
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import date
from pathlib import Path


def load_dataset(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def call_lookup(base_url: str, query: str) -> dict:
    import urllib.request
    payload = json.dumps({"description": query}).encode()
    req = urllib.request.Request(
        f"{base_url}/lookup",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())["item"]


NUMERIC_FIELDS = [
    "calories",
    "total_fat_grams",
    "saturated_fat_grams",
    "trans_fat_grams",
    "polyunsaturated_fat_grams",
    "monounsaturated_fat_grams",
    "cholesterol_milligrams",
    "sodium_milligrams",
    "total_carbohydrate_grams",
    "dietary_fiber_grams",
    "total_sugars_grams",
    "added_sugars_grams",
    "protein_grams",
]


def score_case(predicted: dict, ground_truth: dict, tolerances: dict) -> dict:
    errors = {}
    within_tolerance = {}
    for field in NUMERIC_FIELDS:
        gt = ground_truth.get(field, 0)
        pred = predicted.get(field, 0)
        abs_err = abs(pred - gt)
        rel_err = abs_err / max(gt, 1)
        tol = tolerances.get(field)
        errors[field] = {"predicted": pred, "ground_truth": gt, "abs_error": round(abs_err, 2), "rel_error_pct": round(rel_err * 100, 1)}
        if tol is not None:
            within_tolerance[field] = abs_err <= tol
    return {"errors": errors, "within_tolerance": within_tolerance}


def run_evals(base_url: str, dataset_path: str, output_dir: str) -> None:
    dataset = load_dataset(dataset_path)
    cases = dataset["cases"]

    results = []
    for i, case in enumerate(cases):
        print(f"[{i+1}/{len(cases)}] {case['id']}: {case['query'][:60]}", flush=True)
        start = time.time()
        try:
            predicted = call_lookup(base_url, case["query"])
            elapsed = time.time() - start
            scored = score_case(predicted, case["ground_truth"], case.get("tolerances", {}))
            results.append({
                "id": case["id"],
                "query": case["query"],
                "category": case["category"],
                "elapsed_seconds": round(elapsed, 1),
                "status": "ok",
                "predicted_description": predicted.get("description", ""),
                **scored,
            })
            print(f"  OK ({elapsed:.1f}s) — calories: {predicted.get('calories')} (gt {case['ground_truth']['calories']})")
        except Exception as e:
            elapsed = time.time() - start
            results.append({
                "id": case["id"],
                "query": case["query"],
                "category": case["category"],
                "elapsed_seconds": round(elapsed, 1),
                "status": "error",
                "error": str(e),
            })
            print(f"  ERROR: {e}")

    today = date.today().isoformat()
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    json_path = os.path.join(output_dir, f"{today}.json")
    md_path = os.path.join(output_dir, f"{today}.md")

    with open(json_path, "w") as f:
        json.dump({"date": today, "base_url": base_url, "results": results}, f, indent=2)

    write_report(md_path, today, base_url, cases, results)
    print(f"\nResults written to:\n  {json_path}\n  {md_path}")


def write_report(path: str, today: str, base_url: str, cases: list, results: list) -> None:
    ok_results = [r for r in results if r["status"] == "ok"]
    error_results = [r for r in results if r["status"] == "error"]

    lines = [
        f"# LLM Nutrition Agent Eval Report",
        f"",
        f"**Date:** {today}  ",
        f"**Service:** {base_url}  ",
        f"**Cases:** {len(cases)} total, {len(ok_results)} successful, {len(error_results)} errors  ",
        f"",
    ]

    # Overall accuracy for key macros
    if ok_results:
        lines += ["## Macro Accuracy Summary", ""]
        key_fields = ["calories", "total_fat_grams", "protein_grams", "total_carbohydrate_grams"]
        header = "| Macro | MAE | Median AbsErr | % Within Tolerance |"
        sep =    "|-------|-----|---------------|--------------------|"
        lines += [header, sep]
        for field in key_fields:
            abs_errors = [r["errors"][field]["abs_error"] for r in ok_results if "errors" in r]
            if not abs_errors:
                continue
            mae = sum(abs_errors) / len(abs_errors)
            median = sorted(abs_errors)[len(abs_errors) // 2]
            within = [r for r in ok_results if "within_tolerance" in r and field in r["within_tolerance"]]
            pct = (sum(1 for r in within if r["within_tolerance"][field]) / len(within) * 100) if within else float("nan")
            label = field.replace("_", " ").replace("grams", "g").replace("milligrams", "mg").title()
            lines.append(f"| {label} | {mae:.1f} | {median:.1f} | {pct:.0f}% |")
        lines.append("")

    # Per-category breakdown
    categories = sorted(set(r["category"] for r in results))
    if len(categories) > 1:
        lines += ["## Results by Category", ""]
        for cat in categories:
            cat_ok = [r for r in ok_results if r["category"] == cat]
            cat_err = [r for r in error_results if r["category"] == cat]
            lines.append(f"**{cat.replace('_', ' ').title()}:** {len(cat_ok)} ok, {len(cat_err)} errors")
        lines.append("")

    # Per-case detail table
    lines += ["## Per-Case Results", ""]
    lines += ["| ID | Category | Status | Calories (pred/gt) | Protein g (pred/gt) | Carbs g (pred/gt) | Fat g (pred/gt) | Time |"]
    lines += ["|----|-----------|---------|--------------------|---------------------|-------------------|-----------------|------|"]
    for r in results:
        case = next(c for c in cases if c["id"] == r["id"])
        gt = case["ground_truth"]
        if r["status"] == "ok":
            e = r["errors"]
            cal = f"{e['calories']['predicted']:.0f}/{gt['calories']}"
            pro = f"{e['protein_grams']['predicted']:.1f}/{gt['protein_grams']}"
            carb = f"{e['total_carbohydrate_grams']['predicted']:.1f}/{gt['total_carbohydrate_grams']}"
            fat = f"{e['total_fat_grams']['predicted']:.1f}/{gt['total_fat_grams']}"
        else:
            cal = pro = carb = fat = "—"
        status = "✓" if r["status"] == "ok" else f"✗ {r.get('error', '')[:40]}"
        lines.append(f"| {r['id']} | {r['category']} | {status} | {cal} | {pro} | {carb} | {fat} | {r['elapsed_seconds']}s |")
    lines.append("")

    # Observations section — prepopulated with known systematic issues
    lines += [
        "## Observations",
        "",
        "Known systematic patterns to watch for:",
        "",
        "- **Raw vs cooked confusion**: The agent may report values for raw food when the query",
        "  specifies cooked (or vice versa). Chicken breast cooked vs raw differs ~15% in calories",
        "  due to water loss. Rice cooked vs dry differs ~3x.",
        "- **Serving size ambiguity**: Queries like '1 cup oatmeal' are ambiguous (raw vs cooked);",
        "  the agent should prefer the cooked interpretation when not specified.",
        "- **Branded items**: CLIF Bar and McDonald's items require web search tool calls for accurate",
        "  values. A high tool-use rate for these cases is expected and desirable.",
        "- **Fat subtype fields**: Polyunsaturated/monounsaturated fat estimates are the least",
        "  reliable — these are rarely memorized precisely and web sources often omit them.",
        "",
        "## How to Re-run",
        "",
        "```bash",
        "# From the llm-nutrition-api/ directory:",
        "GEMMA_MODEL_PATH=/path/to/gemma-4-E2B-it-Q5_K_M.gguf cargo run &",
        "sleep 5  # wait for model to load",
        "python3 eval/run_evals.py --url http://localhost:3031 --output eval/results/",
        "```",
    ]

    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3031", help="Base URL of the running service")
    parser.add_argument("--dataset", default=os.path.join(os.path.dirname(__file__), "dataset.json"))
    parser.add_argument("--output", default=os.path.join(os.path.dirname(__file__), "results"))
    args = parser.parse_args()
    run_evals(args.url, args.dataset, args.output)
