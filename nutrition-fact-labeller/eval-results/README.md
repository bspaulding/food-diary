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
  Both binaries accept `--limit N` to cap the number of images processed (useful for a quick smoke
  test — see below).
- PaddleOCR baseline — the default non-LLM backend (`run_ocr_rgb` + `parse_facts_from_regions` in
  `main.rs`), scored via the `check_test_cases` test. **Not independently re-verified in this
  environment** — that test needs local PaddleOCR ONNX model weight files
  (`paddleocr-models/*.onnx`) that aren't present in this sandbox. The 9/33 baseline figure is
  taken from the pre-existing `BASELINE_PASS`/`BASELINE_TOTAL` constants in `vlm_benchmark.rs`.

**Model manifest:** [`models.toml`](../models.toml) is the single source of truth for every model
this project is tracking — HF repo, filenames, confirmed llama.cpp projector-type support, and
notes/status per model. `scripts/fetch-model.sh <key>` downloads a model's files from the
manifest; `scripts/run-eval.sh <key> [--smoke [N]]` fetches (if needed) and runs both harnesses.
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
| — | — | PaddleOCR (baseline) | OCR + regex, unmodified | n/a | 9/33 | = | not independently re-verified here; see caveat above |

Commit = the code state the run was actually executed against (usually the commit that lands
right after the run, since reports are written and committed once results are in hand).

**All-fields reshuffles the ranking significantly vs. whole-record.** By all-fields (post prompt-fix
for the top model), the top 5 are **Qwen2-VL-2B full-JSON (96.4%, current best)**, LFM2.5-VL-1.6B
full-JSON (94.5%), Gemma-4-E2B full-JSON (89.0% pre-fix / 87.1% post-fix — see Known Issues #10),
then GLM-OCR OCR-only (86.0%) and LFM2.5-VL-1.6B OCR-only (86.5%). Several models whose whole-record
score looked close to a total
failure are actually getting the large majority of individual fields right: LightOnOCR-1B OCR-only
(79.6% all-fields vs. only 6/33 whole-record) and GLM-Edge-V-2B OCR-only (76.6% vs. 8/33) are the
starkest examples. See Known Issues for the per-field breakdown and the two weakest fields
(`dietary_fiber_g`, `added_sugars_g`) that drag down nearly every model regardless of size.

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
