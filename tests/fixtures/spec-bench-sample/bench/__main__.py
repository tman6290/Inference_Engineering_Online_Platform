"""Run the speculation benchmark grid and write results.json plus the three charts.

GPU run (one method per server launch, see scripts/launch.sh):
    python -m bench --method ngram --base-url http://localhost:8000 --out runs/ngram
Dry run on CPU with the toy models:
    python -m bench --dry-run --out "$OUT_DIR"
"""

import argparse
import json
import os
import sys
import tempfile

from . import charts, grid, stats, toy

DRY_RUN_REQUESTS = 20
DRY_RUN_WARMUP = 2
DRY_RUN_OUTPUT_TOKENS = 32
DRAFT_TOKENS = 4
NGRAM_TOKENS = 5


def dry_run(out_dir):
    runs = []
    for seed, (method, batch_size, temperature) in enumerate(grid.combinations()):
        k = NGRAM_TOKENS if method == "ngram" else DRAFT_TOKENS
        records, wall_s = toy.simulate_cell(
            method,
            batch_size,
            temperature,
            DRY_RUN_REQUESTS,
            DRY_RUN_WARMUP,
            DRY_RUN_OUTPUT_TOKENS,
            k,
            seed,
        )
        runs.append(stats.summarise(method, batch_size, temperature, records, wall_s))
    results = {
        "model": {
            "target": "toy-64 (dry run)",
            "target_params_b": 0.000004,
            "draft": "toy-64-noisy (dry run)",
            "draft_params_b": 0.000004,
        },
        "engine": {"name": "vllm", "version": "dry-run"},
        "gpu": "none (CPU dry run)",
        "workload": {
            "dataset": "synthetic repeated-span prompts",
            "prompts": DRY_RUN_REQUESTS,
            "input_tokens_mean": 48,
            "output_tokens": DRY_RUN_OUTPUT_TOKENS,
        },
        "speculation": {"draft_target_tokens": DRAFT_TOKENS, "ngram_tokens": NGRAM_TOKENS},
        "warmup": {"requests": DRY_RUN_WARMUP},
        "runs": runs,
    }
    return results


def check(results):
    problems = [f"missing run {combo}" for combo in grid.missing_runs(results["runs"])]
    for run in results["runs"]:
        name = f"{run['method']} b{run['batch_size']} T{run['temperature']}"
        if run["itl_ms"]["p95"] < run["itl_ms"]["p50"]:
            problems.append(f"{name}: P95 below P50")
        if (run["acceptance_rate"] is None) != (run["method"] == "baseline"):
            problems.append(f"{name}: acceptance rate must be null only for baseline")
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(prog="bench")
    parser.add_argument("--dry-run", action="store_true", help="simulate on CPU with toy models")
    parser.add_argument("--out", default=os.environ.get("OUT_DIR") or None)
    parser.add_argument("--method", choices=grid.METHODS)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args(argv)
    out_dir = args.out or tempfile.mkdtemp(prefix="bench-")

    if not args.dry_run:
        from .gpu_run import run_method  # imported late: the GPU path talks to a live server

        run_method(args.method, args.base_url, out_dir)
        return 0

    results = dry_run(out_dir)
    problems = check(results)
    if problems:
        for problem in problems:
            print("FAIL", problem)
        return 1
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "results.json"), "w", encoding="utf-8") as handle:
        json.dump(results, handle, indent=2)
    charts.write_charts(results, os.path.join(out_dir, "charts"))

    by_key = {(r["method"], r["batch_size"], r["temperature"]): r for r in results["runs"]}
    for method in ("draft_target", "ngram"):
        cells = []
        for batch_size in grid.BATCH_SIZES:
            base = by_key[("baseline", batch_size, 0)]["itl_ms"]["p50"]
            spec = by_key[(method, batch_size, 0)]["itl_ms"]["p50"]
            cells.append(f"b{batch_size} {base / spec:.2f}x")
        print(f"{method:>12} speedup at T=0: " + ", ".join(cells))
    print(f"wrote {len(results['runs'])} runs and 3 charts to {out_dir}")
    print("dry-run ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
