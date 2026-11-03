"""Tests for score_eval.py. They use their own tiny samples, so they don't give away the answer."""

import pytest

from score_eval import accuracy, is_correct, normalise_sql

ROWS = [
    {"id": "t1", "tag": "easy", "expected": "SELECT a FROM t", "big": "SELECT a FROM t", "tiny": "select a from t;"},
    {"id": "t2", "tag": "easy", "expected": "SELECT b FROM t", "big": "SELECT b FROM t", "tiny": "SELECT c FROM t"},
    {"id": "t3", "tag": "hard", "expected": "SELECT x, COUNT(*) FROM t GROUP BY x", "big": "SELECT x, COUNT(*) FROM t GROUP BY x", "tiny": "SELECT x FROM t"},
    {"id": "t4", "tag": "hard", "expected": "SELECT y FROM t WHERE z IS NULL", "big": "SELECT y FROM t WHERE z = NULL", "tiny": "SELECT y\nFROM t   WHERE z IS NULL ;"},
]


def test_normalise_lowercases_and_collapses_whitespace():
    assert normalise_sql("  SELECT  name\n\tFROM   t  ") == "select name from t"


def test_normalise_drops_trailing_semicolons():
    assert normalise_sql("SELECT 1;") == "select 1"
    assert normalise_sql("SELECT 1 ; ;") == "select 1"


def test_normalise_keeps_inner_semicolons_and_symbols():
    assert normalise_sql("SELECT ';' FROM t WHERE a >= 2") == "select ';' from t where a >= 2"


def test_is_correct_ignores_cosmetics_but_not_meaning():
    assert is_correct("SELECT a FROM t", "select a\nfrom t;")
    assert not is_correct("SELECT a FROM t", "SELECT b FROM t")
    assert not is_correct("SELECT a FROM t LEFT JOIN u", "SELECT a FROM t JOIN u")


def test_accuracy_overall():
    assert accuracy(ROWS, "big") == pytest.approx(75.0)
    assert accuracy(ROWS, "tiny") == pytest.approx(50.0)


def test_accuracy_by_tag():
    assert accuracy(ROWS, "big", "hard") == pytest.approx(50.0)
    assert accuracy(ROWS, "tiny", "hard") == pytest.approx(50.0)
    assert accuracy(ROWS, "tiny", "easy") == pytest.approx(50.0)
    assert accuracy(ROWS, "big", "easy") == pytest.approx(100.0)


def test_accuracy_rejects_empty_slice_and_unknown_model():
    with pytest.raises(ValueError):
        accuracy(ROWS, "big", "medium")
    with pytest.raises(ValueError):
        accuracy([], "big")
    with pytest.raises(ValueError):
        accuracy(ROWS, "huge")
