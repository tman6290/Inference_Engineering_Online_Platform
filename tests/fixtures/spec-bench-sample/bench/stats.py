"""Percentiles and per-run summaries from per-request records."""


def percentile(values, q):
    """Linear-interpolated percentile, q in [0, 100]."""
    if not values:
        raise ValueError("no values")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * q / 100
    low = int(rank)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def p50_p95(values):
    return {"p50": round(percentile(values, 50), 2), "p95": round(percentile(values, 95), 2)}


def summarise(method, batch_size, temperature, records, wall_s):
    """One results.json run from the measured (post-warm-up) requests of one grid cell.

    Each record has ttft_ms, itl_ms (mean gap for that request), output_tokens, and for
    speculative methods drafted and accepted token counts.
    """
    itl = [r["itl_ms"] for r in records]
    drafted = sum(r.get("drafted", 0) for r in records)
    accepted = sum(r.get("accepted", 0) for r in records)
    tps = [1000 / r["itl_ms"] for r in records]
    tokens = sum(r["output_tokens"] for r in records)
    return {
        "method": method,
        "batch_size": batch_size,
        "temperature": temperature,
        "requests": len(records),
        "ttft_ms": p50_p95([r["ttft_ms"] for r in records]),
        "itl_ms": p50_p95(itl),
        "tps_per_user_p50": round(percentile(tps, 50), 1),
        "output_tps_total": round(tokens / wall_s, 1),
        "acceptance_rate": round(accepted / drafted, 3) if method != "baseline" and drafted else None,
    }
