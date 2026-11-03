"""Expected tokens and speedup for speculative decoding (section 5.2).

Model used throughout:
- The speculator drafts `draft_length` tokens per pass.
- Each draft token matches the target with probability `acceptance`, independently.
- The first rejected draft token discards every draft token after it.
- The target always adds one token of its own, so a pass emits N + 1 tokens,
  where N is the number of accepted draft tokens.
- A validating pass costs the same as a plain decode pass (1.0), and each draft
  token adds `draft_cost` (a fraction of one target pass) to the pass time.

Python standard library only.
"""


def expected_tokens_per_pass(acceptance: float, draft_length: int) -> float:
    """Expected tokens emitted per target pass: 1 + p + p**2 + ... + p**k.

    Raise ValueError if acceptance is outside [0, 1] or draft_length is negative
    or not an int.
    """
    raise NotImplementedError


def speedup(acceptance: float, draft_length: int, draft_cost: float) -> float:
    """Tokens per second relative to plain decode (1 token per 1.0 pass time).

    A speculative pass takes 1 + draft_length * draft_cost. Raise ValueError if
    draft_cost is negative, plus the checks of expected_tokens_per_pass.
    """
    raise NotImplementedError


def best_draft_length(acceptance: float, draft_cost: float, max_length: int = 16) -> int:
    """The draft length in 0..max_length with the highest speedup.

    On a tie, return the shorter length. Length 0 means speculation off
    (speedup 1.0).
    """
    raise NotImplementedError
