"""Latency percentiles from request timings (exercise 1.4-percentiles).

Python standard library only. Fill in every function that raises NotImplementedError,
run the tests with `python -m pytest -q`, then run `python latency.py` to print the summary
for requests.csv.

Each request is a dict with these keys, all integers, times in milliseconds on one clock:
    sent_ms         when the client sent the request
    first_token_ms  when the client received the first output token
    last_token_ms   when the client received the last output token
    output_tokens   how many tokens the response contained (at least 1)
"""

from __future__ import annotations

import csv
import math
from pathlib import Path

PERCENTILES = (50, 90, 99)


def load_requests(path: str | Path) -> list[dict]:
    """Reads requests.csv into a list of request dicts. Already done for you."""
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
    """The p-th percentile of `values` by the nearest-rank method.

    Sort the values ascending. The rank is ceil(p * n / 100), counted from 1, and the answer
    is the value at that rank. No interpolation: the result is always one of the inputs.
    `values` may arrive unsorted; do not modify the caller's list.

    Raise ValueError when `values` is empty or when p is not in the range 0 < p <= 100.
    Tip: compute p * n / 100 before calling math.ceil, so 90 * 20 / 100 is exactly 18.0.
    """
    raise NotImplementedError


def ttft_ms(request: dict) -> float:
    """Time to first token as the client saw it: first token received minus request sent."""
    raise NotImplementedError


def e2e_ms(request: dict) -> float:
    """End-to-end total response time: last token received minus request sent."""
    raise NotImplementedError


def perceived_tps(request: dict) -> float:
    """Tokens per second the user saw after the first token arrived.

    The tokens after the first one (output_tokens - 1) divided by the seconds between the first
    and the last token. Raise ValueError for a single-token response, which has no decode phase.
    """
    raise NotImplementedError


def summarize(requests: list[dict]) -> dict[str, float]:
    """P50, P90 and P99 of TTFT and end-to-end latency, plus the mean end-to-end latency.

    Keys: ttft_p50, ttft_p90, ttft_p99, e2e_p50, e2e_p90, e2e_p99, e2e_mean.
    """
    raise NotImplementedError


def main() -> None:
    requests = load_requests(Path(__file__).with_name("requests.csv"))
    summary = summarize(requests)
    for key, value in summary.items():
        print(f"{key:>9}: {value:8.1f} ms")


if __name__ == "__main__":
    main()
