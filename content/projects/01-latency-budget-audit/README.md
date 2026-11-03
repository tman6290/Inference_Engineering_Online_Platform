# Latency budget audit

## The situation

Your team wants to add an LLM feature: a support chat reply, a code explanation panel, a meeting summary. Someone has to say how fast it must feel and whether the endpoint you plan to call can deliver that. Product will ask "is it fast enough?", and an average from a dozen manual tries will not answer them. You will answer with a budget, a few hundred timed requests and a verdict.

The audit informs one decision: ship on this endpoint as it stands, or go fix the part of the latency that breaks the budget.

## What you build

1. **A budget.** Pick one feature and one kind of user. Decide whether the feature is online or offline and whether it serves consumers or businesses (see 1.2.2 and 1.2.3). Then set three targets, each at P95: time to first token, inter-token latency, and end-to-end time. Write one or two sentences on where each number comes from.
2. **A streaming client.** Call any streaming endpoint: a hosted API, or a model running on your own machine through Ollama or llama.cpp. For every request, log the send time, the arrival time of the first token and of every later token, the end time, input and output token counts, and the status. Use a monotonic clock. Append one JSON object per request to `data/requests.jsonl`.
3. **Two prompt shapes.** Run a short-input shape (a few hundred tokens) and a long-input shape (a few thousand). Measure at least 150 requests per shape after warm-up. Record how many warm-up requests you dropped.
4. **An analysis script.** It reads `data/requests.jsonl` and writes `results.json` with mean, P50, P90, P95 and P99 for TTFT, inter-token latency and end-to-end time per shape (see 1.4.1).
5. **A `make check` target.** It recomputes the percentiles from the raw log and exits non-zero if any value in `results.json` differs by more than 1%. On success it prints `audit ok`. It must use the Python standard library only and run offline.

## Deliverables

- `README.md` with these sections: `## Verdict`, `## Budget`, `## Method`, `## Results`, `## Limitations`. Put the verdict first. Give the margin in milliseconds for each target.
- `data/requests.jsonl`, the raw log, committed.
- `results.json`, produced by your script.
- `Makefile` with a `check` target.
- The client and analysis code.

In the results section, compare the mean with P50 and say what produced the slowest 5% of requests. If you can split network and queue time from model time, do it: a server-reported timing header, a local run against the same model, or a ping baseline all help (see 1.4.2). If you cannot, say so under Limitations.

## results.json

The schema on the Rubric tab is the contract. In short:

- `endpoint`: `provider`, `model`, and `location` (`hosted` or `local`).
- `feature`: the feature you budgeted for.
- `budget`: `ttft_ms_p95`, `itl_ms_p95`, `e2e_ms_p95`.
- `warmup_requests`: how many you dropped.
- `shapes`: two or more entries, each with `name`, `requests` (150 or more), `errors`, `input_tokens_mean`, `output_tokens_mean`, `tps_per_user_p50`, and `ttft_ms`, `itl_ms`, `e2e_ms`, each holding `mean`, `p50`, `p90`, `p95`, `p99`.
- `meets_budget`: true or false.

## How it is graded

The checks run first: required files, README sections, the `results.json` schema, then `make check` inside a sandbox with no network and a read-only copy of your repo. The critique then scores the four rubric dimensions: budget, measurement, analysis and communication. It compares every number in your README with `results.json` and the raw log, and lists any claim it cannot find there under "What is wrong".

Keep API keys in environment variables. Never commit them.
