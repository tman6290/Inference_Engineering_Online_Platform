PYTHON ?= python3
OUT_DIR ?= $(shell mktemp -d)
export PYTHONDONTWRITEBYTECODE = 1

.PHONY: check charts

# CPU dry run of the whole pipeline with toy models; writes only under $(OUT_DIR).
check:
	$(PYTHON) -m bench --dry-run --out "$(OUT_DIR)"

# Redraw the committed charts from the committed results.json.
charts:
	$(PYTHON) -m bench.charts results.json charts
