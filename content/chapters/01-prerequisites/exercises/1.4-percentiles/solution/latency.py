"""Reference solution for exercise 1.4-percentiles. Python standard library only."""

from __future__ import annotations

import csv
import math
from pathlib import Path

PERCENTILES = (50, 90, 99)


def load_requests(path: str | Path) -> list[dict]:
    """Reads requests.csv into a list of request dicts."""
    with open(path, newline="") as handle:
        return [
            {
                "request_id": row["request_id"],
                "sent_ms": int(row["sent_ms"]),
                "first_token_ms": int(row["first_token_ms"]),
                "last_token_ms": int(row["last_token_ms"]),
                "output_tokens": int(row["output_tokens"]),
            }
            for row in csv.DictReader(handle)
        ]


def percentile(values: list[float], p: float) -> float:
    """The p-th percentile of `values` by the nearest-rank method."""
    if not values:
        raise ValueError("percentile of an empty list")
    if not 0 < p <= 100:
        raise ValueError(f"p must be in (0, 100], got {p}")
    ordered = sorted(values)
    rank = math.ceil(p * len(ordered) / 100)
    return ordered[rank - 1]


def ttft_ms(request: dict) -> float:
    return request["first_token_ms"] - request["sent_ms"]


def e2e_ms(request: dict) -> float:
    return request["last_token_ms"] - request["sent_ms"]


def perceived_tps(request: dict) -> float:
    after_first = request["output_tokens"] - 1
    decode_s = (request["last_token_ms"] - request["first_token_ms"]) / 1000
    if after_first < 1 or decode_s <= 0:
        raise ValueError("a single-token response has no decode phase")
    return after_first / decode_s


def summarize(requests: list[dict]) -> dict[str, float]:
    ttfts = [ttft_ms(r) for r in requests]
    e2es = [e2e_ms(r) for r in requests]
    summary: dict[str, float] = {}
    for p in PERCENTILES:
        summary[f"ttft_p{p}"] = percentile(ttfts, p)
    for p in PERCENTILES:
        summary[f"e2e_p{p}"] = percentile(e2es, p)
    summary["e2e_mean"] = sum(e2es) / len(e2es)
    return summary


def main() -> None:
    requests = load_requests(Path(__file__).resolve().parent.parent / "requests.csv")
    summary = summarize(requests)
    for key, value in summary.items():
        print(f"{key:>9}: {value:8.1f} ms")


if __name__ == "__main__":
    main()
