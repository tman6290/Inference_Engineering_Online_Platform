# Roofline calculator for LLM serving

## The situation

You have to serve a specific open model at a specific context length, and you have a shortlist of GPUs to rent. Before you spend money on benchmarks, you want answers on paper. Do the weights and the KV cache fit? Is decode limited by memory bandwidth at the batch sizes you expect, and at what batch size does that change? What is the best inter-token latency each GPU could ever give you?

You will build a small calculator that answers those questions from a model's `config.json` and a GPU spec sheet, then use it to make one call: which GPU, and what batch-size ceiling, for one named model and context length.

## What you build

1. **`gpus.json`** with at least three GPUs. For each: dense FP16/BF16 TFLOPS, memory bandwidth, memory size, the ops:byte ratio you derive from them (see 2.4.1), and a source for every figure.
2. **The calculator**, a Python package with a command line, for example `python -m roofline --config configs/qwen3-8b.json --gpu H100 --context 8192 --batch 1,8,32,128`. From the config it derives:
   - total and active parameter counts, and weight bytes at the data type you choose;
   - KV-cache bytes per token from the layer count, KV head count and head size (see 2.5);
   - FLOPs and bytes moved per decode step at each batch size, and the resulting arithmetic intensity;
   - whether each case is memory bound or compute bound, and the batch size where it crosses;
   - a floor on inter-token latency from whichever ceiling binds;
   - whether weights plus KV cache for that batch and context fit in GPU memory.
3. **Coverage.** Run it for at least three models: one with grouped-query attention and one mixture of experts (see 2.2.4), each at two or more context lengths and at batch 1, 8, 32 and 128. Commit the config files under `configs/` so nothing downloads at check time.
4. **A roofline chart**, `charts/roofline.png`, for one GPU: the bandwidth slope, the compute ceiling, and your prefill and decode points for one model.
5. **A reality check.** Put your predicted inter-token floor next to one measured number for the same model and GPU. The number can come from your own rented run, a local run, or a published benchmark. Name the source and explain the gap with specific causes.
6. **Tests.** Write out one prediction by hand in the README, then assert it in a unit test. Add tests for parameter count against the published size of each model. `make check` runs the tests and a short end-to-end calculation, using the Python standard library only, and prints `roofline ok`.

## Deliverables

- `README.md` with `## Decision`, `## How the calculator works`, `## Worked example`, `## Results` and `## Reality check`. Open with the decision.
- `results.json`, `gpus.json`, `Makefile`, `charts/roofline.png`, the package and its tests.

List your assumptions in the README: data type, how you count FLOPs, and what you leave out, such as activations, attention kernels and framework overhead. Say which way each one pushes the prediction.

## results.json

- `gpus`: three or more, with `name`, `dense_tflops`, `bandwidth_tbps`, `memory_gb`, `ops_per_byte`, `source`.
- `models`: three or more, with `name`, `total_params_b`, `active_params_b`, `attention` (`mha`, `gqa`, `mqa` or `mla`), `moe`, `bytes_per_param`, `kv_bytes_per_token`.
- `predictions`: 24 or more rows, each with `model`, `gpu`, `context_tokens`, `batch_size`, `decode_intensity`, `bound`, `weights_gb`, `kv_cache_gb`, `fits`, `itl_floor_ms`.
- `reality_check`: `model`, `gpu`, `batch_size`, `predicted_itl_ms`, `measured_itl_ms`, `source`.

## How it is graded

Checks run first: files, README sections, the `results.json` schema, and `make check` in a sandbox with no network and a read-only repo. The critique then scores correctness, assumptions, the reality check, and the decision and write-up, using the book's treatment of bottlenecks (see 2.4) as its reference. It checks README numbers against `results.json`; a number that appears only in the README counts against you.

No GPU is needed for this project.
