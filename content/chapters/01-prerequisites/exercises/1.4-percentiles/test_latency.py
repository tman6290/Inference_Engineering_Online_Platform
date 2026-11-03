"""Tests for latency.py. They use their own small samples, not requests.csv."""

import pytest

from latency import e2e_ms, percentile, perceived_tps, summarize, ttft_ms

TEN = [900, 100, 300, 200, 500, 400, 700, 600, 1000, 800]


def request(sent, first, last, tokens):
    return {"sent_ms": sent, "first_token_ms": first, "last_token_ms": last, "output_tokens": tokens}


def test_percentile_nearest_rank_on_ten_values():
    assert percentile(TEN, 50) == 500
    assert percentile(TEN, 90) == 900
    assert percentile(TEN, 99) == 1000
    assert percentile(TEN, 100) == 1000


def test_percentile_rounds_the_rank_up():
    # 25% of 10 values is rank 2.5, which rounds up to rank 3.
    assert percentile(TEN, 25) == 300
    assert percentile(TEN, 1) == 100


def test_percentile_never_interpolates():
    values = [10, 20, 30, 40]
    for p in (10, 30, 50, 75, 80, 95):
        assert percentile(values, p) in values
    assert percentile(values, 80) == 40


def test_percentile_leaves_the_input_alone():
    values = [3, 1, 2]
    percentile(values, 50)
    assert values == [3, 1, 2]


def test_percentile_single_value():
    assert percentile([42], 1) == 42
    assert percentile([42], 99) == 42


@pytest.mark.parametrize("p", [0, -5, 100.5, 101])
def test_percentile_rejects_bad_p(p):
    with pytest.raises(ValueError):
        percentile(TEN, p)


def test_percentile_rejects_empty_input():
    with pytest.raises(ValueError):
        percentile([], 50)


def test_ttft_and_e2e():
    r = request(sent=1000, first=1250, last=3250, tokens=101)
    assert ttft_ms(r) == 250
    assert e2e_ms(r) == 2250


def test_perceived_tps_counts_tokens_after_the_first():
    # 100 tokens after the first, over 2 seconds of decode.
    r = request(sent=1000, first=1250, last=3250, tokens=101)
    assert perceived_tps(r) == pytest.approx(50.0)


def test_perceived_tps_rejects_single_token():
    with pytest.raises(ValueError):
        perceived_tps(request(sent=0, first=200, last=200, tokens=1))


def test_summarize():
    requests = [
        request(0, 100, 1100, 11),
        request(0, 200, 1200, 11),
        request(0, 300, 1300, 11),
        request(0, 400, 4400, 11),
    ]
    summary = summarize(requests)
    assert set(summary) == {
        "ttft_p50", "ttft_p90", "ttft_p99", "e2e_p50", "e2e_p90", "e2e_p99", "e2e_mean",
    }
    assert summary["ttft_p50"] == 200
    assert summary["ttft_p90"] == 400
    assert summary["ttft_p99"] == 400
    assert summary["e2e_p50"] == 1200
    assert summary["e2e_p90"] == 4400
    assert summary["e2e_mean"] == pytest.approx(2000.0)
