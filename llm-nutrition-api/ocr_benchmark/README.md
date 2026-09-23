# OCR frontend benchmark

Benchmarks several small OCR frontends paired with Needle (Cactus Compute) for
structured extraction from nutrition-label photos:

```
image -> OCR frontend -> raw text -> needle.extract(raw_text, Schema) -> structured fields
```

For every (frontend, test case) pair, the harness compares the extracted fields against
`test_cases.csv`'s ground truth and produces a comparison report (per-field accuracy,
exact-match rate, latency, errors) ranked best to worst.

## Installing Needle

Cactus Compute's Needle is published on PyPI as **`cactus-needle`** (not `needle` — that
name on PyPI belongs to an unrelated Selenium-based visual-regression testing tool, so
don't `pip install needle` directly). The importable module is `needle`, matching the
brief exactly:

```bash
pip install cactus-needle
python -c "import needle; print(needle.extract)"
```

`runner.py`'s `_needle_extract()` does `import needle; needle.extract(raw_text, schema_model)`,
which is `cactus-needle`'s real API (`needle.extract(text, schema, ...) -> schema instance |
dict | None`, using the Pydantic model built from the CSV header as `schema`). Needle
downloads its own small (8–29MB) on-device model from Hugging Face on first use.

## Layout

```
ocr_benchmark/
  frontends/
    base.py         OCRFrontend interface (extract_text(image_path) -> str)
    registry.py      (frontends/__init__.py) lazy-construction registry + skip handling
    paddle_ocr.py    PaddleOCR-mobile / PP-OCRv4
    got_ocr2.py      GOT-OCR2.0
    smolvlm2.py      SmolVLM2 (256M)
    florence2.py     Florence-2 (<OCR> task token)
    moondream2.py    Moondream2
  schema.py          Dynamic Pydantic schema built from the CSV header
  dataset.py         Loads test_cases.csv + resolves image paths
  scoring.py         Normalization + configurable numeric tolerance
  runner.py          Runs (frontend x test case), calls needle.extract, scores, records
  report.py          Aggregates raw results into the summary report
  cli.py             `python -m ocr_benchmark.cli`
```

## Running it

```bash
cd llm-nutrition-api
pip install -r ocr_benchmark/requirements.txt   # pydantic + needle, plus whichever
                                                 # frontend deps you want (see the file)
python -m ocr_benchmark.cli \
  --csv test_cases.csv \
  --images-dir images \
  --output-dir ocr_benchmark_results \
  --frontends paddleocr got_ocr2 smolvlm2 florence2 moondream2 \
  --numeric-tolerance 0.5 \
  --limit 10   # optional, for a quick smoke run
```

Outputs, all under `--output-dir`:
- `raw_results.jsonl` — one row per (frontend, test case): OCR + extraction latency,
  predicted vs. expected value per field, per-field correctness, raw OCR text, and any
  error. This is the audit trail; the report is derived entirely from it.
- `report.md` / `report.json` — the aggregated report (see below).

A frontend whose dependencies aren't installed (or whose weights fail to download/load)
is caught at construction time and recorded as **skipped** with the exception message as
the reason — it never aborts the run for the other frontends. A per-case OCR or extraction
error is likewise caught and recorded as an error row for that one case, not a crash.

## Report contents

Per frontend: overall (micro, across every field/case) accuracy, per-field accuracy
breakdown, exact-match case rate (every field correct), mean/median OCR latency,
mean/median extraction latency, and error/skip counts with reasons. Plus:
- A final table ranking frontends best to worst by overall accuracy, with frontends that
  failed to run at all called out separately.
- A "likely schema/ground-truth issue" section: any image where **every** frontend that
  ran on it got the same field wrong (with at least two frontends' agreement) — that
  pattern points at a bad ground-truth value or a schema mismatch, not five independent
  model failures on the same field.

## Adding a new frontend

1. Create `frontends/my_frontend.py`:

   ```python
   from .base import OCRFrontend

   class MyFrontend(OCRFrontend):
       name = "My Frontend"

       def __init__(self) -> None:
           # Import/load model here, NOT at module scope -- this is what
           # keeps a missing dependency from breaking every other frontend.
           import my_ocr_lib
           self._model = my_ocr_lib.load(...)

       def extract_text(self, image_path: str) -> str:
           return self._model.run(image_path)
   ```

2. Register it in `frontends/__init__.py`:

   ```python
   def _my_frontend() -> OCRFrontend:
       from .my_frontend import MyFrontend
       return MyFrontend()

   _register("my_frontend", _my_frontend)
   ```

3. Run it: `python -m ocr_benchmark.cli --frontends my_frontend`.

No other file needs to change — schema inference, scoring, the runner, and the report are
all frontend-agnostic.

## Tolerance / normalization

Configurable, not hardcoded per field (`scoring.py`):
- String fields: `strip()` + `casefold()` before comparing.
- Numeric fields (int/float, inferred from the CSV column): correct if
  `abs(predicted - expected) <= max(--numeric-tolerance, abs(expected) * --numeric-tolerance-pct)`.
  Both default to `0` (exact match); set either via the CLI to loosen scoring for OCR/VLM
  noise (e.g. `--numeric-tolerance 0.5` for a half-gram/half-calorie band).

## Field-type inference

`schema.py` infers each non-ID CSV column's type by sampling every row: `int` if every
value parses as a whole number, `float` if every value is numeric but at least one has a
fractional part, else `str`. The first CSV column is always treated as the image
identifier and excluded from the schema (this dataset's column is named `file`, not
`image_name`, but the harness only relies on it being first).

## Known environment constraints in this run

This harness was validated end-to-end (OCR -> text -> extraction call -> scoring ->
report) against the real `test_cases.csv` and `images/` in this repo. In the sandboxed
environment the run was produced in:

- **PaddleOCR-mobile (PP-OCRv4)** ran for real: it downloaded the actual PP-OCRv4 mobile
  det/rec weights and produced real OCR text for every image.
- **Needle (`cactus-needle`)** ran for real: it downloaded its own small on-device model
  from Hugging Face and extracted structured fields from every PaddleOCR text output.
- **GOT-OCR2.0, SmolVLM2, Florence-2, Moondream2** all require `torch`/`transformers`,
  which weren't installed for this run (multi-GB download, no GPU available) — each is
  recorded as **skipped** with its `ModuleNotFoundError` reason, exactly as the harness is
  designed to handle a missing frontend. The adapters are complete and will run for real
  once `pip install torch transformers accelerate pillow` is done in an environment with
  more headroom.
