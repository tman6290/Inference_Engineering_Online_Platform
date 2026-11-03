"""Score a small text-to-SQL eval for two models, overall and on the hard slice (see 1.3.1).

Each line of eval_results.jsonl is one eval item:
    {"id": "q01", "tag": "easy" | "hard", "expected": "...", "frontier": "...", "small": "..."}
"expected" is the reference query; "frontier" and "small" are what each model produced.

Python standard library only. Run `python score_eval.py` to print the report.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).with_name("eval_results.jsonl")
MODELS = ("frontier", "small")


def load_rows(path: Path = DATA) -> list[dict]:
    """Read one JSON object per non-empty line. (Already written.)"""
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def normalise_sql(query: str) -> str:
    """Return a canonical form of a query so cosmetic differences don't count as errors.

    Rules, in order:
      1. lowercase everything (a simplification: it also lowercases string literals);
      2. strip leading and trailing whitespace;
      3. remove any trailing semicolons (and whitespace left before them);
      4. collapse every run of whitespace, including newlines, to a single space.

    "  SELECT name\nFROM t ;" -> "select name from t"
    """
    raise NotImplementedError("TODO: implement normalise_sql")


def is_correct(expected: str, output: str) -> bool:
    """True when the output matches the expected query after normalise_sql."""
    raise NotImplementedError("TODO: implement is_correct")


def accuracy(rows: list[dict], model: str, tag: str | None = None) -> float:
    """Percentage (0-100) of rows where `model`'s output is correct.

    When `tag` is given, only rows with that tag count. Raise ValueError if no rows are
    left to score, or if `model` is not a key of the rows.
    """
    raise NotImplementedError("TODO: implement accuracy")


def main() -> None:
    """Print overall and per-slice accuracy for both models. (Already written.)"""
    rows = load_rows()
    for model in MODELS:
        overall = accuracy(rows, model)
        easy = accuracy(rows, model, "easy")
        hard = accuracy(rows, model, "hard")
        print(f"{model:>8}: overall {overall:5.1f}%  easy {easy:5.1f}%  hard {hard:5.1f}%")


if __name__ == "__main__":
    main()
