from batch_cost import cost_per_request


def test_shared_read():
    assert cost_per_request(16, 8) == 2
