# Zero-downtime deploy drill

## The situation

Your team ships a new model server version every week: a new engine release, a quantized checkpoint, a prompt template fix. Each deploy risks dropped requests while the new version starts, and a bad release can reach every user before anyone notices. A blue-green switch would double your GPU bill for the length of the deploy, so the team wants a canary rollout instead (see 7.4.1).

You will build that rollout on one machine, then rehearse it twice under load: once with a good release and once with a bad one. The decision this informs is the rollout policy itself: step sizes, hold times and the gate thresholds that trigger a rollback.

## What you build

1. **A containerised model server.** Serve a small open model on CPU (100M to 500M parameters is plenty) behind an HTTP endpoint. Pin every dependency in the `Dockerfile` (see 7.1.1). Add a readiness endpoint that answers only after the weights have loaded, and measure the cold start (see 7.2.2).
2. **Two releases.** v2-good changes something harmless, such as a generation default. v2-bad fails the way real releases fail: it returns errors on a share of requests or adds latency. Say which in the README.
3. **A router** in front of both versions with weighted traffic splitting.
4. **A load generator** that sends a steady request rate for the whole drill, including while v2 starts.
5. **A drill script.** It starts v2, waits for readiness, then moves traffic in steps, for example 5%, 25%, 50% and 100%. It holds each step for a fixed time and checks two gates: error rate and P95 latency. If a gate fails, it sends all traffic back to v1. It keeps v1 running until v2 has held 100% for one full step.
6. **Observability.** For every step, record requests, 5xx responses, failed connections, and P50 and P95 latency (see 7.4.3). Plot them over time in `charts/rollout-timeline.png`, with step changes and any rollback marked.
7. **A dry run.** `make check` runs the drill with `--dry-run`: stub v1 and v2 servers, the router and the load generator, all in-process on `127.0.0.1`, with no Docker and no model. Shorten the steps to a few seconds. It must promote the good release, roll back the bad one, write its output only under `$OUT_DIR` (a temp directory when unset), and print `drill ok`.

## The sandbox

The grader runs `make check` in a `python:3.12-slim` container with `make` and `git`, 2 CPUs, 4 GB of memory and no network, with your repo mounted read-only. Loopback works; Docker does not. The dry run must finish in under 8 minutes.

## Deliverables

- `README.md` with `## Outcome`, `## Architecture`, `## Drill`, `## Results` and `## Runbook`. Open with the outcome of both rollouts in numbers: requests served, requests failed, and how many requests the bad release reached before rollback.
- `results.json`, `Makefile`, `Dockerfile`, `charts/rollout-timeline.png`, the server, router, load generator and drill script, and a Compose file that starts the real drill.

Write the runbook for an on-call engineer who has never seen this repo: what to run, what to watch at each step, and when to abort by hand.

## results.json

- `model`, `load` (`rps`, `duration_s`), `gates` (`max_error_rate`, `max_p95_ms`).
- `rollouts`: at least one good release with outcome `promoted` and one bad release with outcome `rolled_back`. Each has `name`, `kind`, `outcome`, `cold_start_s`, `total_requests`, `failed_requests`, and two or more `steps` with `weight_pct`, `duration_s`, `requests`, `errors_5xx`, `failed_connections` and `latency_ms` (`p50`, `p95`).

## How it is graded

Checks run first: files, README sections, the schema, and the dry run. The critique scores rollout mechanics, gates and rollback, observability, and the runbook and write-up, against the book's production chapter (see 7.1, 7.2 and 7.4). A README claim of "zero downtime" has to match `failed_requests` in `results.json`; if it does not, the critique says so.

No GPU and no cloud account are needed.
