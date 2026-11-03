import math

import pytest

from speculation import best_draft_length, expected_tokens_per_pass, speedup


def test_no_drafts_gives_one_token():
    assert expected_tokens_per_pass(0.7, 0) == pytest.approx(1.0)


def test_perfect_acceptance_gives_k_plus_one():
    assert expected_tokens_per_pass(1.0, 6) == pytest.approx(7.0)


def test_zero_acceptance_gives_only_the_target_token():
    assert expected_tokens_per_pass(0.0, 5) == pytest.approx(1.0)


def test_known_value():
    # 1 + 0.8 + 0.64 + 0.512 + 0.4096 + 0.32768
    assert expected_tokens_per_pass(0.8, 5) == pytest.approx(3.68928)


def test_matches_geometric_series():
    p, k = 0.93, 11
    assert expected_tokens_per_pass(p, k) == pytest.approx((1 - p ** (k + 1)) / (1 - p))


def test_not_the_naive_linear_count():
    # k * p + 1 ignores that one rejection discards the rest.
    assert not math.isclose(expected_tokens_per_pass(0.9, 3), 1 + 3 * 0.9)


def test_speedup_with_free_drafts_equals_tokens_per_pass():
    assert speedup(0.75, 4, 0.0) == pytest.approx(expected_tokens_per_pass(0.75, 4))


def test_speedup_includes_draft_cost():
    # 3.3616 tokens over 1 + 4 * 0.04 = 1.16 pass time
    assert speedup(0.8, 4, 0.04) == pytest.approx(3.3616 / 1.16)


def test_speedup_without_speculation_is_one():
    assert speedup(0.5, 0, 0.1) == pytest.approx(1.0)


def test_speculation_can_slow_things_down():
    assert speedup(0.1, 4, 0.2) < 1.0


def test_best_length_known_case():
    assert best_draft_length(0.8, 0.05, 10) == 8


def test_best_length_turns_speculation_off_when_it_loses():
    assert best_draft_length(0.1, 0.5, 8) == 0


def test_best_length_respects_max():
    assert best_draft_length(1.0, 0.0, 5) == 5


def test_best_length_prefers_shorter_on_tie():
    # With p = 0 every length gives 1 / (1 + k * 0) = 1.0: a tie, so 0 wins.
    assert best_draft_length(0.0, 0.0, 6) == 0


@pytest.mark.parametrize(
    "args",
    [(-0.1, 3), (1.1, 3), (0.5, -1), (0.5, 2.5)],
)
def test_rejects_bad_inputs(args):
    with pytest.raises(ValueError):
        expected_tokens_per_pass(*args)


def test_rejects_negative_draft_cost():
    with pytest.raises(ValueError):
        speedup(0.5, 3, -0.01)
