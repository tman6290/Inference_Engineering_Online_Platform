# Engine load test: vLLM against SGLang

## The situation

Your team will self-host an open model of 8B parameters or fewer for one product feature. Two engines are on the table, vLLM and SGLang (see 4.3). Both publish impressive numbers on their own workloads. You need numbers on yours: your prompts, your output lengths, your latency target. You also need to know how much concurrency one GPU can take before P95 latency breaks the target, because that figure sets your replica count and your bill.

The decision: which engine to run, and the concurrency cap per replica that keeps you inside the SLO.

## What you build

1. **An SLO.** Name the feature and set P95 targets for TTFT and inter-token latency.
2. **A workload.** Draw prompts from an open dataset that fits the feature (see 4.5.1). Fix the maximum output length and keep temperature at the value production will use. Record mean input length.
3. **A harness.** Write a load generator that streams from any OpenAI-compatible endpoint and records, per request, TTFT, every inter-token gap, output tokens and errors. Use jittered or Poisson arrivals at each concurrency level rather than a lockstep loop.
4. **Two sweeps.** Rent one GPU by the hour. Launch the model with vLLM, warm it up, and sweep at least five concurrency levels, such as 1, 4, 16, 32 and 64, with at least 100 measured requests per level. Then do the same with SGLang on the same GPU, model, data type and maximum context. Commit both launch commands and engine versions. Change nothing else between the sweeps (see 4.5.2).
5. **Two charts.** `charts/latency-vs-concurrency.png` with P50 and P95 TTFT and inter-token latency per engine, and `charts/throughput-vs-latency.png` with total output tokens per second against P95 inter-token latency.
6. **A dry run.** `make check` must run your harness with `--dry-run` against a fake streaming server that your code starts on `127.0.0.1`. The fake server emits tokens with simulated delays that grow with concurrency, so the whole pipeline runs: requests, parsing, percentiles, `results.json` and charts. It writes only under `$OUT_DIR` (fall back to a temp directory when unset) and prints `dry-run ok`.

## The sandbox

The grader runs `make check` in a `python:3.12` container with `make` and `git`, 2 CPUs, 4 GB of memory, no GPU and no network. Your repo is mounted read-only. The grader installs `requirements.txt` from wheels before cutting the network, so keep heavy GPU packages out of it, or the install will take minutes. The run must finish in under 8 minutes.

## Deliverables

- `README.md` with `## Decision`, `## Setup`, `## Method`, `## Results` and `## Limitations`, decision first.
- `results.json`, `Makefile`, both charts, the harness and the fake server.

In the results section, read the knee of each latency curve and connect it to how each engine schedules and batches requests. Count errors and timeouts at every level and explain any you saw.

## results.json

- `model` (`name`, `params_b` up to 8), `gpu`, `slo` (`ttft_ms_p95`, `itl_ms_p95`).
- `workload`: `dataset`, `input_tokens_mean`, `output_tokens_max`, `temperature`, `arrival` (`poisson`, `jittered` or `closed_loop`).
- `engines`: one entry for `vllm` and one for `sglang`, each with `version`, `launch_cmd`, `max_concurrency_within_slo` (null if no level met it) and five or more `levels`. Each level has `concurrency`, `requests`, `errors`, `ttft_ms` and `itl_ms` (each with `p50` and `p95`) and `output_tps_total`.

## How it is graded

Checks run first: files, README sections, the schema, and the dry run. The critique scores fair comparison, realistic load, analysis, reproducibility and the decision. It reads your numbers from `results.json` only. A README claim about an engine that your data does not show gets listed as unsupported.
