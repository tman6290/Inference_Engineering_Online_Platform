"""Runs the full grid for one method against a live server and writes runs/<method>.json.

scripts/merge.py combines the three method files into results.json.
"""

import json
import os

from . import client, grid, stats

MODEL = "Qwen/Qwen2.5-7B-Instruct"
PROMPTS_FILE = "data/prompts.jsonl"
REQUESTS = 200
WARMUP = 16
OUTPUT_TOKENS = 256


def load_prompts(path=PROMPTS_FILE):
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line)["prompt"] for line in handle if line.strip()]


def run_method(method, base_url, out_dir):
    prompts = load_prompts()
    runs = []
    for batch_size in grid.BATCH_SIZES:
        for temperature in grid.TEMPERATURES:
            requests = max(REQUESTS, 2 * batch_size)
            records, wall_s = client.run_cell(
                base_url, MODEL, prompts, batch_size, temperature, requests, WARMUP, OUTPUT_TOKENS
            )
            runs.append(stats.summarise(method, batch_size, temperature, records, wall_s))
            print(f"{method} b{batch_size} T{temperature}: {runs[-1]['itl_ms']}")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{method}.json"), "w", encoding="utf-8") as handle:
        json.dump(runs, handle, indent=2)
