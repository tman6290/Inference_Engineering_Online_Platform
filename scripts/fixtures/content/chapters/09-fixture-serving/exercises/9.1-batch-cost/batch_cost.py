def cost_per_request(read_ms: float, batch: int) -> float:
    """Cost of one shared read, split across the batch."""
    raise NotImplementedError
