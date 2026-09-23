"""Core harness loop: for each (frontend, test_case), run
image -> OCR -> raw text -> needle.extract(raw_text, Schema) -> structured
fields, score against ground truth, and record one result row.

A per-case error (OCR crash, extraction crash, image missing) is caught and
recorded as an error row rather than aborting the run; a frontend that
fails to *load* at all is recorded once as "skipped" and none of its cases
run.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from . import frontends as frontend_registry
from .dataset import TestCase
from .schema import FieldSpec, build_pydantic_model
from .scoring import ToleranceConfig, fields_match


@dataclass
class CaseResult:
    frontend: str
    image_name: str
    status: str  # "ok" | "ocr_error" | "extract_error"
    error: str | None = None
    ocr_latency_s: float | None = None
    extract_latency_s: float | None = None
    raw_text: str | None = None
    predicted: dict[str, object] = field(default_factory=dict)
    expected: dict[str, object] = field(default_factory=dict)
    field_correct: dict[str, bool] = field(default_factory=dict)


@dataclass
class FrontendSkipped:
    frontend: str
    reason: str


def _needle_extract(raw_text: str, schema_model):
    """Call Cactus Compute's Needle: needle.extract(text, Model) -> Model instance.

    Imported lazily so a missing `needle` package only fails extraction
    (recorded per-case as extract_error), not the whole harness.
    """
    import needle  # noqa: PLC0415

    return needle.extract(raw_text, schema_model)


def run_frontend(
    key: str,
    field_specs: list[FieldSpec],
    cases: list[TestCase],
    tolerance: ToleranceConfig,
    results_path: Path,
) -> FrontendSkipped | list[CaseResult]:
    ocr_frontend, skip_reason = frontend_registry.build(key)
    if ocr_frontend is None:
        return FrontendSkipped(frontend=key, reason=skip_reason or "unknown error")

    schema_model = build_pydantic_model(field_specs)
    results: list[CaseResult] = []

    with results_path.open("a") as out:
        for case in cases:
            result = CaseResult(
                frontend=ocr_frontend.name,
                image_name=case.image_name,
                status="ok",
                expected=dict(case.expected),
            )

            if not case.image_path.exists():
                result.status = "ocr_error"
                result.error = f"image not found: {case.image_path}"
                results.append(result)
                out.write(json.dumps(asdict(result)) + "\n")
                out.flush()
                continue

            t0 = time.monotonic()
            try:
                raw_text = ocr_frontend.extract_text(str(case.image_path))
            except Exception as exc:  # noqa: BLE001 - per-case isolation by design
                result.status = "ocr_error"
                result.error = f"{type(exc).__name__}: {exc}"
                result.ocr_latency_s = time.monotonic() - t0
                results.append(result)
                out.write(json.dumps(asdict(result)) + "\n")
                out.flush()
                continue
            result.ocr_latency_s = time.monotonic() - t0
            result.raw_text = raw_text

            t1 = time.monotonic()
            try:
                extracted = _needle_extract(raw_text, schema_model)
            except Exception as exc:  # noqa: BLE001
                result.status = "extract_error"
                result.error = f"{type(exc).__name__}: {exc}"
                result.extract_latency_s = time.monotonic() - t1
                results.append(result)
                out.write(json.dumps(asdict(result)) + "\n")
                out.flush()
                continue
            result.extract_latency_s = time.monotonic() - t1

            if extracted is None:
                result.status = "extract_error"
                result.error = "needle.extract returned None (no match)"
                results.append(result)
                out.write(json.dumps(asdict(result)) + "\n")
                out.flush()
                continue

            predicted = extracted.model_dump() if hasattr(extracted, "model_dump") else dict(extracted)
            result.predicted = predicted
            result.field_correct = {
                spec.name: fields_match(
                    spec, predicted.get(spec.name), case.expected.get(spec.name), tolerance
                )
                for spec in field_specs
            }
            results.append(result)
            out.write(json.dumps(asdict(result)) + "\n")
            out.flush()

    return results


def run_all(
    frontend_keys: list[str],
    field_specs: list[FieldSpec],
    cases: list[TestCase],
    tolerance: ToleranceConfig,
    results_path: Path,
) -> tuple[list[CaseResult], list[FrontendSkipped]]:
    all_results: list[CaseResult] = []
    skipped: list[FrontendSkipped] = []
    for key in frontend_keys:
        outcome = run_frontend(key, field_specs, cases, tolerance, results_path)
        if isinstance(outcome, FrontendSkipped):
            skipped.append(outcome)
        else:
            all_results.extend(outcome)
    return all_results, skipped
