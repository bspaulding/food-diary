# VLM Label Parser — Living Eval Summary

This is the running index of every label-parsing eval run against `nutrition-fact-labeller`'s
33-case `test_cases.csv` / `images/` suite. Each row links to a dated report with the full
methodology, raw findings, and takeaways. **Update this file whenever a new eval is run** —
append a row, link the detailed report, and fold any new failure pattern into the Known Issues
section below so it doesn't get rediscovered from scratch next time.

Harnesses:
- `cargo run --release --bin vlm_benchmark` — VLM does the full image → structured JSON extraction.
- `cargo run --release --bin vlm_ocr_benchmark` — VLM is used purely as OCR; output goes through
  the shared `parsing::parse_facts_from_lines` regex/spellcheck parser (same one PaddleOCR uses).
- PaddleOCR baseline — the default non-LLM backend (`run_ocr_rgb` + `parse_facts_from_regions` in
  `main.rs`), scored via the `check_test_cases` test. **Not independently re-verified in this
  environment** — that test needs local PaddleOCR ONNX model weight files
  (`paddleocr-models/*.onnx`) that aren't present in this sandbox. The 9/33 baseline figure is
  taken from the pre-existing `BASELINE_PASS`/`BASELINE_TOTAL` constants in `vlm_benchmark.rs`.

## Results

| Date/time (UTC) | Commit | Model | Approach | Score | vs. baseline (9/33) | Report |
|---|---|---|---|---|---|---|
| 2026-07-11 01:42 | `7745229` | MiniCPM-V-4.6-Q4_K_M | Full JSON extraction | 0/33 | ▼ −9 | [2026-07-11-minicpm-v-4.6-q4_k_m.md](2026-07-11-minicpm-v-4.6-q4_k_m.md) |
| 2026-07-11 03:15 | `a1db43e` | MiniCPM-V-4.6-Q4_K_M | OCR-only, original line-based parser | 0/33 | ▼ −9 | [2026-07-11-minicpm-v-4.6-ocr-only.md](2026-07-11-minicpm-v-4.6-ocr-only.md) |
| 2026-07-11 17:11 | `0003ea0` | MiniCPM-V-4.6-Q4_K_M | OCR-only, resilient parser (blob fallback) | **11/33** | **▲ +2** | [2026-07-11-minicpm-v-4.6-ocr-only.md](2026-07-11-minicpm-v-4.6-ocr-only.md) |
| 2026-07-11 17:53 | `cd37241` | SmolVLM-256M-Instruct-Q8_0 | Full JSON extraction | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 17:53 | `cd37241` | SmolVLM-500M-Instruct-Q8_0 | Full JSON extraction | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 18:08 | `cd37241` | SmolVLM-256M-Instruct-Q8_0 | OCR-only, resilient parser | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 18:08 | `cd37241` | SmolVLM-500M-Instruct-Q8_0 | OCR-only, resilient parser | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| — | — | PaddleOCR (baseline) | OCR + regex, unmodified | 9/33 | = | not independently re-verified here; see caveat above |

Commit = the code state the run was actually executed against (usually the commit that lands
right after the run, since reports are written and committed once results are in hand).

## Known issues (synthesized across runs — update as new patterns show up)

1. **JSON type-strictness (full-JSON-extraction approach).** MiniCPM-V 4.6 mostly reads label
   values correctly but returns them as JSON *strings*, often with units baked in (`"30g"`,
   `"<1g"`) instead of bare numbers, despite the prompt explicitly asking for `<number|null>`.
   `serde_json::from_str::<ParsedNutritionFacts>` is strict about field types, so this fails
   deserialization outright rather than producing a wrong-but-parseable result. **Not yet fixed**
   — candidate fixes (discussed, not built): a lenient coercion layer over `serde_json::Value`
   before deserializing, or grammar-constrained decoding (`llama-cpp-2` already exposes
   `LlamaSampler::grammar()` / an `llguidance` JSON-schema sampler) to force numeric-typed output
   at generation time.

2. **Line-orientation mismatch (OCR-only approach, now largely mitigated).** `parse_facts`
   (`parsing.rs`) was written assuming roughly one label per line, matching PaddleOCR's
   per-detected-text-box output. VLM transcriptions don't reliably match that shape: they often
   merge a label and its value onto one line (`"Calories 110"` instead of separate lines), and in
   ~1/3 of images ignored the "one line per line" transcription instruction entirely, collapsing
   the whole label into a single run-on paragraph. Fixed by `fill_gaps_from_blob` — an additive
   fallback that scans the full transcription text and picks, per field, the nearest number by
   character distance regardless of line breaks — which took MiniCPM's OCR-only score from 0/33 to
   11/33 (see the 2026-07-11 17:11 run above). Remaining gaps: ~7/22 failures are still off by one
   field (mostly on labels where the correct number falls outside the fallback's search window or
   a nearer wrong number wins), and 2/22 badly-collapsed/bilingual cases aren't recovered by
   distance-based matching alone.

3. **PaddleOCR baseline isn't independently verifiable in this environment.** `check_test_cases`
   needs local ONNX weight files (`paddleocr-models/*.onnx`) that aren't present in this sandbox,
   so its own 9/33 score comes from the pre-existing constants in the codebase rather than a fresh
   run here. Flag this if the baseline itself is ever in question.

4. **Fine-tuning is likely premature.** Discussed but not attempted: this environment has no GPU,
   and the 33-case test set is far too small to fine-tune on directly (and using it as training
   data would remove the only eval set available). Worth revisiting only if structured-output /
   coercion fixes for issue #1 leave a value-*accuracy* gap rather than a formatting gap.

5. **Model-size capability cliff, not just a formatting problem.** SmolVLM-256M/500M scored 0/33 on
   *both* approaches, but not for MiniCPM's reasons. On full-JSON extraction they invent their own
   nested JSON structure instead of following the requested flat schema (a shape failure, not a
   type failure). On OCR-only they either caption/describe the label in prose instead of
   transcribing it verbatim, or fall into a degenerate repetition loop (e.g. "110 calories per
   serving." repeated ~60 times) until hitting the token budget. Neither failure mode is something
   `fill_gaps_from_blob` or a JSON coercion layer can fix — there's no real content to recover.
   Conclusion: below some model-size threshold between SmolVLM (256M/500M) and MiniCPM-V 4.6
   (~8B), instruction-following for "transcribe verbatim" / "match this exact schema" breaks down
   entirely, not just gets formatted wrong. Worth testing something in between — dedicated small
   OCR/document models (PaddleOCR-VL-0.9B, LightOnOCR-2-1B, GLM-OCR-0.9B) or LFM2-VL-450M are
   likely better bets than another general-purpose chat VLM at a similar size, since they're
   trained specifically for dense-text transcription rather than captioning/chat.

## Adding a new model to this table

1. Download the model + mmproj GGUF (must have `llama.cpp` mtmd support for the model's vision
   projector type — check `llama-cpp-sys-2`'s vendored `clip-impl.h` `PROJECTOR_TYPE_NAMES` if
   unsure, or just try it and read the `unknown projector type: ...` error if it fails).
2. Run `vlm_benchmark` and/or `vlm_ocr_benchmark` (see harness commands above) from
   `nutrition-fact-labeller/`.
3. Note `git rev-parse HEAD` (short form is fine) and the current UTC time.
4. Write a dated report (`eval-results/YYYY-MM-DD-<model>-<approach>.md`) following the existing
   reports' structure: Result table, Diagnosis of failure modes, Takeaway, How to re-run.
5. Append a row to the Results table above, and fold any newly-discovered failure pattern into
   Known Issues (or update an existing entry if it's the same root cause recurring).
