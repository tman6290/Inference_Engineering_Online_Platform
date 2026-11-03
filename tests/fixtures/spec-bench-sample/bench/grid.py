"""The benchmark grid: every method at every batch size and temperature."""

METHODS = ("baseline", "draft_target", "ngram")
BATCH_SIZES = (1, 8, 32, 128)
TEMPERATURES = (0, 0.8)


def combinations():
    for method in METHODS:
        for batch_size in BATCH_SIZES:
            for temperature in TEMPERATURES:
                yield method, batch_size, temperature


def missing_runs(runs):
    """Grid cells with no run in `runs`; an empty list means the grid is complete."""
    seen = {(r["method"], r["batch_size"], r["temperature"]) for r in runs}
    return [combo for combo in combinations() if combo not in seen]
