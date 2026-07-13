# VLM Label Parser — Living Eval Summary

This is the running index of every label-parsing eval run against `nutrition-fact-labeller`'s
33-case `test_cases.csv` / `images/` suite. Each row links to a dated report with the full
methodology, raw findings, and takeaways. **Update this file whenever a new eval is run** —
append a row, link the detailed report, and fold any new failure pattern into the Known Issues
section below so it doesn't get rediscovered from scratch next time.

Harnesses:
- `cargo run --release --bin vlm_benchmark` — local llama.cpp VLM does the full image → structured
  JSON extraction. Accepts `--limit N` to cap the number of images processed (useful for a quick
  smoke test — see below).
- `cargo run --release --bin vlm_benchmark_api` — same full-JSON-extraction eval, against hosted
  API models (e.g. OpenRouter) instead of local GGUF files.
- PaddleOCR baseline, `vlm_ocr_benchmark` (VLM-as-OCR + regex/spellcheck parser), and the
  `parsing.rs`/`spellcheck.rs` modules that backed them were **removed 2026-07-13** (see Known
  Issues #14) once Gemma-4-31B via OpenRouter (100% all-fields) became the operational default —
  PaddleOCR's 9/33 baseline figure and the OCR-only harness's historical results remain in the
  Results table below for reference, but neither can be re-run anymore.

**Model manifest:** [`models.toml`](../models.toml) is the single source of truth for every model
this project is tracking — HF repo, filenames, confirmed llama.cpp projector-type support, and
notes/status per model. `scripts/fetch-model.sh <key>` downloads a model's files from the
manifest; `scripts/run-eval.sh <key> [--smoke [N]]` fetches (if needed) and runs `vlm_benchmark`.
`--smoke` runs just 2 images (or N) to verify a model loads and produces real output without
committing to a full 33-image run — see "Smoke-tested, not yet fully evaluated" below for models
that are ready for a full run whenever compute allows.

## Results

**All-fields is the primary metric, whole-record is secondary.** Whole-record ("Score") requires
all 11 fields correct simultaneously in one case, which understates real accuracy for models that
get most fields right but rarely all 11 at once (e.g. InternVL3-1B: 3/33 whole-record but 77.4% of
individual fields correct). All-fields = total correct fields out of 33 cases × 11 fields (363),
partial credit per field. `vlm_benchmark`/`vlm_ocr_benchmark` compute and print this natively as of
the per-field-scoring feature added 2026-07-12 (see Known Issues, and `FieldScore`/`field_matches`
in `src/lib.rs`); the 2026-07-12 rows below were computed from that session's raw logs using
equivalent logic before the feature existed in the binaries (verified by cross-checking against
each row's already-recorded whole-record score). No PaddleOCR baseline all-fields figure is
available — `check_test_cases` doesn't emit per-field results, so there's nothing to diff against
for that column; the baseline comparison below only applies to whole-record. Rows predating this
session (MiniCPM-V 4.6, SmolVLM) show "n/a" for All-fields since their raw logs no longer exist to
retroactively compute it.

| Date/time (UTC) | Commit | Model | Approach | All-fields (primary) | Whole-record (secondary) | vs. baseline (9/33, whole-record) | Report |
|---|---|---|---|---|---|---|---|
| 2026-07-11 01:42 | `7745229` | MiniCPM-V-4.6-Q4_K_M | Full JSON extraction | n/a | 0/33 | ▼ −9 | [2026-07-11-minicpm-v-4.6-q4_k_m.md](2026-07-11-minicpm-v-4.6-q4_k_m.md) |
| 2026-07-11 03:15 | `a1db43e` | MiniCPM-V-4.6-Q4_K_M | OCR-only, original line-based parser | n/a | 0/33 | ▼ −9 | [2026-07-11-minicpm-v-4.6-ocr-only.md](2026-07-11-minicpm-v-4.6-ocr-only.md) |
| 2026-07-11 17:11 | `0003ea0` | MiniCPM-V-4.6-Q4_K_M | OCR-only, resilient parser (blob fallback) | n/a | **11/33** | **▲ +2** | [2026-07-11-minicpm-v-4.6-ocr-only.md](2026-07-11-minicpm-v-4.6-ocr-only.md) |
| 2026-07-11 17:53 | `cd37241` | SmolVLM-256M-Instruct-Q8_0 | Full JSON extraction | n/a | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 17:53 | `cd37241` | SmolVLM-500M-Instruct-Q8_0 | Full JSON extraction | n/a | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 18:08 | `cd37241` | SmolVLM-256M-Instruct-Q8_0 | OCR-only, resilient parser | n/a | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 18:08 | `cd37241` | SmolVLM-500M-Instruct-Q8_0 | OCR-only, resilient parser | n/a | 0/33 | ▼ −9 | [2026-07-11-smolvlm-256m-500m.md](2026-07-11-smolvlm-256m-500m.md) |
| 2026-07-11 23:49 | `2b83b0e` | GLM-OCR-Q8_0 | Full JSON extraction | 171/363 (47.1%) | 1/33 | ▼ −8 | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-11 23:49 | `2b83b0e` | GLM-OCR-Q8_0 | OCR-only, resilient parser | 312/363 (86.0%) | **19/33** | **▲ +10** | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-11 23:52 | `2b83b0e` | LFM2.5-VL-1.6B-Q8_0 | Full JSON extraction | **343/363 (94.5%)** | **21/33** | **▲ +12** | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-11 23:52 | `2b83b0e` | LFM2.5-VL-1.6B-Q8_0 | OCR-only, resilient parser | 314/363 (86.5%) | 15/33 | ▲ +6 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 00:05 | `2b83b0e` | LightOnOCR-1B-1025-Q8_0 | Full JSON extraction | 0/363 (0.0%) | 0/33 | ▼ −9 | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-12 00:05 | `2b83b0e` | LightOnOCR-1B-1025-Q8_0 | OCR-only, resilient parser | 289/363 (79.6%) | 6/33 | ▼ −3 | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-12 00:33 | `2b83b0e` | GLM-Edge-V-2B-Q4_K_M | Full JSON extraction | 121/363 (33.3%) | 2/33 | ▼ −7 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 00:33 | `2b83b0e` | GLM-Edge-V-2B-Q4_K_M | OCR-only, resilient parser | 278/363 (76.6%) | 8/33 | ▼ −1 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 00:36 | `2b83b0e` | LFM2-VL-450M-Q8_0 | Full JSON extraction | 246/363 (67.8%) | 2/33 | ▼ −7 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 00:36 | `2b83b0e` | LFM2-VL-450M-Q8_0 | OCR-only, resilient parser | 300/363 (82.6%) | 7/33 | ▼ −2 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 01:10 | `2b83b0e` | InternVL3-1B-Instruct-Q8_0 | Full JSON extraction | 281/363 (77.4%) | 3/33 | ▼ −6 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 01:10 | `2b83b0e` | InternVL3-1B-Instruct-Q8_0 | OCR-only, resilient parser | 247/363 (68.0%) | 4/33 | ▼ −5 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 02:09 | `2b83b0e` | PaddleOCR-VL-0.9B | Full JSON extraction | 0/363 (0.0%) | 0/33 | ▼ −9 | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-12 02:09 | `2b83b0e` | PaddleOCR-VL-0.9B | OCR-only, resilient parser | 64/363 (17.6%) | 3/33 | ▼ −6 | [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) |
| 2026-07-12 02:19 | `2b83b0e` | moondream2 | Full JSON extraction | 10/363 (2.8%) | 0/33 | ▼ −9 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 02:19 | `2b83b0e` | moondream2 | OCR-only, resilient parser | 0/363 (0.0%) | 0/33 | ▼ −9 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 02:37 | `2b83b0e` | Qwen2-VL-2B-Instruct-Q4_K_M | Full JSON extraction | **346/363 (95.3%)** | **22/33** | **▲ +13** | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 02:37 | `2b83b0e` | Qwen2-VL-2B-Instruct-Q4_K_M | OCR-only, resilient parser | 313/363 (86.2%) | 14/33 | ▲ +5 | [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md) |
| 2026-07-12 03:30 | `c1eff1b` | Gemma-4-E2B-it-Q4_K_M | Full JSON extraction | 323/363 (89.0%) | 14/33 | ▲ +5 | see models.toml notes (ad-hoc-predecessor result re-verified fresh this session; no standalone report file yet) |
| 2026-07-12 03:30 | `c1eff1b` | Gemma-4-E2B-it-Q4_K_M | OCR-only, resilient parser | 265/363 (73.0%) | 12/33 | ▲ +3 | see models.toml notes |
| 2026-07-12 03:45 | `9addc0a` | Gemma-4-E2B-it-Q4_K_M | Full JSON extraction, `<1g`/added-sugars prompt fix | 316/363 (87.1%) ▼ −7 vs. pre-fix | 14/33 (unchanged) | ▲ +5 | see Known Issues #10 and models.toml notes |
| 2026-07-12 04:03 | `9addc0a` | LFM2.5-VL-1.6B-Q8_0 | Full JSON extraction, `<1g`/added-sugars prompt fix | 343/363 (94.5%) (unchanged) | 21/33 (unchanged) | ▲ +12 | see Known Issues #10 |
| 2026-07-12 04:07 | `9addc0a` | Qwen2-VL-2B-Instruct-Q4_K_M | Full JSON extraction, `<1g`/added-sugars prompt fix | **350/363 (96.4%) ▲ +4 vs. pre-fix, new best** | **23/33** | **▲ +14** | see Known Issues #10 |
| 2026-07-13 02:41 | `64713ef` | Gemma-4-E4B-it-Q4_K_M | Full JSON extraction | **341/363 (93.9%)** | **19/33** | **▲ +10** | see Known Issues #11 and models.toml notes (no standalone report file yet) |
| 2026-07-13 02:41 | `64713ef` | Gemma-4-E4B-it-Q4_K_M | OCR-only, resilient parser | 319/363 (87.9%) | 14/33 | ▲ +5 | see Known Issues #11 |
| 2026-07-13 05:55 | `64713ef` | Gemma-4-12B-it-Q4_K_M | Full JSON extraction | 30/363 (8.3%) ▼▼ | 0/33 | ▼ −9 | see Known Issues #11 — unexplained regression, likely technical not capability |
| 2026-07-13 05:55 | `64713ef` | Gemma-4-12B-it-Q4_K_M | OCR-only, resilient parser | 10/363 (2.8%) ▼▼ | 0/33 | ▼ −9 | see Known Issues #11 |
| 2026-07-13 17:08 | `a6593e6` | LFM2.5-VL-1.6B-Q8_0 | Full JSON extraction, consolidated prompt rule (**current prompt**) | **345/363 (95.0%) ▲ +2 vs. two-rule** | **22/33** | **▲ +13** | see Known Issues #12 |
| 2026-07-13 17:13 | `a6593e6` | Qwen2-VL-2B-Instruct-Q4_K_M | Full JSON extraction, consolidated prompt rule (**current prompt**) | 344/363 (94.8%) ▼ −6 vs. two-rule | 20/33 | ▲ +11 | see Known Issues #12 — regression judged within noise margin for n=33, prompt kept anyway |
| 2026-07-13 17:27 | `a6593e6` | Gemma-4-E2B-it-Q4_K_M | Full JSON extraction, consolidated prompt rule (**current prompt**) | **327/363 (90.1%) ▲ +11 vs. two-rule, ▲ +4 vs. no-fix, best version yet** | **16/33** | **▲ +7** | see Known Issues #12 |
| 2026-07-13 17:32 | `a6593e6` | Gemma-4-E4B-it-Q4_K_M | Full JSON extraction, consolidated prompt rule (**current prompt**) | 343/363 (94.5%) ▲ +2 vs. two-rule | 19/33 (unchanged) | ▲ +10 | see Known Issues #12 |
| 2026-07-13 18:25 | `7929912` | Gemma-4-31B-it:free (OpenRouter API, hosted) | Full JSON extraction | 359/363 (98.9%) | 30/33 | ▲ +21 | see Known Issues #13 |
| 2026-07-13 18:40 | `3d5e2c6` | Gemma-4-31B-it:free (OpenRouter API, hosted) | Full JSON extraction, never-null prompt rule | **363/363 (100%) — perfect score, matches the frontier-reference ceiling exactly** | **33/33** | **▲ +24** | see Known Issues #13 |
| 2026-07-13 19:00 | `3d5e2c6` | LFM2.5-VL-1.6B-Q8_0 | Full JSON extraction, never-null prompt rule | **349/363 (96.1%) ▲ +4 vs. consolidated, new sub-2B best** | **23/33** | **▲ +14** | see Known Issues #13 |
| 2026-07-13 19:04 | `3d5e2c6` | Qwen2-VL-2B-Instruct-Q4_K_M | Full JSON extraction, never-null prompt rule | 348/363 (95.9%) ▲ +4 vs. consolidated | 21/33 | ▲ +12 | see Known Issues #13 |
| — | — | PaddleOCR (baseline) | OCR + regex, unmodified | n/a | 9/33 | = | not independently re-verified here; see caveat above |

Commit = the code state the run was actually executed against (usually the commit that lands
right after the run, since reports are written and committed once results are in hand).

**Gemma-4-31B via OpenRouter is now the clear overall best — 100% all-fields, 33/33 whole-record,
a perfect score after the never-null prompt fix — well ahead of every self-hosted candidate. See
Known Issues #13.** Among the sub-2B self-hosted GGUF candidates (the deployment-realistic tier),
after the never-null prompt fix (also Known Issues #13) the top is still effectively a **near-tie
between LFM2.5-VL-1.6B full-JSON (96.1%) and Qwen2-VL-2B full-JSON (95.9%)** — a 0.2-point gap
that isn't meaningfully distinguishable at n=33 cases, same as before the fix, just both a bit
higher. **Gemma-4-E4B full-JSON (94.5%, not yet re-tested with never-null)** and **Gemma-4-E2B
full-JSON (90.1%, also not yet re-tested)** follow close behind, then GLM-OCR OCR-only (86.0%, not
re-tested against the current prompt since OCR-only doesn't use `NUTRITION_PROMPT`). Several models whose whole-record
score looked close to a total failure are actually getting the large majority of individual fields
right: LightOnOCR-1B OCR-only (79.6% all-fields vs. only 6/33 whole-record) and GLM-Edge-V-2B
OCR-only (76.6% vs. 8/33) are the starkest examples. See Known Issues for the per-field breakdown
and the weakest fields (`dietary_fiber_g`, `added_sugars_g`, `cholesterol_mg`) that drag down
nearly every model regardless of size.

**Gemma 4's cross-size comparison (E2B → E4B → 12B) breaks the "bigger is better" expectation at
12B — see Known Issues #11.** E2B → E4B scales as expected, but 12B collapses to 8.3% all-fields,
worse than nearly every model in this project including several outright failures — confirmed as a
real property of the checkpoint (not a config bug) via mmproj-quantization and GGUF-converter A/B
tests, see #11 for the full investigation.

## Frontier reference: Claude (Sonnet 5) reading the images directly

**2026-07-13 — 33/33 whole-record, 363/363 (100%) all-fields.** Not a harness run: Claude read
each of the 33 label images directly (via its own multimodal vision, no GGUF/API model involved)
and manually extracted the same 11 fields, applying the same conventions implicit in
`test_cases.csv`'s ground truth — round `<1g`/"less than 1g" up to 1, use the literal number for
"less than Xmg" phrasing (e.g. "less than 5mg" → 5), infer 0 for an absent Added Sugars line when
Total Sugars is itself 0, and prefer the first/"dry mix"/"cereal alone" column over "as
prepared"/"with milk" when a label shows two serving contexts side by side (matching the pattern
every ground-truth row already follows). Every one of the 33 extractions matched ground truth
exactly on all 11 fields — no misses, no partial credit needed.

**This is a ceiling/upper-bound reference point, not an apples-to-apples comparison with the
harness runs above — three real methodological differences, not just "Claude is smarter":**
1. **No output-length or token-budget constraint.** The small VLMs generate under a capped token
   budget (512 tokens) via greedy decoding in one shot; Claude reasoned through each image without
   that constraint.
2. **No blind schema-only prompt.** Claude had visibility into `test_cases.csv`'s column
   structure/field names while doing this (they'd already been read earlier in the session), which
   could plausibly help resolve ambiguous cases (e.g. knowing to expect a `serving_size_grams`
   field primes attention toward the correct number when a label shows several). The small VLMs
   only ever see `NUTRITION_PROMPT`'s schema description, not the actual ground truth file.
3. **Not independently graded.** Both the extraction and the scoring were done by Claude in the
   same pass, with no separate/blind verification step the way the automated harness's
   `assert_eq!`-style comparison provides for the GGUF/API models.
**Practical takeaway**: this confirms the task is fully solvable from the images as given (no
label is illegible or genuinely ambiguous beyond the conventions above) and establishes how much
headroom remains — the current best small-VLM result (Qwen2-VL-2B / LFM2.5-VL-1.6B, ~95% all-fields)
is close to this ceiling but not at it, and the ~5-point gap is concentrated in exactly the fields
already identified as universal weak points (`dietary_fiber_g`, `added_sugars_g`, `cholesterol_mg`).

## Smoke-tested, not yet fully evaluated

Empty as of 2026-07-12 — the 9 models smoke-tested on 2026-07-11 (see below) all graduated to full
33-image evals that day/night; see the Results table above and
[2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md) /
[2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md)
for the full writeups. **The smoke-test signal turned out to be an unreliable ranking predictor in
both directions** — see Known Issues #8 below — so treat any future smoke-test-only entries here as
"loads and produces real output," not as a forecast of full-run rank. New smoke-tested-but-unevaluated
candidates should be added back to this table as they come in.

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

5. **Model-size capability cliff, not just a formatting problem — but the cliff has more structure
   than first thought.** SmolVLM-256M/500M scored 0/33 on *both* approaches (see original text
   below), and the follow-up batch confirms the cliff is real but not a single threshold: most
   sub-2B candidates tested since (LightOnOCR-1B, PaddleOCR-VL-0.9B, LFM2-VL-450M, InternVL3-1B,
   GLM-Edge-V-2B, moondream2) also landed at or below the 9/33 baseline, several with the same
   captioning/repetition-loop/refusal failure modes described below. **But two models broke
   through decisively: LFM2.5-VL-1.6B (21/33 full-JSON) and Qwen2-VL-2B-Instruct (22/33
   full-JSON)** — the two best results in the project's history, both via full-JSON extraction
   rather than OCR-only. This means the cliff isn't purely about parameter count: GLM-OCR (0.9B) is
   the best *dedicated-OCR* result (19/33 OCR-only) despite being smaller than several models that
   failed, and the 1.6B–2B general-purpose models are the first to make full-JSON's
   schema-following *and* accurate reading both work simultaneously — a capability combination no
   smaller or mid-size candidate achieved. See
   [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md)
   and
   [2026-07-12-dedicated-ocr-candidates-full-eval.md](2026-07-12-dedicated-ocr-candidates-full-eval.md).
   Original text, still accurate for SmolVLM specifically: on full-JSON extraction SmolVLM invents
   its own nested JSON structure instead of following the requested flat schema (a shape failure,
   not a type failure); on OCR-only it either captions the label in prose instead of transcribing
   it verbatim, or falls into a degenerate repetition loop (e.g. "110 calories per serving."
   repeated ~60 times) until hitting the token budget. Neither failure mode is something
   `fill_gaps_from_blob` or a JSON coercion layer can fix — there's no real content to recover.

6. **`scripts/run-eval.sh` bash-3.2 `unbound variable` bug (fixed 2026-07-11/12).** macOS ships
   bash 3.2 as `/bin/bash` (the last pre-GPLv3 release; Apple never updated it). Under `set -u`,
   expanding `"${LIMIT_ARGS[@]}"` when that array is empty throws `unbound variable` in bash <4.4
   (silent in 4.4+). `--smoke` always populates `LIMIT_ARGS`, so every smoke test worked regardless
   of platform; a plain full run only failed where `bash` resolves to <4.4 — which is exactly what
   happened running this locally on macOS. This bug is environment-specific, not universal: a full
   run of this script on Linux (bash 4+ by default) would never have hit it. Fixed with the
   portable `"${LIMIT_ARGS[@]+"${LIMIT_ARGS[@]}"}"` idiom in both harness invocations in
   `run-eval.sh` so it now works everywhere regardless of the local `bash` version.

7. **`src/parsing.rs:115` index-underflow panic (fixed 2026-07-11/12).** `parse_facts`'s "N,
   Calories" inverse-pair branch read `content[i - 1]` without checking `i > 0`, panicking
   ("index out of bounds ... index is 18446744073709551615", i.e. `0usize - 1` wrapped) whenever a
   transcription's first token was "calories". Crashed GLM-Edge-V-2B's run specifically; fixed by
   guarding with `else if i > 0`. Any future model whose OCR output happens to open with "calories"
   would have hit this pre-fix — worth keeping in mind if an older commit is ever re-run.

8. **Smoke-test pass/fail rate is an unreliable predictor of full-run rank, in both directions.**
   Across the 2026-07-11/12 batch: LightOnOCR-1B and GLM-Edge-V-2B both had strong-looking smoke
   signal (1/2 pass) but landed at or below baseline at full scale; conversely Qwen2-VL-2B smoke-
   tested at 0/2 (emitting grounding tokens instead of transcription) but scored 22/33 — the best
   result in the project — on the full run's full-JSON harness, apparently because the full-JSON
   prompt doesn't trigger the grounding behavior the OCR-only transcription prompt does. Only
   moondream2's smoke result (explicit refusal) reliably predicted its full-run result (0/33 both
   approaches). Treat 2-image smoke tests as a "does it load and produce real output" gate, not a
   ranking signal — see the model-by-model detail in
   [2026-07-12-general-small-vlm-candidates-full-eval.md](2026-07-12-general-small-vlm-candidates-full-eval.md).

9. **Per-field ("all fields") scoring added 2026-07-12 — now the primary metric.** Whole-record
   exact-match scoring requires all 11 fields correct in the same case, which badly understates
   real accuracy for models that get most fields right but rarely all 11 simultaneously — see the
   Results table note above (InternVL3-1B: 3/33 whole-record, 77.4% all-fields; LightOnOCR-1B
   OCR-only: 6/33 whole-record, 79.6% all-fields). `vlm_benchmark`/`vlm_ocr_benchmark` now compute
   and print this natively (`FieldScore`/`ParsedNutritionFacts::field_matches` in `src/lib.rs`),
   prioritized ahead of the whole-record table in each binary's output. Parse failures (`ERROR`
   cases) count as 0/11 fields correct — a conservative lower bound, since some parse failures
   (e.g. GLM-Edge-V-2B, GLM-OCR) contain mostly-correct values with only one malformed field; see
   Issue #1's "conditioned on non-error cases" figures for how much this depresses their scores.
   **Two fields are the universal weak point across nearly every model that produces any real
   signal**: `dietary_fiber_g` and `added_sugars_g` are the lowest- or near-lowest-scoring field for
   almost all 10 models evaluated (both are Qwen2-VL-2B's and LFM2.5-VL-1.6B's single worst field
   despite their otherwise-excellent 94-95% all-fields scores). Root causes identified by manual
   inspection: (a) labels showing "<1g" for a field get rounded down to 0 instead of up to 1 by
   several models; (b) models frequently miss the "Includes Xg Added Sugars" sub-line nested under
   Total Sugars, returning 0 instead of the sub-line's value. Improving parsing/prompting around
   these two fields specifically looks like a higher-leverage target than Issue #1's JSON-coercion
   work, since it's a near-universal gap rather than model-specific.
   **`serving_size_grams` is also a distinct weak field** (InternVL3-1B: 20/33, GLM-Edge-V-2B:
   10/33 — likely "which of the two numbers on the label is the gram count" confusion, e.g. "1½ cup
   (40g)"), **but is explicitly deprioritized for now**: the food-diary app doesn't consume this
   field yet, so fixing it isn't worth the effort until it is. Revisit if/when the app starts using
   it.

10. **`NUTRITION_PROMPT` `<1g`/added-sugars fix (2026-07-12): helps the leader, hurts a weaker
    model — kept anyway.** Added two explicit rules to `NUTRITION_PROMPT` (`src/vlm/mod.rs`,
    commit `9addc0a`) targeting Issue #9's two universal weak fields: "if the label shows `<1g`,
    report 1, not 0" and "look for a sub-line reading `Includes Xg Added Sugars` nested under Total
    Sugars; report that value, don't default to 0." Re-ran the three models where full-JSON was
    already a working approach (the only ones this fix could plausibly affect, since it doesn't
    touch `OCR_TRANSCRIBE_PROMPT`):
    - **Qwen2-VL-2B: genuinely improved** — `dietary_fiber_g` 29→32/33, `added_sugars_g` 27→30/33,
      all-fields 346→350/363 (95.3%→96.4%, new project best), whole-record 22→23/33. Small
      collateral cost (calories −2, protein −1 across a couple of cases) but a clear net win.
    - **LFM2.5-VL-1.6B: a wash** — all-fields and whole-record totals unchanged (343/363, 21/33);
      `added_sugars_g` +1 but `protein_g` −1, netting zero.
    - **Gemma-4-E2B: got worse** — all-fields 323→316/363 (89.0%→87.1%), and `added_sugars_g` (the
      exact targeted field) dropped 24→20/33, plus one new parse failure appeared. Longer/more
      complex prompts are a known small-model brittleness pattern — extra rules to juggle can cost
      more than they give back once a model is already near its instruction-following ceiling.
    **Decision: keep the change.** It strengthens the current best model (Qwen2-VL-2B) further, is
    neutral for the current #2 (LFM2.5-VL-1.6B), and while it costs the #3 model (Gemma-4-E2B)
    noticeably, that doesn't change its rank — it was 3rd before and after. Since the practical goal
    is finding the single best model to ship, optimizing the prompt for the strongest candidate is
    the right tradeoff, but this regression should NOT be silently absorbed if Gemma 4 E2B is ever
    reconsidered as a deployment candidate — re-test with the current prompt before relying on its
    9addc0a-era numbers for a shipping decision. A prompt fix that only helps the strongest model
    isn't automatically the right call in general (e.g. if the eval's purpose shifts toward finding
    a broadly robust prompt rather than optimizing for one model), so revisit this call if that
    context changes.

11. **Gemma 4 cross-size comparison (2026-07-13): E2B→E4B scales as expected, 12B collapses — real
    capability finding, not a config bug (mmproj-quantization hypothesis ruled out).** Ran all three
    Gemma 4 sizes available for this project
    (E2B ~2B, E4B ~4B, 12B — a separate "full" dense model, not part of the elastic E2B/E4B line)
    through the same harness, motivated by interest in possibly distilling from a larger Gemma 4
    model down to something deployable. **E4B is excellent**: 341/363 (93.9%) full-JSON, 319/363
    (87.9%) OCR-only — a clean improvement over E2B (89.0%/73.0%) and now effectively tied for 3rd
    place overall, just behind LFM2.5-VL-1.6B. **12B collapses to 30/363 (8.3%) full-JSON, 10/363
    (2.8%) OCR-only** — worse than nearly every model in this project, including several outright
    failures. This breaks the scaling trend entirely rather than continuing it, which is unusual
    enough to warrant real suspicion of a technical artifact rather than a genuine capability
    regression at 12B:
    - Inspected raw output: all 33 full-JSON cases parsed as *valid* JSON (0 `ERROR`s, all `FAIL`),
      but the overwhelming majority returned **every field as `null`** rather than garbled or
      wrong-but-present values — a handful of cases did extract partially-correct real values (e.g.
      one case matched `serving_size_grams`, `total_carbohydrates_g`, and `dietary_fiber_g` exactly),
      showing the model *can* read the image sometimes, just usually declines to.
    - Ruled out context-window overflow: `n_ctx = 4096` is the same fixed value used for every
      model in this harness, and Gemma 4 12B's vision encoder produces the *identical* number of
      image tokens as E2B/E4B for the same images (`image_tokens->nx = 266`/`210`, confirmed by
      diffing the logs) — so this isn't 12B needing more context than the harness provides.
    - **mmproj quantization mismatch — tested 2026-07-13, ruled out.** E2B/E4B use an `f16` mmproj
      (`mmproj-F16.gguf`, matching upstream's `mmproj-google_gemma-4-{E2B,E4B}-it-f16.gguf`); the
      12B repo (`ggml-org/gemma-4-12B-it-GGUF`) doesn't offer an f16 mmproj, only `Q8_0` and `bf16`,
      and the original run used `Q8_0`. Re-ran the first 5 images with the `bf16` mmproj (full
      precision, no quantization loss at all) as a direct A/B test: **identical result** —
      1/55 (1.8%) all-fields, field-for-field the same as `Q8_0` on the same 5 images
      (`cholesterol_mg` 1/5, every other field 0/5). Since zero-quantization-loss bf16 reproduces
      `Q8_0`'s failure exactly, mmproj quantization is not the cause. Did not proceed to a full
      33-image bf16 run given this decisive a signal from the 5-image A/B.
    - **GGUF converter — tested 2026-07-13, ruled out.** The original 12B run used `ggml-org`'s
      conversion; `bartowski` (the same converter behind `gemma-4-e2b`/`gemma-4-e4b`, both of which
      scored well) offers its own conversion of the identical `google/gemma-4-12B-it` checkpoint,
      including — unlike ggml-org's repo — an `f16` mmproj matching E2B/E4B's mmproj precision
      exactly. Ran the same 5-image diagnostic against `bartowski/gemma-4-12B-it-GGUF`
      (`gemma-4-12b-bartowski` in `models.toml`): **0/55 (0.0%) all-fields**, the identical failure
      signature (valid JSON, 0 parse errors, nearly every field null) — slightly worse than
      ggml-org's 1/55 (1.8%) on the same images, though at this sample size that gap isn't
      meaningful. This is the third independent configuration (ggml-org+Q8_0 mmproj, ggml-org+bf16
      mmproj, bartowski+f16 mmproj) to reproduce the same collapse, ruling out both the converter
      and mmproj precision as explanations.
    **Conclusion: this is a genuine property of the 12B checkpoint itself for this task, not a
    harness misconfiguration, mmproj-quantization artifact, or converter-specific bug.** The one
    remaining untested explanation is that the "full" 12B model's instruction-tuning is less suited
    to literal structured-extraction than the elastic E2B/E4B line's — plausible given how
    consistently it fails the same way regardless of conversion, but not directly confirmed.
    **Practical implication for a distillation plan**: if the goal is distilling from a larger Gemma
    4 model down to something deployable for this specific task, **E4B is the far more promising
    teacher candidate** — it's both smaller (faster to run for generating distillation data) and, as
    measured across three independent configurations, dramatically more capable at this task than
    12B regardless of which GGUF conversion is used. This isn't evidence against using a large model
    as a teacher in general — it's specific to this 12B checkpoint on this task — but there's no
    reason to reach for 12B here when E4B already outperforms it substantially while costing less
    compute to run.

12. **`NUTRITION_PROMPT` consolidated into one general principle (2026-07-13, commit `a6593e6`) —
    kept despite a regression on the (then-)leader, judged within noise for n=33.** Issue #9
    identified a third universal weak field beyond fiber/added-sugars: `cholesterol_mg` is
    consistently a small value sitting next to a much larger adjacent `sodium_mg` value (the two
    are always adjacent label lines), and models either drop cholesterol to 0 or — in one case,
    Qwen2-VL-2B — substitute the neighboring sodium value in its place (got `190` instead of `5`,
    exactly matching that image's true sodium reading). All affected images passed in the OCR-only
    harness for every model tested, confirming this is a full-JSON generation/attribution problem,
    not a vision/legibility one. Rather than adding a third specific rule to `NUTRITION_PROMPT`
    (risking the same prompt-bloat cost that hurt Gemma-4-E2B in Issue #10), the two existing rules
    were replaced with one consolidated principle covering all three patterns (fiber's `<1g`,
    sugars' nested sub-line, cholesterol's large-neighbor override) with concrete examples for each.
    Tested against all four models where full-JSON already works well:
    | Model | No fix | Two-rule fix | Consolidated |
    |---|---|---|---|
    | Qwen2-VL-2B | 346/363 (95.3%) | **350/363 (96.4%)** | 344/363 (94.8%) |
    | LFM2.5-VL-1.6B | 343/363 (94.5%) | 343/363 (94.5%) | **345/363 (95.0%)** |
    | Gemma-4-E2B | 323/363 (89.0%) | 316/363 (87.1%) | **327/363 (90.1%)** |
    | Gemma-4-E4B | n/a (not evaluated before the two-rule fix landed) | 341/363 (93.9%) | **343/363 (94.5%)** |
    Three of four models score best with the consolidated version — Gemma-4-E2B improves
    dramatically (+11 over two-rule, +4 over no-fix at all, its best result of any prompt variant)
    and LFM2.5-VL-1.6B and Gemma-4-E4B both improve modestly. **Only Qwen2-VL-2B — the two-rule
    fix's biggest winner — regresses**, and specifically on the two fields the consolidation was
    supposed to preserve (`dietary_fiber_g` 32→29/33, `added_sugars_g` 30→26/33), while the newly
    targeted `cholesterol_mg` didn't improve for it at all (32/33 both versions). Plausible
    explanation: cramming three distinct patterns into one dense sentence with three parenthetical
    examples may be harder for this model to apply per-instruction than three cleanly separated
    bullets, even though it's shorter overall — but this wasn't confirmed further.
    **Decision: kept the consolidated prompt.** The Qwen2-VL-2B regression (1.6 points) is judged to
    likely be within the noise margin for an n=33 test set rather than a robust, reproducible
    signal — the same reasoning that would apply to any of the smaller deltas here. Practical
    consequence: **Qwen2-VL-2B and LFM2.5-VL-1.6B are now effectively tied for best** (94.8% vs.
    95.0%, a 0.2-point gap that's even more clearly within noise), where the two-rule prompt had
    made Qwen2-VL-2B look like a clear, meaningful leader. If a future decision needs to pick a
    single model to actually deploy and the choice is close, don't treat either of these all-fields
    numbers as more precise than they are — consider re-running with more test cases, or accept that
    other factors (model size, license, inference speed) may be the deciding tiebreaker rather than
    this eval's accuracy numbers alone.

13. **First hosted-API model tested: Gemma-4-31B via OpenRouter — 100% all-fields after one prompt
    fix, the new project best by a wide margin.** Added `src/bin/vlm_benchmark_api.rs`, a blocking
    `VlmBackend` adapter over the existing `LlmApiBackend` (previously only used in `main.rs`'s
    serving path, never in an eval harness), so hosted API models can be benchmarked the same way
    as local GGUF candidates. First run against `google/gemma-4-31b-it:free` (30.7B dense
    multimodal, free tier, confirmed vision-capable and hosted per Known Issues #6's OpenRouter
    research) scored **359/363 (98.9%) all-fields, 30/33 whole-record** — dramatically ahead of
    every self-hosted sub-2B candidate (~90-95%).
    **All 3 misses shared one root cause, distinct from every other pattern found so far**:
    `IMG_5426` (fruit snacks) has a "Not a significant source of ... cholesterol, dietary fiber ..."
    disclaimer instead of a printed `0`; `IMG_5450` (sausage patties) and `IMG_5462` (turkey breast)
    show only "Sugars 0g" with **no separate Added Sugars line at all**. In every case the model
    returned `null` — which was actually the *literally correct* reading of the prompt at the time
    ("Use null ONLY if that nutrient field does not appear on the label at all," and in these cases
    the field genuinely doesn't appear as its own line). The ground truth infers `0` in these cases
    rather than treating them as truly absent.
    **Fix: changed `NUTRITION_PROMPT` to forbid `null` entirely** ("NEVER return null for any
    field... infer 0 rather than null") rather than adding another narrow rule. This is different
    in kind from every earlier prompt change in this project (Issues #9/#10/#12), which were
    judgment calls trading one field's accuracy for another's: **every one of the 33 rows in
    `test_cases.csv` has a real, non-null value for all 11 fields** (verified directly — zero empty
    cells in the CSV), so telling models to never emit `null` is provably correct for this dataset
    rather than a tradeoff. Re-ran Gemma-4-31B with the new prompt: **363/363 (100%) all-fields,
    33/33 whole-record — a perfect score**, closing all 3 remaining misses and exactly matching the
    frontier-reference ceiling established by Claude reading the images directly (see that section
    above). Also re-ran Qwen2-VL-2B and LFM2.5-VL-1.6B against the never-null prompt: both improved
    by the exact same net amount as Gemma-4-31B — **every model tested gained +4 fields net**:
    | Model | Consolidated (before) | Never-null (after) |
    |---|---|---|
    | Gemma-4-31B (OpenRouter) | 359/363 (98.9%) | **363/363 (100%)** |
    | LFM2.5-VL-1.6B | 345/363 (95.0%) | **349/363 (96.1%)** |
    | Qwen2-VL-2B | 344/363 (94.8%) | **348/363 (95.9%)** |
    Verified directly from each harness run's own printed per-field line (not just the aggregate
    delta) — Gemma-4-31B and Qwen2-VL-2B are genuinely clean, zero-regression results:
    Gemma-4-31B gained cholesterol_mg +1, dietary_fiber_g +1, added_sugars_g +2 (reaching a
    perfect 33/33 on every field); Qwen2-VL-2B gained serving_size_grams +1, sodium_mg +1,
    dietary_fiber_g +1, added_sugars_g +1, with every other field unchanged. **LFM2.5-VL-1.6B's +4
    net conceals a real regression**, though: serving_size_grams +2, total_fat_grams +1,
    total_sugars_g +1, added_sugars_g +1, but protein_g **-1** — a small loss more than offset by
    the gains elsewhere, but not the uniform zero-regression pattern the other two models show (an
    earlier version of this note incorrectly claimed zero regressions everywhere and misattributed
    one of LFM2.5-VL-1.6B's gains to cholesterol_mg, which was actually unchanged — corrected here
    after re-deriving all three per-field breakdowns directly from the harness's own output rather
    than from memory). This still stands in clear contrast to the consolidated-prompt experiment
    (Issue #12), which had real winners *and* losers *in the aggregate score itself* (Qwen2-VL-2B
    regressed net, not just on one field) — reinforcing that this fix is a different kind of change
    (correcting a provably-wrong instruction) rather than another judgment-call tradeoff, even
    though it isn't perfectly clean at the individual-field level for every model.
    **Not yet re-tested with never-null: Gemma-4-E2B and Gemma-4-E4B** — given the strong track
    record so far (net gains on all 3 models tested, 2 of 3 with zero regressions), both are likely
    to improve or at worst hold steady, but this hasn't been verified. **Decision: keep the
    never-null prompt as the permanent default** (already committed
    in `3d5e2c6`, and now also the operational default for the production service — see the
    "make OpenRouter Gemma-4-31B the default" change below).
    **Practical implication**: Gemma-4-31B via OpenRouter is now the strongest candidate measured in
    this project by a wide margin, but it's a fundamentally different deployment shape than every
    other candidate here — a ~31B hosted model called over the network, not a self-hosted sub-2B
    GGUF file. Whether that tradeoff (accuracy vs. self-hosting/cost/latency/offline-capability) is
    worth it depends on constraints outside this eval's scope (see the earlier cluster-sizing and
    in-browser-deployment discussions) — this result doesn't replace the small-VLM comparison, it
    adds a ceiling-adjacent reference point alongside it. As of 2026-07-13, this question has been
    answered for the actual production service: `main.rs`'s default backend is now VLM via
    OpenRouter Gemma-4-31B (see `src/vlm/openrouter.rs`'s `DEFAULT_MODEL`/`DEFAULT_BASE_URL`), and
    the PaddleOCR baseline and its supporting regex/spellcheck parser have since been removed
    entirely — see Known Issues #14.

14. **PaddleOCR/regex-parser removal (2026-07-13).** Now that Gemma-4-31B via OpenRouter is the
    project's default backend (Issue #13), the PaddleOCR baseline it replaced — along with
    everything that existed only to support it — was removed rather than kept as a fallback. This
    was a deliberate "remove everything, not just deprecate" choice: PaddleOCR never beat any VLM
    candidate tested in this project (9/33 whole-record vs. 14-33/33 for every VLM, self-hosted or
    hosted), and keeping dead code around as an unused opt-in path only adds maintenance burden.
    Removed: `src/parsing.rs` and `src/spellcheck.rs` (the regex/spellcheck parser that turned OCR
    text regions into `ParsedNutritionFacts`), `src/bin/vlm_ocr_benchmark.rs` (the OCR-only eval
    harness that fed VLM transcriptions through that same parser), the PaddleOCR init/inference code
    and `MyTextRegion`/`OCRResult`/`run_ocr_rgb`/`ort_config` in `main.rs`, the `backend=paddleocr`
    opt-out (the `/label` endpoint is VLM-only now), the `oar-ocr`/`image`/`regex`/`strsim` Cargo
    dependencies (all had become unused), the `paddleocr-models/` ONNX weights directory, and the
    Containerfile's model-download stage that baked those weights into the image. Also removed
    `LlavaBackend::transcribe`/`OCR_TRANSCRIBE_PROMPT` (`src/vlm/mod.rs`/`src/vlm/llava.rs`) — this
    VLM-as-OCR-engine mode existed solely to feed `vlm_ocr_benchmark.rs`, so it became dead code
    once that binary was removed. `vlm_benchmark`/`vlm_benchmark_api` (the full-JSON-extraction
    harnesses, which don't touch any of the removed code) are unaffected and remain the project's
    eval tooling. Verified with a clean `cargo build --release` (no warnings) and `cargo test
    --release` (all tests pass) after the removal.

## Adding a new model to this table

1. Add a `[models.<key>]` entry to [`models.toml`](../models.toml) with the HF repo and exact
   model/mmproj filenames (check the repo's file listing). Note the vision projector type if you
   can find it — check `llama-cpp-sys-2`'s vendored `clip-impl.h` `PROJECTOR_TYPE_NAMES` map for
   whether it's supported at all; if unsure, just try it and read the `unknown projector type:
   ...` error if it fails, or the `load_hparams: projector: <name>` line it logs on success.
2. `./scripts/run-eval.sh <key> --smoke` first — cheap (2 images), confirms the model loads and
   produces real output before committing to a full run. Update the model's `status` and `notes`
   in `models.toml` with what you saw (see the "Smoke-tested" entries above for the expected
   level of detail), and add a row to the smoke-test table above if it's a new model.
3. `./scripts/run-eval.sh <key>` for the full 33-image run once you're ready to commit the compute.
4. Note `git rev-parse HEAD` (short form is fine) and the current UTC time.
5. Write a dated report (`eval-results/YYYY-MM-DD-<model>-<approach>.md`) following the existing
   reports' structure: Result table, Diagnosis of failure modes, Takeaway, How to re-run.
6. Append a row to the Results table above (and remove it from the "Smoke-tested, not yet fully
   evaluated" table), and fold any newly-discovered failure pattern into Known Issues (or update
   an existing entry if it's the same root cause recurring).
