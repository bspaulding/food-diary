"""Field comparison: normalization + tolerance rules, configurable rather than
hardcoded per field.

Two axes of configuration, both settable from the CLI (see cli.py):
  - `numeric_tolerance`: absolute tolerance applied to any field typed
    int/float (default 0.0 == exact numeric match).
  - `numeric_tolerance_pct`: relative tolerance (fraction of the expected
    value), applied in addition to the absolute tolerance when set --
    a prediction is correct if it falls within *either*.

String fields are always normalized as strip + casefold before comparing.
"""

from __future__ import annotations

from dataclasses import dataclass

from .schema import FieldSpec


@dataclass(frozen=True)
class ToleranceConfig:
    numeric_tolerance: float = 0.0
    numeric_tolerance_pct: float = 0.0


def _normalize_str(value: object) -> str:
    return str(value).strip().casefold()


def _to_float(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fields_match(spec: FieldSpec, predicted: object, expected: object, tol: ToleranceConfig) -> bool:
    if predicted is None:
        return False
    if spec.type in (int, float):
        p = _to_float(predicted)
        e = _to_float(expected)
        if p is None or e is None:
            return False
        allowed = max(tol.numeric_tolerance, abs(e) * tol.numeric_tolerance_pct)
        return abs(p - e) <= allowed
    return _normalize_str(predicted) == _normalize_str(expected)
