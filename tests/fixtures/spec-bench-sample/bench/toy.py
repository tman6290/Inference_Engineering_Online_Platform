"""Dry-run stand-ins: a toy target model, a toy draft model, n-gram lookup, and a cost clock.

The toy models are tiny lookup tables over a 64-token vocabulary, so the speculation logic
(draft, verify, accept a prefix, sample a bonus token) runs for real while time comes from a
simulated clock instead of a GPU. The clock follows the shape of a real decode step: each step
reads the weights once (a fixed memory cost) and pays compute per token in the batch, so the
step turns compute bound once batch size times tokens per sequence gets large.
"""

import math
import random

VOCAB = 64

# Cost clock, in simulated milliseconds.
WEIGHT_READ_MS = 7.0  # one pass over the target weights
COMPUTE_MS_PER_TOKEN = 0.055  # per token processed in a step, across the batch
STEP_OVERHEAD_MS = 0.3
DRAFT_STEP_MS = 0.9  # one forward pass of the draft model
NGRAM_LOOKUP_MS = 0.05
PREFILL_MS_PER_TOKEN = 0.07
COLD_START_FACTOR = 3.0  # first requests after launch pay for graph capture and allocation


class ToyModel:
    """Next-token distribution from the last token, with a pull toward copying the context."""

    def __init__(self, seed, noise=0.0, copy_bias=2.5):
        rng = random.Random(seed)
        self.table = [[rng.gauss(0, 1.0) for _ in range(VOCAB)] for _ in range(VOCAB)]
        if noise:
            noise_rng = random.Random(seed + 1)
            base = ToyModel(seed=0, copy_bias=copy_bias).table
            self.table = [
                [base[i][j] + noise_rng.gauss(0, noise) for j in range(VOCAB)] for i in range(VOCAB)
            ]
        self.copy_bias = copy_bias

    def probs(self, context, temperature):
        last = context[-1]
        logits = list(self.table[last])
        # Code revision repeats the input: favour whatever followed `last` earlier on.
        for i in range(len(context) - 2, -1, -1):
            if context[i] == last:
                logits[context[i + 1]] += self.copy_bias
                break
        if temperature == 0:
            best = max(range(VOCAB), key=logits.__getitem__)
            return [1.0 if i == best else 0.0 for i in range(VOCAB)]
        top = max(logits)
        weights = [math.exp((x - top) / temperature) for x in logits]
        total = sum(weights)
        return [w / total for w in weights]


def sample(probs, rng):
    pick = rng.random()
    running = 0.0
    for token, p in enumerate(probs):
        running += p
        if pick < running:
            return token
    return VOCAB - 1


def ngram_draft(context, k, n=2):
    """Find the latest earlier match of the last n tokens and propose what followed it."""
    if len(context) <= n:
        return []
    key = context[-n:]
    for start in range(len(context) - n - 1, -1, -1):
        if context[start : start + n] == key:
            return context[start + n : start + n + k]
    return []


def step_ms(batch_size, tokens_per_seq):
    compute = COMPUTE_MS_PER_TOKEN * batch_size * tokens_per_seq
    return max(WEIGHT_READ_MS, compute) + STEP_OVERHEAD_MS


def make_prompt(rng, length):
    """A prompt with repeated spans, like a file pasted in for revision."""
    span = [rng.randrange(VOCAB) for _ in range(length // 3)]
    prompt = []
    while len(prompt) < length:
        prompt.extend(span if rng.random() < 0.7 else [rng.randrange(VOCAB) for _ in range(8)])
    return prompt[:length]


def run_request(method, batch_size, temperature, prompt, output_tokens, k, target, draft, rng):
    """Generate one sequence; returns ttft_ms, itl_ms, output_tokens, drafted, accepted."""
    context = list(prompt)
    prefill = PREFILL_MS_PER_TOKEN * len(prompt) * max(1, batch_size / 4)
    if method == "draft_target":
        prefill *= 1.12  # the draft model prefills the same prompt
    ttft = prefill + step_ms(batch_size, 1)
    context.append(sample(target.probs(context, temperature), rng))

    clock = 0.0
    produced = 1
    drafted = accepted = 0
    while produced < output_tokens:
        if method == "baseline":
            proposal = []
            draft_ms = 0.0
        elif method == "ngram":
            proposal = ngram_draft(context, k)
            draft_ms = NGRAM_LOOKUP_MS
        else:
            proposal, scratch = [], list(context)
            for _ in range(k):
                token = sample(draft.probs(scratch, temperature), rng)
                proposal.append(token)
                scratch.append(token)
            draft_ms = DRAFT_STEP_MS * k * (1 + batch_size / 64)

        # Verify: accept the longest prefix the target agrees with, then add one token of its own.
        new = []
        for token in proposal:
            p = target.probs(context + new, temperature)
            if method == "draft_target" and temperature > 0:
                q = draft.probs(context + new, temperature)
                keep = rng.random() < min(1.0, p[token] / max(q[token], 1e-12))
            else:
                keep = rng.random() < p[token]
            if not keep:
                break
            new.append(token)
        drafted += len(proposal)
        accepted += len(new)
        new.append(sample(target.probs(context + new, temperature), rng))

        clock += draft_ms + step_ms(batch_size, 1 + len(proposal))
        context.extend(new)
        produced += len(new)

    itl = clock / max(produced - 1, 1)
    return {
        "ttft_ms": ttft,
        "itl_ms": itl,
        "output_tokens": produced,
        "drafted": drafted,
        "accepted": accepted,
    }


def simulate_cell(method, batch_size, temperature, requests, warmup, output_tokens, k, seed):
    """Run warm-up plus measured requests for one grid cell; returns (records, wall_s)."""
    rng = random.Random(seed)
    target = ToyModel(seed=0)
    draft = ToyModel(seed=0, noise=1.2)
    records = []
    for index in range(warmup + requests):
        prompt = make_prompt(rng, 48)
        record = run_request(
            method, batch_size, temperature, prompt, output_tokens, k, target, draft, rng
        )
        jitter = rng.lognormvariate(0, 0.12)  # scheduling noise, right-skewed
        record["ttft_ms"] *= jitter
        record["itl_ms"] *= jitter
        if index < warmup:
            record["ttft_ms"] *= COLD_START_FACTOR
            continue  # warm-up requests never reach the numbers
        records.append(record)
    busy_ms = sum(r["ttft_ms"] + r["itl_ms"] * (r["output_tokens"] - 1) for r in records)
    wall_s = busy_ms / batch_size / 1000
    return records, wall_s
