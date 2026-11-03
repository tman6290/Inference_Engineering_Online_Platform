"""The three charts, drawn with the standard library (zlib + struct) so the dry run needs no
plotting package. Usage: python -m bench.charts results.json charts/
"""

import json
import math
import os
import struct
import sys
import zlib

WHITE = (255, 255, 255)
INK = (30, 30, 30)
GRID = (225, 225, 225)
COLOURS = {
    ("baseline", 0): (120, 120, 120),
    ("baseline", 0.8): (180, 180, 180),
    ("draft_target", 0): (31, 119, 180),
    ("draft_target", 0.8): (140, 190, 230),
    ("ngram", 0): (214, 95, 15),
    ("ngram", 0.8): (245, 175, 120),
}

# 5x7 bitmap glyphs for axis labels and titles.
GLYPHS = {
    "0": "01110100011001110101110011000101110",
    "1": "00100011000010000100001000010001110",
    "2": "01110100010000100010001000100011111",
    "3": "11111000100010000010000011000101110",
    "4": "00010001100101010010111110001000010",
    "5": "11111100001111000001000011000101110",
    "6": "00110010001000011110100011000101110",
    "7": "11111000010001000100010000100001000",
    "8": "01110100011000101110100011000101110",
    "9": "01110100011000101111000010001001100",
    ".": "00000000000000000000000000110001100",
    "-": "00000000000000011111000000000000000",
    "%": "11000110010001000100010001001100011",
    "/": "00000000010001000100010001000000000",
    ":": "00000011000110000000011000110000000",
    "=": "00000000001111100000111110000000000",
    "(": "00010001000100001000010000010000010",
    ")": "01000001000001000010000100010001000",
    " ": "00000000000000000000000000000000000",
}
LETTERS = {
    "A": "01110100011000111111100011000110001",
    "B": "11110100011000111110100011000111110",
    "C": "01110100011000010000100001000101110",
    "D": "11100100101000110001100011001011100",
    "E": "11111100001000011110100001000011111",
    "F": "11111100001000011110100001000010000",
    "G": "01110100011000010111100011000101111",
    "H": "10001100011000111111100011000110001",
    "I": "01110001000010000100001000010001110",
    "K": "10001100101010011000101001001010001",
    "L": "10000100001000010000100001000011111",
    "M": "10001110111010110101100011000110001",
    "N": "10001100011100110101100111000110001",
    "O": "01110100011000110001100011000101110",
    "P": "11110100011000111110100001000010000",
    "R": "11110100011000111110101001001010001",
    "S": "01111100001000001110000010000111110",
    "T": "11111001000010000100001000010000100",
    "U": "10001100011000110001100011000101110",
    "V": "10001100011000110001100010101000100",
    "X": "10001100010101000100010101000110001",
    "Y": "10001100010101000100001000010000100",
    "W": "10001100011000110101101011101110001",
    "Z": "11111000010001000100010001000011111",
    "J": "00111000100001000010000101001001100",
    "Q": "01110100011000110001101011001001101",
    ",": "00000000000000000000001100010001000",
}
GLYPHS.update(LETTERS)


class Canvas:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self.pixels = [[WHITE] * width for _ in range(height)]

    def rect(self, x0, y0, x1, y1, colour):
        for y in range(max(0, int(y0)), min(self.height, int(y1))):
            row = self.pixels[y]
            for x in range(max(0, int(x0)), min(self.width, int(x1))):
                row[x] = colour

    def line(self, x0, y0, x1, y1, colour, width=2):
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(steps + 1):
            x = x0 + (x1 - x0) * i / steps
            y = y0 + (y1 - y0) * i / steps
            self.rect(x - width / 2, y - width / 2, x + width / 2 + 1, y + width / 2 + 1, colour)

    def text(self, x, y, value, colour=INK, scale=2):
        for char in value.upper():
            bits = GLYPHS.get(char, GLYPHS[" "])
            for index, bit in enumerate(bits):
                if bit == "1":
                    col, row = index % 5, index // 5
                    self.rect(x + col * scale, y + row * scale, x + (col + 1) * scale, y + (row + 1) * scale, colour)
            x += 6 * scale

    def png(self):
        raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in self.pixels)

        def chunk(kind, data):
            body = kind + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        header = struct.pack(">IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def frame(canvas, title, y_max, y_label, left=90, top=50, right=30, bottom=70):
    w, h = canvas.width, canvas.height
    canvas.text(left, 15, title, scale=2)
    plot = (left, top, w - right, h - bottom)
    for i in range(5):
        value = y_max * i / 4
        y = plot[3] - (plot[3] - plot[1]) * i / 4
        canvas.line(plot[0], y, plot[2], y, GRID, width=1)
        canvas.text(10, y - 7, f"{value:.2f}" if y_max < 10 else f"{value:.0f}", scale=2)
    canvas.line(plot[0], plot[1], plot[0], plot[3], INK, width=1)
    canvas.line(plot[0], plot[3], plot[2], plot[3], INK, width=1)
    canvas.text(left, h - 25, y_label, scale=2)
    return plot


def legend(canvas, x, y, keys):
    for key in keys:
        canvas.rect(x, y, x + 14, y + 14, COLOURS[key])
        canvas.text(x + 20, y, f"{key[0].replace('_', '-')} T={key[1]}", scale=2)
        y += 22


def index_runs(results):
    return {(r["method"], r["batch_size"], r["temperature"]): r for r in results["runs"]}


def speedup_chart(results):
    runs = index_runs(results)
    batches = sorted({r["batch_size"] for r in results["runs"]})
    canvas = Canvas(900, 520)
    keys = [(m, t) for m in ("draft_target", "ngram") for t in (0, 0.8)]
    speedups = {
        key: [runs[("baseline", b, key[1])]["itl_ms"]["p50"] / runs[(key[0], b, key[1])]["itl_ms"]["p50"] for b in batches]
        for key in keys
    }
    peak = max(max(v) for v in speedups.values()) * 1.05
    y_max = 2.0 if peak <= 2.0 else math.ceil(peak) * 1.0
    plot = frame(canvas, "SPEEDUP OVER BASELINE (P50 ITL)", y_max, "BATCH SIZE: " + " / ".join(map(str, batches)))
    xs = [plot[0] + (plot[2] - plot[0]) * (i + 0.5) / len(batches) for i in range(len(batches))]
    one = plot[3] - (plot[3] - plot[1]) * 1.0 / y_max
    canvas.line(plot[0], one, plot[2], one, INK, width=1)
    for key, values in speedups.items():
        points = [(x, plot[3] - (plot[3] - plot[1]) * v / y_max) for x, v in zip(xs, values)]
        for a, b in zip(points, points[1:]):
            canvas.line(a[0], a[1], b[0], b[1], COLOURS[key], width=3)
        for x, y in points:
            canvas.rect(x - 4, y - 4, x + 5, y + 5, COLOURS[key])
    for x, b in zip(xs, batches):
        canvas.text(x - 12, plot[3] + 10, str(b), scale=2)
    legend(canvas, plot[2] - 260, plot[1] + 10, keys)
    return canvas


def itl_chart(results):
    runs = results["runs"]
    canvas = Canvas(1100, 520)
    y_max = max(r["itl_ms"]["p95"] for r in runs) * 1.1
    plot = frame(canvas, "INTER-TOKEN LATENCY P50 (SOLID) AND P95 (OUTLINE), MS", y_max, "EACH GROUP: ONE BATCH SIZE")
    batches = sorted({r["batch_size"] for r in runs})
    order = [(m, t) for m in ("baseline", "draft_target", "ngram") for t in (0, 0.8)]
    by_key = index_runs(results)
    group_w = (plot[2] - plot[0]) / len(batches)
    bar_w = group_w * 0.8 / len(order)
    for g, b in enumerate(batches):
        for i, key in enumerate(order):
            run = by_key[(key[0], b, key[1])]
            x0 = plot[0] + g * group_w + group_w * 0.1 + i * bar_w
            scale = (plot[3] - plot[1]) / y_max
            p95_top = plot[3] - run["itl_ms"]["p95"] * scale
            canvas.rect(x0, p95_top, x0 + bar_w - 2, p95_top + 2, COLOURS[key])
            canvas.rect(x0, p95_top, x0 + 2, plot[3], COLOURS[key])
            canvas.rect(x0 + bar_w - 4, p95_top, x0 + bar_w - 2, plot[3], COLOURS[key])
            canvas.rect(x0, plot[3] - run["itl_ms"]["p50"] * scale, x0 + bar_w - 2, plot[3], COLOURS[key])
        canvas.text(plot[0] + g * group_w + group_w / 2 - 12, plot[3] + 10, str(b), scale=2)
    legend(canvas, plot[0] + 20, plot[1] + 10, order)
    return canvas


def acceptance_chart(results):
    by_key = index_runs(results)
    batches = sorted({r["batch_size"] for r in results["runs"]})
    keys = [(m, t) for m in ("draft_target", "ngram") for t in (0, 0.8)]
    canvas = Canvas(800, 480)
    plot = frame(canvas, "DRAFT ACCEPTANCE RATE (MEAN OVER BATCH SIZES)", 1.0, "METHOD AND TEMPERATURE")
    bar_w = (plot[2] - plot[0]) / len(keys)
    for i, key in enumerate(keys):
        rates = [by_key[(key[0], b, key[1])]["acceptance_rate"] for b in batches]
        rate = sum(rates) / len(rates)
        x0 = plot[0] + i * bar_w + bar_w * 0.2
        top = plot[3] - (plot[3] - plot[1]) * rate
        canvas.rect(x0, top, x0 + bar_w * 0.6, plot[3], COLOURS[key])
        canvas.text(x0, top - 22, f"{rate:.2f}", scale=2)
    legend(canvas, plot[2] - 260, plot[1] + 10, keys)
    return canvas


CHARTS = {
    "speedup-vs-batch.png": speedup_chart,
    "itl-p50-p95.png": itl_chart,
    "acceptance-rate.png": acceptance_chart,
}


def write_charts(results, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for name, draw in CHARTS.items():
        path = os.path.join(out_dir, name)
        with open(path, "wb") as handle:
            handle.write(draw(results).png())
        written.append(path)
    return written


if __name__ == "__main__":
    source, target = sys.argv[1], sys.argv[2]
    with open(source, encoding="utf-8") as handle:
        for path in write_charts(json.load(handle), target):
            print("wrote", path)
