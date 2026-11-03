"""Build data/prompts.jsonl: each HumanEval problem with its reference solution, framed as a
request to revise the code (add type hints and a docstring example). Needs network once."""

import gzip
import json
import os
import urllib.request

SOURCE = "https://github.com/openai/human-eval/raw/master/data/HumanEval.jsonl.gz"

with urllib.request.urlopen(SOURCE, timeout=60) as response:
    rows = [json.loads(line) for line in gzip.decompress(response.read()).decode().splitlines()]

os.makedirs("data", exist_ok=True)
with open("data/prompts.jsonl", "w", encoding="utf-8") as handle:
    for row in rows:
        code = row["prompt"] + row["canonical_solution"]
        prompt = (
            "Revise this Python function. Add full type hints and one doctest example to the "
            "docstring. Return the whole function and nothing else.\n\n" + code
        )
        handle.write(json.dumps({"task_id": row["task_id"], "prompt": prompt}) + "\n")
print(f"wrote {len(rows)} prompts")
