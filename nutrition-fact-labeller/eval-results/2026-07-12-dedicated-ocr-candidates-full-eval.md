# VLM Label Parser Eval — Dedicated-OCR Candidates (full 33-image run)

**Date/time:** 2026-07-11 ~19:11–19:35 UTC (started), completing 2026-07-12 ~00:30 UTC
**Commit:** `2b83b0e` + two uncommitted fixes made during this run (see Known Issues below):
`scripts/run-eval.sh` (bash-3.2 `unbound variable` fix) and `src/parsing.rs` (index-underflow fix)
**Models:** [ggml-org/LightOnOCR-1B-1025-GGUF](https://huggingface.co/ggml-org/LightOnOCR-1B-1025-GGUF),
[ggml-org/GLM-OCR-GGUF](https://huggingface.co/ggml-org/GLM-OCR-GGUF),
[PaddlePaddle/PaddleOCR-VL-1.6-GGUF](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF)
**Backend:** local llama.cpp (`LlavaBackend`), 3 CPU threads (concurrent runs sharing a 10-core
Apple M4), no GPU
**Harnesses:** `vlm_benchmark` (full JSON extraction) and `vlm_ocr_benchmark` (OCR-only + resilient
`parsing::parse_facts_from_lines`)
**Cases:** 33 (all of `test_cases.csv` / `images/`)

This is the first full 33-image run for all three "dedicated small OCR/document model" candidates
from `models.toml`, following up on their 2026-07-11 2-image smoke tests (see
[eval-results/README.md](README.md) "Smoke-tested" history and each model's `notes` in
`models.toml`).

## Result

| Model | Approach | Pass | Fail | Score | vs. baseline (9/33) |
|---|---|---|---|---|---|
| PaddleOCR (baseline) | OCR + regex | 9 | 24 | 9/33 | = |
| LightOnOCR-1B-1025-Q8_0 | Full JSON extraction | 0 | 33 | 0/33 | ▼ −9 |
| LightOnOCR-1B-1025-Q8_0 | OCR-only + resilient parser | 6 | 27 | 6/33 | ▼ −3 |
| GLM-OCR-Q8_0 | Full JSON extraction | 1 | 32 | 1/33 | ▼ −8 |
| GLM-OCR-Q8_0 | OCR-only + resilient parser | 19 | 14 | **19/33** | **▲ +10** |
| PaddleOCR-VL-0.9B | Full JSON extraction | 0 | 33 | 0/33 | ▼ −9 |
| PaddleOCR-VL-0.9B | OCR-only + resilient parser | 3 | 30 | 3/33 | ▼ −6 |

None of the three "dedicated OCR" candidates are viable at full-JSON extraction — that approach
still tops out with MiniCPM-V 4.6's known type-strictness problem and these smaller models don't
even clear GLM-OCR's single pass. On OCR-only, results split sharply: GLM-OCR (19/33) is now the
**second-best result in this whole eval effort**, comfortably beating the previous OCR-only leader
(MiniCPM-V 4.6 at 11/33). LightOnOCR-1B and PaddleOCR-VL both come in below baseline despite
PaddleOCR-VL's OCR specialization.

## Diagnosis

**GLM-OCR is the standout: 19/33 OCR-only, only one point off `fill_gaps_from_blob`'s prior best.**
This tracks with its 2026-07-11 smoke-test signal (1/2 pass outright, other miss off by exactly one
field) and its reputation as the top sub-2B document-OCR model on OmniDocBench. Worth a follow-up
pass to categorize its 14 remaining failures (likely mostly single-field misses, per the smoke
signal) — not done here since these runs didn't enable `RUST_LOG=debug` verbose per-image output
(see Known Issues #3 below); a targeted rerun with debug logging would be cheap given how fast
GLM-OCR runs relative to the larger candidates.

**LightOnOCR-1B: strong smoke signal did not generalize.** The smoke test flagged this as *the*
top-priority full-run candidate — 1/2 pass with "clean bilingual markdown-table transcription."
The full run came in at 6/33 OCR-only, well below GLM-OCR and below baseline. This is the most
notable smoke-vs-full discrepancy across this whole eval batch (see the cross-cutting note in
`eval-results/README.md` Known Issues): a 2-image smoke test has enough variance that "passed 1/2"
is only weak evidence of full-scale performance, especially for a model whose good smoke result
came from bilingual markdown-table output — a structurally different shape than
`parse_facts_from_lines` (built for roughly-one-label-per-line text) was designed around, which may
not transfer evenly across the full 33-image set's variety of physical label layouts.

**PaddleOCR-VL: the "Only text." degenerate loop from the smoke test was the dominant full-run
failure mode too.** 0/33 full-JSON (unsurprising — no candidate here does full-JSON well) and 3/33
OCR-only, i.e. essentially the same "Only text." repetition problem flagged in `models.toml`'s
smoke-test notes persisted at scale rather than being a 2-image fluke. The suspected root cause
(missing `--jinja` / explicit chat-template-file handling that the model's upstream docs call out
as required, vs. `LlavaBackend`'s embedded-template-only approach) was not investigated or fixed in
this session — still worth doing before writing this model off, since a templating bug would
explain a flat "Only text." collapse better than a genuine capability gap would for a model that's
a direct descendant of the PaddleOCR baseline architecture.

## Takeaway

Of the three, only **GLM-OCR** is worth carrying forward — 19/33 OCR-only is a strong result that
substantially raises this project's usable ceiling. LightOnOCR-1B and PaddleOCR-VL both
underperformed their smoke signal at full scale; PaddleOCR-VL in particular deserves a templating
fix attempt before being ruled out, since its failure mode (degenerate single-phrase repetition)
looks more like a harness/prompt mismatch than a hard capability ceiling.

## Known issues surfaced or touched during this run

1. **`scripts/run-eval.sh` bash-3.2 bug (fixed this session).** macOS ships bash 3.2 as `/bin/bash`
   (Apple never updated past the last pre-GPLv3 release). Under `set -u`, expanding
   `"${LIMIT_ARGS[@]}"` when that array is empty throws `unbound variable` in bash <4.4 — silent in
   4.4+. Every prior smoke test worked because `--smoke` always populates `LIMIT_ARGS`; only a full
   (non-smoke) run hit this, so **no full run had ever succeeded on this script before this
   session**. Fixed with the portable `"${LIMIT_ARGS[@]+"${LIMIT_ARGS[@]}"}"` idiom in both harness
   invocations.
2. **`src/parsing.rs:115` index-underflow panic (fixed this session).** The "N, Calories" inverse-
   pair branch of `parse_facts` read `content[i - 1]` without checking `i > 0`, panicking
   ("index out of bounds ... index is 18446744073709551615", i.e. `0usize - 1` wrapped) whenever a
   transcription's very first token was "calories". Triggered during GLM-Edge-V-2B's run (see the
   companion general-small-VLM report) but could in principle affect any model whose OCR output
   happens to start with "Calories". Fixed by guarding with `else if i > 0`. None of the three
   models in *this* report hit it, so their results are unaffected either way.
3. **No per-image raw-output logging was captured in these runs.** Unlike the smoke tests (which
   were apparently run in a way that surfaced individual model outputs for qualitative notes in
   `models.toml`), these full runs only logged pass/fail summaries and per-image ✓ filenames, not
   raw model text. A rerun with `RUST_LOG=debug` (the harness already calls
   `log::debug!("{:#?}", results)` in `parsing.rs`) would be needed to categorize *why* specific
   images fail for GLM-OCR or any other candidate at a finer grain than this report provides.

## How to re-run

```bash
# From nutrition-fact-labeller/, with weights fetched per scripts/fetch-model.sh:
./scripts/run-eval.sh lightonocr-1b
./scripts/run-eval.sh glm-ocr
./scripts/run-eval.sh paddleocr-vl
# THREADS env var controls CPU threads per run (default 4); these were run at THREADS=3
# with up to 3 models concurrent on a 10-core Apple M4.
```
