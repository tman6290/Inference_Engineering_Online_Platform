# Speculation benchmark: draft-target against n-gram

## The situation

Your team serves an open model and wants faster per-user token speed without buying more GPUs. Someone suggests speculative decoding. Two methods need no training: draft-target with a small model from the same family (see 5.2.1), and n-gram speculation that drafts from text already in the context (see 5.2.4). Both trade spare compute for fewer forward passes, so both should help at small batch sizes and fade as batches grow. Temperature lowers acceptance rate and eats into the gain too (see 5.2).

Nobody on the team knows where those lines fall for your workload. You will find out, and write the decision a team lead can act on: which method to turn on, up to which batch size, and what to do at temperature 0.8.

## What you build

1. **The setup.** Choose one open target model of 8B parameters or fewer and one engine, vLLM or SGLang. Choose a draft model from the same family; report the size ratio between the two. Choose a prompt set that fits a use case you name, and fix the output length.
2. **Three configurations** on the same engine and GPU: baseline with no speculation, draft-target, and n-gram. Record the number of draft tokens per step for each speculative method.
3. **The grid.** Run every configuration at batch 1, 8, 32 and 128 and at temperature 0 and 0.8. That makes 24 runs. Warm up before each run and leave warm-up requests out of the numbers. Measure at least 50 requests per run.
4. **The numbers.** For each run: P50 and P95 TTFT, P50 and P95 inter-token latency, per-user tokens per second at P50, total output tokens per second, and the acceptance rate for the speculative methods.
5. **Three charts.**
   - `charts/speedup-vs-batch.png`: each method's per-user speedup over baseline at each batch size, one line per method and temperature.
   - `charts/itl-p50-p95.png`: P50 and P95 inter-token latency for every run.
   - `charts/acceptance-rate.png`: acceptance rate per method at each temperature.
6. **A `bench` package with a dry run.** `make check` must run the whole pipeline with `--dry-run`: all three configurations, the full grid, percentiles, `results.json` and the three charts. In dry-run mode, a tiny stand-in model replaces the GPU. A pure-Python toy model and a simulated clock are fine. The dry run writes only under `$OUT_DIR`, falls back to a temp directory when that is unset, and prints `dry-run ok`.

## The sandbox

The grader runs `make check` in a `python:3.12` container with `make` and `git`, 2 CPUs, 4 GB of memory, no GPU and no network, with your repo mounted read-only. It installs `requirements.txt` from wheels before cutting the network, so keep vLLM, SGLang and torch out of that file and list them in a separate file for the GPU run. The dry run must finish in under 8 minutes.

## Deliverables

- `README.md` with `## Decision`, `## Setup`, `## Method`, `## Results` and `## Limitations`. The README opens with the decision, in two or three sentences, with the numbers that back it.
- `results.json`, `Makefile`, the three charts, the `bench` package, and the launch commands with engine and model versions.

In the results section, explain the batch-size crossover in terms of spare compute, the temperature effect in terms of acceptance rate, and why n-gram did well or badly on your prompts. Discuss TTFT separately: speculation targets decode, and the draft model's own prefill can cost you at the start.

## results.json

- `model`: `target`, `target_params_b` (up to 8), `draft`, `draft_params_b`.
- `engine`: `name` (`vllm` or `sglang`) and `version`. `gpu`.
- `workload`: `dataset`, `prompts`, `input_tokens_mean`, `output_tokens`.
- `speculation`: `draft_target_tokens`, `ngram_tokens`.
- `warmup`: `requests` per run.
- `runs`: all 24 combinations of `method` (`baseline`, `draft_target`, `ngram`), `batch_size` (1, 8, 32, 128) and `temperature` (0, 0.8). Each run has `requests`, `ttft_ms` and `itl_ms` (each with `p50` and `p95`), `tps_per_user_p50`, `output_tps_total`, and `acceptance_rate` (null for baseline).

The schema rejects a file that misses any of the 24 combinations.

## How it is graded

Checks run first: files, README sections, the schema, and the dry run. The critique then scores experimental design, measurement, analysis, the decision and reproducibility, using the book's chapter on speculative decoding as its reference. It checks every speedup and latency in your README against `results.json`. A claim that the data does not support gets listed under "What is wrong".
