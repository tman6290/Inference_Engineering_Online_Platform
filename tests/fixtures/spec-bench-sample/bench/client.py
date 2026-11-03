"""The GPU run: stream completions from a vLLM server and time every token.

The server is launched once per method with scripts/launch.sh; this client sends `batch_size`
concurrent streams so the engine's running batch holds that many sequences, and reads the
engine's speculative decoding counters from /metrics before and after each cell.
"""

import json
import threading
import time
import urllib.request

SPEC_COUNTERS = (
    "vllm:spec_decode_num_draft_tokens_total",
    "vllm:spec_decode_num_accepted_tokens_total",
)


def read_counters(base_url):
    with urllib.request.urlopen(f"{base_url}/metrics", timeout=10) as response:
        text = response.read().decode()
    values = {}
    for line in text.splitlines():
        for name in SPEC_COUNTERS:
            if line.startswith(name):
                values[name] = values.get(name, 0.0) + float(line.rsplit(" ", 1)[1])
    return values


def stream_one(base_url, model, prompt, max_tokens, temperature):
    body = json.dumps(
        {
            "model": model,
            "prompt": prompt,
            "max_tokens": max_tokens,
            "min_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
    ).encode()
    request = urllib.request.Request(
        f"{base_url}/v1/completions", data=body, headers={"Content-Type": "application/json"}
    )
    start = time.perf_counter()
    arrivals = []
    with urllib.request.urlopen(request, timeout=600) as response:
        for raw in response:
            line = raw.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            if json.loads(line[6:])["choices"][0]["text"]:
                arrivals.append(time.perf_counter())
    gaps = [b - a for a, b in zip(arrivals, arrivals[1:])]
    return {
        "ttft_ms": (arrivals[0] - start) * 1000,
        "itl_ms": sum(gaps) / len(gaps) * 1000,
        "output_tokens": len(arrivals),
    }


def run_cell(base_url, model, prompts, batch_size, temperature, requests, warmup, max_tokens):
    """Warm up, then keep `batch_size` streams in flight until `requests` have finished."""
    queue = list(prompts) * (1 + (warmup + requests) // len(prompts))
    queue = queue[: warmup + requests]
    lock = threading.Lock()
    done = []

    def worker():
        while True:
            with lock:
                if not queue:
                    return
                index = warmup + requests - len(queue)
                prompt = queue.pop(0)
            record = stream_one(base_url, model, prompt, max_tokens, temperature)
            with lock:
                done.append((index, record))

    before = read_counters(base_url)
    started = time.perf_counter()
    threads = [threading.Thread(target=worker) for _ in range(batch_size)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    wall_s = time.perf_counter() - started
    after = read_counters(base_url)

    measured = [record for index, record in sorted(done, key=lambda pair: pair[0]) if index >= warmup]
    drafted = after.get(SPEC_COUNTERS[0], 0) - before.get(SPEC_COUNTERS[0], 0)
    accepted = after.get(SPEC_COUNTERS[1], 0) - before.get(SPEC_COUNTERS[1], 0)
    if measured and drafted:
        measured[0]["drafted"], measured[0]["accepted"] = drafted, accepted
    return measured, wall_s
