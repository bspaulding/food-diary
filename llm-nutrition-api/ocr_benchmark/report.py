"""Aggregate raw per-case CaseResult rows into a summary report."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from .runner import CaseResult, FrontendSkipped
from .schema import FieldSpec


@dataclass
class FrontendSummary:
    frontend: str
    n_cases: int = 0
    n_ok: int = 0
    n_ocr_error: int = 0
    n_extract_error: int = 0
    field_total: int = 0
    field_correct: int = 0
    exact_match_cases: int = 0
    per_field_total: dict[str, int] = field(default_factory=dict)
    per_field_correct: dict[str, int] = field(default_factory=dict)
    ocr_latencies: list[float] = field(default_factory=list)
    extract_latencies: list[float] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def overall_accuracy(self) -> float | None:
        return (self.field_correct / self.field_total) if self.field_total else None

    @property
    def exact_match_rate(self) -> float | None:
        return (self.exact_match_cases / self.n_ok) if self.n_ok else None

    def per_field_accuracy(self) -> dict[str, float | None]:
        return {
            name: (self.per_field_correct.get(name, 0) / total) if total else None
            for name, total in self.per_field_total.items()
        }

    @staticmethod
    def _mean_median(values: list[float]) -> tuple[float | None, float | None]:
        if not values:
            return None, None
        return statistics.mean(values), statistics.median(values)

    def ocr_latency_stats(self) -> tuple[float | None, float | None]:
        return self._mean_median(self.ocr_latencies)

    def extract_latency_stats(self) -> tuple[float | None, float | None]:
        return self._mean_median(self.extract_latencies)


def summarize(
    results: list[CaseResult], skipped: list[FrontendSkipped], field_specs: list[FieldSpec]
) -> dict[str, FrontendSummary]:
    field_names = [spec.name for spec in field_specs]
    summaries: dict[str, FrontendSummary] = {}

    for r in results:
        s = summaries.setdefault(r.frontend, FrontendSummary(frontend=r.frontend))
        s.n_cases += 1
        if r.status == "ocr_error":
            s.n_ocr_error += 1
            s.errors.append(f"{r.image_name}: {r.error}")
            continue
        if r.status == "extract_error":
            s.n_extract_error += 1
            s.errors.append(f"{r.image_name}: {r.error}")
            if r.ocr_latency_s is not None:
                s.ocr_latencies.append(r.ocr_latency_s)
            continue

        s.n_ok += 1
        if r.ocr_latency_s is not None:
            s.ocr_latencies.append(r.ocr_latency_s)
        if r.extract_latency_s is not None:
            s.extract_latencies.append(r.extract_latency_s)

        all_correct = True
        for name in field_names:
            s.per_field_total[name] = s.per_field_total.get(name, 0) + 1
            s.field_total += 1
            correct = r.field_correct.get(name, False)
            if correct:
                s.per_field_correct[name] = s.per_field_correct.get(name, 0) + 1
                s.field_correct += 1
            else:
                all_correct = False
        if all_correct:
            s.exact_match_cases += 1

    for sk in skipped:
        summaries.setdefault(sk.frontend, FrontendSummary(frontend=sk.frontend))

    return summaries


def find_universal_field_failures(
    results: list[CaseResult], field_specs: list[FieldSpec]
) -> dict[str, list[str]]:
    """image_name -> [field names] where every frontend that ran on that case
    got that field wrong. A likely schema/ground-truth issue, not a model
    failure, per case-by-case, field-by-field.
    """
    by_case: dict[str, list[CaseResult]] = {}
    for r in results:
        if r.status == "ok":
            by_case.setdefault(r.image_name, []).append(r)

    flagged: dict[str, list[str]] = {}
    for image_name, case_results in by_case.items():
        if len(case_results) < 2:
            continue  # need at least 2 frontends agreeing on failure to be interesting
        bad_fields = []
        for spec in field_specs:
            if all(not r.field_correct.get(spec.name, False) for r in case_results):
                bad_fields.append(spec.name)
        if bad_fields:
            flagged[image_name] = bad_fields
    return flagged


def render_markdown(
    summaries: dict[str, FrontendSummary],
    skipped: list[FrontendSkipped],
    field_specs: list[FieldSpec],
    universal_failures: dict[str, list[str]],
) -> str:
    lines: list[str] = []
    lines.append("# OCR Frontend Benchmark Report\n")

    ranked = sorted(
        (s for s in summaries.values() if s.overall_accuracy is not None),
        key=lambda s: s.overall_accuracy,
        reverse=True,
    )
    did_not_run = [s for s in summaries.values() if s.overall_accuracy is None]

    lines.append("## Ranked (best to worst, by overall field accuracy)\n")
    lines.append("| Rank | Frontend | Field Accuracy | Exact-Match Cases | Cases Run | OCR errors | Extract errors |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, s in enumerate(ranked, start=1):
        lines.append(
            f"| {i} | {s.frontend} | {s.overall_accuracy:.1%} | "
            f"{s.exact_match_rate:.1%} | {s.n_cases} | {s.n_ocr_error} | {s.n_extract_error} |"
        )
    lines.append("")

    if did_not_run:
        lines.append("## Frontends that failed to run at all\n")
        for s in did_not_run:
            reason = next((sk.reason for sk in skipped if sk.frontend == s.frontend), "no cases ran")
            lines.append(f"- **{s.frontend}**: {reason}")
        lines.append("")

    lines.append("## Per-frontend detail\n")
    for s in ranked:
        lines.append(f"### {s.frontend}\n")
        lines.append(f"- Overall field accuracy: {s.overall_accuracy:.1%} ({s.field_correct}/{s.field_total} fields)")
        lines.append(f"- Exact-match case rate: {s.exact_match_rate:.1%} ({s.exact_match_cases}/{s.n_ok} cases)")
        om, omed = s.ocr_latency_stats()
        em, emed = s.extract_latency_stats()
        lines.append(f"- OCR latency: mean {om:.2f}s, median {omed:.2f}s" if om is not None else "- OCR latency: n/a")
        lines.append(f"- Extraction latency: mean {em:.2f}s, median {emed:.2f}s" if em is not None else "- Extraction latency: n/a")
        lines.append(f"- Errors: {s.n_ocr_error} OCR, {s.n_extract_error} extraction")
        lines.append("")
        lines.append("| Field | Accuracy |")
        lines.append("|---|---|")
        pfa = s.per_field_accuracy()
        for spec in field_specs:
            acc = pfa.get(spec.name)
            lines.append(f"| {spec.name} | {acc:.1%} |" if acc is not None else f"| {spec.name} | n/a |")
        lines.append("")
        if s.errors:
            lines.append("<details><summary>Errors (first 10)</summary>\n")
            for e in s.errors[:10]:
                lines.append(f"- {e}")
            lines.append("\n</details>\n")

    lines.append("## Likely schema/ground-truth issues\n")
    if universal_failures:
        lines.append(
            "Cases where every frontend that ran got the same field wrong "
            "(worth double-checking ground truth or the schema, not the models):\n"
        )
        for image_name, bad_fields in sorted(universal_failures.items()):
            lines.append(f"- **{image_name}**: {', '.join(bad_fields)}")
    else:
        lines.append("None found.")
    lines.append("")

    return "\n".join(lines)
