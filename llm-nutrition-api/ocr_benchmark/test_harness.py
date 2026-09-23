"""Unit tests for the frontend-agnostic parts of the harness: schema inference
and scoring. Run with: python -m pytest ocr_benchmark/test_harness.py -q
"""

from ocr_benchmark.schema import FieldSpec, infer_schema
from ocr_benchmark.scoring import ToleranceConfig, fields_match


def test_infer_schema_types():
    header = ["file", "calories", "total_fat_grams", "notes"]
    rows = [
        ["a.png", "110", "1.5", "trace"],
        ["b.png", "150", "2.0", "none"],
    ]
    id_column, specs = infer_schema(header, rows)
    assert id_column == "file"
    by_name = {s.name: s.type for s in specs}
    assert by_name["calories"] is int
    assert by_name["total_fat_grams"] is float
    assert by_name["notes"] is str


def test_numeric_exact_match():
    spec = FieldSpec(name="calories", type=int)
    tol = ToleranceConfig()
    assert fields_match(spec, 110, 110, tol)
    assert not fields_match(spec, 111, 110, tol)


def test_numeric_absolute_tolerance():
    spec = FieldSpec(name="total_fat_grams", type=float)
    tol = ToleranceConfig(numeric_tolerance=0.5)
    assert fields_match(spec, 1.9, 1.5, tol)
    assert not fields_match(spec, 2.1, 1.5, tol)


def test_numeric_percent_tolerance():
    spec = FieldSpec(name="sodium_mg", type=float)
    tol = ToleranceConfig(numeric_tolerance_pct=0.1)
    assert fields_match(spec, 385, 350, tol)  # within 10%
    assert not fields_match(spec, 400, 350, tol)


def test_string_normalization():
    spec = FieldSpec(name="brand", type=str)
    tol = ToleranceConfig()
    assert fields_match(spec, "  Kirkland  ", "kirkland", tol)


def test_missing_predicted_never_matches():
    spec = FieldSpec(name="calories", type=int)
    tol = ToleranceConfig()
    assert not fields_match(spec, None, 110, tol)
