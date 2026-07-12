# VLM Label Parser Eval — General-Purpose Small VLM Candidates (full 33-image run)

**Date/time:** 2026-07-11 ~17:53 UTC through 2026-07-12 ~02:30 UTC
**Commit:** `2b83b0e` + two uncommitted fixes made during this run: `scripts/run-eval.sh`
(bash-3.2 `unbound variable` fix) and `src/parsing.rs` (index-underflow fix) — see Known Issues.
**Models:** [LiquidAI/LFM2-VL-450M-GGUF](https://huggingface.co/LiquidAI/LFM2-VL-450M-GGUF),
[LiquidAI/LFM2.5-VL-1.6B-GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF),
[ggml-org/InternVL3-1B-Instruct-GGUF](https://huggingface.co/ggml-org/InternVL3-1B-Instruct-GGUF),
[zai-org/glm-edge-v-2b-gguf](https://huggingface.co/zai-org/glm-edge-v-2b-gguf),
[bartowski/Qwen2-VL-2B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2-VL-2B-Instruct-GGUF),
[ggml-org/moondream2-20250414-GGUF](https://huggingface.co/ggml-org/moondream2-20250414-GGUF)
**Backend:** local llama.cpp (`LlavaBackend`), 3 CPU threads (concurrent runs sharing a 10-core
Apple M4), no GPU
**Harnesses:** `vlm_benchmark` (full JSON extraction) and `vlm_ocr_benchmark` (OCR-only + resilient
`parsing::parse_facts_from_lines`)
**Cases:** 33 (all of `test_cases.csv` / `images/`)

First full 33-image run for all six "general-purpose small VLM" candidates from `models.toml`,
following up on their 2026-07-11 2-image smoke tests.

## Result

| Model | Approach | Pass | Fail | Score | vs. baseline (9/33) |
|---|---|---|---|---|---|
| PaddleOCR (baseline) | OCR + regex | 9 | 24 | 9/33 | = |
| LFM2-VL-450M-Q8_0 | Full JSON extraction | 2 | 31 | 2/33 | ▼ −7 |
| LFM2-VL-450M-Q8_0 | OCR-only + resilient parser | 7 | 26 | 7/33 | ▼ −2 |
| LFM2.5-VL-1.6B-Q8_0 | Full JSON extraction | 21 | 12 | **21/33** | **▲ +12** |
| LFM2.5-VL-1.6B-Q8_0 | OCR-only + resilient parser | 15 | 18 | 15/33 | ▲ +6 |
| InternVL3-1B-Instruct-Q8_0 | Full JSON extraction | 3 | 30 | 3/33 | ▼ −6 |
| InternVL3-1B-Instruct-Q8_0 | OCR-only + resilient parser | 4 | 29 | 4/33 | ▼ −5 |
| GLM-Edge-V-2B-Q4_K_M | Full JSON extraction | 2 | 31 | 2/33 | ▼ −7 |
| GLM-Edge-V-2B-Q4_K_M | OCR-only + resilient parser | 8 | 25 | 8/33 | ▼ −1 |
| Qwen2-VL-2B-Instruct-Q4_K_M | Full JSON extraction | 22 | 11 | **22/33** | **▲ +13** |
| Qwen2-VL-2B-Instruct-Q4_K_M | OCR-only + resilient parser | 14 | 19 | 14/33 | ▲ +5 |
| moondream2 | Full JSON extraction | 0 | 33 | 0/33 | ▼ −9 |
| moondream2 | OCR-only + resilient parser | 0 | 33 | 0/33 | ▼ −9 |

**Qwen2-VL-2B-Instruct (22/33 full-JSON) is the new best result across this entire eval effort**,
narrowly beating LFM2.5-VL-1.6B (21/33 full-JSON, also a strong result). Both are dramatic
reversals of their smoke-test signal — see Diagnosis. The other four (LFM2-VL-450M, InternVL3-1B,
GLM-Edge-V-2B, moondream2) all land at or below baseline on both approaches, despite three of them
(InternVL3-1B, GLM-Edge-V-2B) having passed 1/2 smoke images outright.

## Diagnosis

**Qwen2-VL-2B and LFM2.5-VL-1.6B: full-JSON now beats OCR-only, inverting the pattern from every
prior model tested in this project.** MiniCPM-V 4.6, SmolVLM, and every dedicated-OCR candidate
(this session's companion report) either failed full-JSON outright (wrong types/shape) or did
meaningfully better OCR-only than full-JSON. These two 1.6B–2B general-purpose models are the first
where full-JSON extraction is the *stronger* approach — suggesting that at this size/training
tier, the models are capable enough to both read the label accurately **and** follow the requested
JSON schema/types simultaneously, closing the gap that `fill_gaps_from_blob` was built to paper
over for smaller/weaker models. This is a meaningfully different capability regime than anything
else evaluated in this project so far.

**Qwen2-VL-2B's smoke-test failure (0/2, grounding/bbox tokens on both images) did not predict its
full-run result at all.** `models.toml`'s smoke notes describe the model emitting
`<|box_start|>(182,10),(812,995)<|box_end|>` instead of transcribed text on both smoke images, read
as a prompt-wording issue that triggers the model's dedicated grounding capability. The full
33-image full-JSON run scored 22/33 — the single best score in this project. Two explanations are
plausible and not mutually exclusive: (1) the full-JSON harness's prompt differs from the OCR-only
harness's `OCR_TRANSCRIBE_PROMPT` that the smoke test used, and the JSON-extraction framing simply
doesn't trigger the grounding behavior the way "transcribe every line" does; (2) the two smoke
images happened to be an unlucky draw relative to the other 31. Given full-JSON scored 22/33 but
OCR-only (which uses the same prompt style the smoke test used) only scored 14/33, explanation (1)
looks like the larger factor — worth confirming with a targeted look at a few OCR-only failures for
grounding-token contamination, not done here (see Known Issues #3).

**LFM2.5-VL-1.6B's smoke signal (1/2 pass, solid bilingual transcription) undersold it slightly —
21/33 full-JSON is proportionally even stronger than the smoke rate suggested**, unlike most other
candidates in this batch where smoke signal overpredicted the full result.

**The other four are a mixed bag that mostly tracks their smoke signal, with one exception.**
GLM-Edge-V-2B (2/33 full-JSON, 8/33 OCR-only) and InternVL3-1B (3/33, 4/33) landed below baseline
despite each passing 1/2 smoke images — another instance of smoke tests overpredicting full-run
performance (see the cross-cutting pattern noted in `eval-results/README.md`). LFM2-VL-450M (2/33,
7/33) matches its "0/2 smoke but real, mostly-accurate transcription" characterization — a case
where the smoke test's *qualitative* read (real content, just missing a field or two) was more
informative than its raw pass/fail number. **moondream2 (0/33 both approaches) is the one clean
confirmation**: its smoke-test refusal behavior ("I am sorry, but I cannot generate a text that is
exactly like the image you provided...") was fully representative — it refused at full scale too,
with no partial credit anywhere.

**GLM-Edge-V-2B triggered a real parser bug.** Its transcription output apparently began with
"calories" as the very first token on at least one image, which hit an unguarded `content[i - 1]`
array access in `parse_facts` (`src/parsing.rs:115`) when `i == 0`, panicking the whole run. Fixed
mid-session (see Known Issues #2) and the run was restarted from scratch; the reported numbers
above are from the post-fix run.

## Takeaway

This batch produced the two best results in the project's history — **Qwen2-VL-2B (22/33
full-JSON)** and **LFM2.5-VL-1.6B (21/33 full-JSON)** — both meaningfully ahead of the previous
best (MiniCPM-V 4.6 OCR-only, 11/33) and both achieved via the full-JSON approach rather than
OCR-only, a first for this project. This suggests the earlier assumption baked into
`fill_gaps_from_blob` and this project's general design — that OCR-only + a resilient parser beats
asking small VLMs for structured JSON directly — holds for models below roughly 1B–1.6B parameters
but inverts somewhere in the 1.6B–2B range, at least for these two model families (Liquid AI's
LFM2 line and Qwen2-VL). Both are strong candidates for further work: grammar-constrained decoding
or prompt refinement on top of an already-22/33 baseline could plausibly close most of the
remaining gap to a perfect score, which hasn't been a realistic goal for any candidate evaluated
before this session.

The smoke-test-vs-full-run relationship was unreliable in both directions this batch: it
underpredicted Qwen2-VL-2B and slightly underpredicted LFM2.5-VL-1.6B, while overpredicting
InternVL3-1B and GLM-Edge-V-2B. Two-image smoke tests remain useful for catching hard failures
(crashes, unsupported projectors, outright refusal as with moondream2) but shouldn't be trusted as
a ranking signal for how promising a candidate is at full scale.

## Known issues surfaced or touched during this run

1. **`scripts/run-eval.sh` bash-3.2 bug (fixed this session).** macOS ships bash 3.2 as
   `/bin/bash`. Under `set -u`, expanding `"${LIMIT_ARGS[@]}"` when empty throws `unbound variable`
   in bash <4.4 (silent in 4.4+). Every prior smoke test worked because `--smoke` always populates
   `LIMIT_ARGS`; only a full (non-smoke) run hit this — meaning **no full run had ever succeeded on
   this script before this session**, for any model. Fixed with
   `"${LIMIT_ARGS[@]+"${LIMIT_ARGS[@]}"}"` in both harness invocations.
2. **`src/parsing.rs:115` index-underflow panic (fixed this session).** `parse_facts`'s "N,
   Calories" inverse-pair branch read `content[i - 1]` without checking `i > 0`, panicking whenever
   a transcription's first token was "calories" (`0usize - 1` wraps to `usize::MAX`, then the
   array-bounds check panics). Crashed GLM-Edge-V-2B's run specifically; fixed with
   `else if i > 0` and the run restarted clean. Worth double-checking whether other models in this
   batch produce "calories"-first transcriptions that would have hit this pre-fix — none did,
   based on their successful completion, but that's inferred from absence of a crash rather than
   directly verified.
3. **Background eval processes were killed externally partway through this session, once, for
   unclear reasons** (not OOM — plenty of free memory at the time; not sleep — no wake/sleep event
   in `pmset -g log`; not a script bug — `ps` simply showed no matching processes). Affected
   paddleocr-vl (OCR-only harness), qwen2vl-2b (full-JSON), and moondream2 (both harnesses) all at
   once; all three were relaunched from scratch and completed normally on retry. Root cause
   undetermined — flag if it recurs.
4. **No per-image raw-output logging was captured.** Only pass/fail summaries and per-image ✓
   filenames were logged, not raw model text — a `RUST_LOG=debug` rerun would be needed to
   substantiate the grounding-token-contamination hypothesis for Qwen2-VL-2B's OCR-only gap, or to
   otherwise categorize failure modes at a finer grain than this report's smoke-test-derived
   qualitative notes provide.

## How to re-run

```bash
# From nutrition-fact-labeller/, with weights fetched per scripts/fetch-model.sh:
./scripts/run-eval.sh lfm2-vl-450m
./scripts/run-eval.sh lfm25-vl-1_6b
./scripts/run-eval.sh internvl3-1b
./scripts/run-eval.sh glm-edge-v-2b
./scripts/run-eval.sh qwen2vl-2b
./scripts/run-eval.sh moondream2
# THREADS env var controls CPU threads per run (default 4); these were run at THREADS=3
# with up to 3 models concurrent on a 10-core Apple M4.
```
