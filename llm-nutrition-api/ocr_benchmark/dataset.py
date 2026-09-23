"""Load test_cases.csv into typed ground-truth rows."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .schema import FieldSpec, infer_schema


@dataclass(frozen=True)
class TestCase:
    image_name: str
    image_path: Path
    expected: dict[str, object]  # field name -> typed ground-truth value


def _coerce(raw: str, field_type: type) -> object:
    raw = raw.strip()
    if field_type is int:
        return int(float(raw))
    if field_type is float:
        return float(raw)
    return raw


def load_dataset(csv_path: Path, images_dir: Path) -> tuple[list[FieldSpec], list[TestCase]]:
    with csv_path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    _id_column, field_specs = infer_schema(header, rows)

    cases: list[TestCase] = []
    for row in rows:
        image_name = row[0].strip()
        expected = {
            spec.name: _coerce(value, spec.type) for spec, value in zip(field_specs, row[1:])
        }
        cases.append(
            TestCase(image_name=image_name, image_path=images_dir / image_name, expected=expected)
        )
    return field_specs, cases
