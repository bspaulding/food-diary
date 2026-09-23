"""Build a Pydantic extraction schema dynamically from the test_cases.csv header.

The first CSV column is always the image identifier (e.g. "file" or
"image_name") and is excluded from the schema; every other column becomes
one schema field. Field type is inferred by sampling that column's values
across all rows: int if every value parses as an integer, float if every
value parses as a number but at least one has a fractional part, else str.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FieldSpec:
    name: str
    type: type  # int | float | str


def _infer_field_type(values: list[str]) -> type:
    all_int = True
    all_float = True
    for raw in values:
        v = raw.strip()
        if v == "":
            continue
        try:
            f = float(v)
        except ValueError:
            all_int = False
            all_float = False
            break
        if not f.is_integer():
            all_int = False
        try:
            int(v)
        except ValueError:
            all_int = False
    if all_int:
        return int
    if all_float:
        return float
    return str


def infer_schema(header: list[str], rows: list[list[str]]) -> tuple[str, list[FieldSpec]]:
    """Returns (id_column_name, field_specs) for every column after the first."""
    id_column = header[0]
    field_names = header[1:]
    columns = list(zip(*rows)) if rows else [[] for _ in field_names]
    # columns[0] is the id column; field columns start at index 1.
    specs = [
        FieldSpec(name=name, type=_infer_field_type(list(columns[i + 1]) if rows else []))
        for i, name in enumerate(field_names)
    ]
    return id_column, specs


def build_pydantic_model(field_specs: list[FieldSpec], model_name: str = "ExtractedFields"):
    """Build a Pydantic BaseModel with one field per FieldSpec, for needle.extract()."""
    from pydantic import create_model

    fields = {spec.name: (spec.type, ...) for spec in field_specs}
    return create_model(model_name, **fields)
