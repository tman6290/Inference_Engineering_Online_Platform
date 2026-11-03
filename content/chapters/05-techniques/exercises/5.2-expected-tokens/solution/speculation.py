"""Reference solution for 5.2-expected-tokens. See ../speculation.py for the model."""


def _check(acceptance: float, draft_length: int) -> None:
    if isinstance(draft_length, bool) or not isinstance(draft_length, int):
        raise ValueError("draft_length must be an int")
    if draft_length < 0:
        raise ValueError("draft_length must be >= 0")
    if not 0.0 <= acceptance <= 1.0:
        raise ValueError("acceptance must be between 0 and 1")


def expected_tokens_per_pass(acceptance: float, draft_length: int) -> float:
    _check(acceptance, draft_length)
    # Position i survives only if positions 1..i all match: probability p**i.
    return 1.0 + sum(acceptance**i for i in range(1, draft_length + 1))


def speedup(acceptance: float, draft_length: int, draft_cost: float) -> float:
    if draft_cost < 0:
        raise ValueError("draft_cost must be >= 0")
    tokens = expected_tokens_per_pass(acceptance, draft_length)
    pass_time = 1.0 + draft_length * draft_cost
    return tokens / pass_time


def best_draft_length(acceptance: float, draft_cost: float, max_length: int = 16) -> int:
    best_k, best_s = 0, speedup(acceptance, 0, draft_cost)
    for k in range(1, max_length + 1):
        s = speedup(acceptance, k, draft_cost)
        if s > best_s + 1e-12:
            best_k, best_s = k, s
    return best_k


if __name__ == "__main__":
    k = best_draft_length(0.8, 0.05, 10)
    print(k, round(speedup(0.8, k, 0.05), 4))
