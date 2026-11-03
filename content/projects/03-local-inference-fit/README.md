# Local inference fit test

## The situation

A product manager asks whether a feature can run on the user's own computer: offline note summaries, private autocomplete, a writing assistant that never sends text to a server. Running locally removes network latency and server cost, and keeps data on the device. It also leaves you with whatever memory, bandwidth and cooling the user happens to own (see 3.5).

You will answer for one feature with measurements from your own machine and an estimate for a weaker one. The decision: which model size ships on-device, on which class of machine, and when the app falls back to a cloud endpoint.

## What you build

1. **A feature and a speed floor.** Name the feature and the slowest decode speed users would accept for it, in tokens per second. Say why.
2. **Predictions.** Look up your machine's memory bandwidth and cite the source. For each model file, divide bandwidth by the bytes read per generated token to get a decode ceiling (see 3.1.2). Write one of these out in full in the README.
3. **A benchmark script.** Drive llama.cpp or Ollama with a fixed prompt set. Pick three sizes from one model family at one quantization, such as 1B, 3B and 8B at Q4_K_M. For each size, after warm-up, run at least 30 requests and log one JSON line per request to `data/runs.jsonl` with prompt tokens, output tokens, TTFT, prefill speed and decode speed. Read peak memory from a tool (Activity Monitor, `nvidia-smi`, `/usr/bin/time -v`, Task Manager) and record it.
4. **A sustained run.** Run the middle size for at least 10 minutes without a break. Report decode speed at the start and at the end, and plot it over time if you can. On a laptop, note battery drain over the same period.
5. **A `make check` target.** It reads `results.json`, recomputes each ceiling from bandwidth and file size, fails if your reported ceiling is off by more than 5%, and fails if any measured decode speed exceeds its ceiling by more than 10%. On success it prints `fit ok`. Python standard library only, no network.

## Deliverables

- `README.md` with `## Verdict`, `## Machine`, `## Method`, `## Results` and `## Median user`, verdict first.
- `results.json`, `data/runs.jsonl`, `Makefile`, the benchmark and check scripts.

Under `## Median user`, describe a cheaper machine your users are likely to own: its memory size and bandwidth, and which of your three sizes would still clear the speed floor there. Show the arithmetic.

## results.json

- `machine`: `name`, `chip`, `memory_gb`, `bandwidth_gbps`, `bandwidth_source`.
- `runtime`: `name` (`llama.cpp` or `ollama`) and `version`.
- `quantization`, and `feature` with `name` and `min_decode_tps`.
- `models`: three or more, each with `name`, `params_b`, `file_gb`, `requests`, `predicted_decode_tps_ceiling`, `decode_tps_p50`, `prefill_tps_p50`, `ttft_ms` (`p50`, `p95`) and `peak_memory_gb`.
- `sustained`: `model`, `minutes`, `decode_tps_start`, `decode_tps_end`.
- `verdict`: `ships_local` (a model name, or null if none qualifies) and `fallback_rule`.

## How it is graded

Checks run first: files, README sections, the schema, and `make check` in a sandbox with no network and a read-only repo. The critique scores prediction, measurement, analysis and verdict. It compares measured speed with your ceilings and treats any speed above the ceiling as a measurement error to explain. Any README number missing from `results.json` gets listed as unsupported.

You need no cloud GPU. Close heavy programs while you measure and say what else was running.
