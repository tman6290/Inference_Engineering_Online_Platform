"""Combine runs/<method>.json from the three GPU sessions into results.json."""

import json

from bench import grid, gpu_run

runs = []
for method in grid.METHODS:
    with open(f"runs/{method}.json", encoding="utf-8") as handle:
        runs.extend(json.load(handle))

missing = grid.missing_runs(runs)
if missing:
    raise SystemExit(f"missing runs: {missing}")

results = {
    "model": {
        "target": gpu_run.MODEL,
        "target_params_b": 7.6,
        "draft": "Qwen/Qwen2.5-0.5B-Instruct",
        "draft_params_b": 0.49,
    },
    "engine": {"name": "vllm", "version": "0.10.2"},
    "gpu": "1x H100 SXM 80GB (rented)",
    "workload": {
        "dataset": "HumanEval prompts rewritten as code-revision requests",
        "prompts": len(gpu_run.load_prompts()),
        "input_tokens_mean": 412,
        "output_tokens": gpu_run.OUTPUT_TOKENS,
    },
    "speculation": {"draft_target_tokens": 4, "ngram_tokens": 5},
    "warmup": {"requests": gpu_run.WARMUP},
    "runs": runs,
}
with open("results.json", "w", encoding="utf-8") as handle:
    json.dump(results, handle, indent=2)
    handle.write("\n")
print(f"results.json: {len(runs)} runs")
