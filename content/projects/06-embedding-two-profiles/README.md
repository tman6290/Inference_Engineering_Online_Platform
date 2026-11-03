# Embedding service for lookups and backfills

## The situation

Your team runs search over a document store. Two jobs hit the same embedding model. Users type queries and wait for results, so each query needs a fast, single embedding. Every night a job re-embeds tens of thousands of changed documents, and all that matters there is documents per second. The two jobs want different settings (see 6.2). Someone also proposes an 8-bit copy of the model to cut cost, and the search team wants proof that results will not change.

The decision: the configuration for each traffic profile, and whether to ship the 8-bit model.

## What you build

1. **A model and a dataset.** Pick an open embedding model of 1B parameters or fewer and note its output dimensions. Pick one public text dataset with at least 10,000 documents and a set of short queries.
2. **A lookup path.** Embed one query per request at a fixed request rate. After warm-up, measure at least 200 requests and report P50 and P95 latency. Pick the thread count, sequence length cap and batching for low latency, and say why.
3. **A backfill path.** Embed all 10,000 or more documents at three or more batch sizes, for example 16, 64 and 256. Report documents per second and peak memory for each. Find where throughput stops climbing. Plot it as `charts/backfill-throughput.png`.
4. **A quality check for the 8-bit copy.** On a CPU, ONNX Runtime dynamic INT8 quantization works; with a GPU, FP8 works too. Embed at least 1,000 inputs with both models and report the mean, minimum and P5 of cosine similarity between paired vectors (see 6.2.2). Then run at least 100 queries against the document set with each model and report the average overlap of their top 10 neighbours. Look at the worst-scoring inputs and say what they share.
5. **A dry run.** `make check` runs both paths and the quality check with `--dry-run`, using a tiny stand-in model so no weights download. A hashing embedder in pure Python, or a small randomly initialised matrix, is fine. It writes only under `$OUT_DIR`, falls back to a temp directory when unset, and prints `dry-run ok`.

## The sandbox

The grader runs `make check` in a `python:3.12-slim` container with `make` and `git`, 2 CPUs, 4 GB of memory, no GPU and no network, with your repo mounted read-only. It installs `requirements.txt` from wheels before cutting the network. Your dry run must not try to download a model, and must finish in under 8 minutes.

## Deliverables

- `README.md` with `## Decision`, `## Two profiles`, `## Quality check`, `## Results` and `## Limitations`, decision first.
- `results.json`, `Makefile`, `charts/backfill-throughput.png`, and the code for both paths and the quality check.

Name the hardware, thread count and runtime version. Under Limitations, say what you expect to change on a GPU deployment, including how quantization behaves there (see 5.1).

## results.json

- `model` (`name`, `params_m`, `dimensions`), `runtime`, `hardware`, `dataset`.
- `lookup`: `requests` (200 or more), `rate_rps`, `latency_ms` (`p50`, `p95`).
- `backfill`: `documents` (10,000 or more) and `batches`, three or more entries of `batch_size`, `docs_per_s`, `peak_memory_mb`.
- `quantization`: `format`, `inputs` (1,000 or more), `cosine` (`mean`, `min`, `p5`), `queries` (100 or more), `top10_overlap` between 0 and 1.
- `decision`: `lookup_config`, `backfill_config`, `ship_quantized`.

## How it is graded

Checks run first: files, README sections, the schema, and the dry run. The critique scores profile separation, measurement, the quality check and the decision. It checks README numbers against `results.json` and lists unsupported claims.

No GPU is needed. A recent laptop finishes the full run in an evening.
