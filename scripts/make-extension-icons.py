#!/usr/bin/env python3
"""
Generate the browser extension's icon set from the same drawing used for the
app icon (scripts/make-icon.py), so the toolbar icon matches Grabbr exactly.

    py scripts/make-extension-icons.py
    -> extension/icons/icon16.png, icon32.png, icon48.png, icon128.png
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "extension", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (10, 10, 10, 255)       # #0a0a0a, matches the app background
FG = (255, 255, 255, 255)

S = 1024


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def render(size=S):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024.0

    m = 36 * u
    rounded(d, [m, m, size - m, size - m], 224 * u, BG)

    cx = size / 2
    stem_w = 150 * u

    rounded(d, [cx - stem_w / 2, 250 * u, cx + stem_w / 2, 560 * u], stem_w / 2, FG)

    half = 235 * u
    d.polygon([(cx - half, 470 * u), (cx + half, 470 * u), (cx, 730 * u)], fill=FG)

    bl_w = 470 * u
    rounded(d, [cx - bl_w / 2, 790 * u, cx + bl_w / 2, 858 * u], 34 * u, FG)

    return img


master = render(S)
for size in (16, 32, 48, 128):
    master.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon{size}.png"))

print("wrote:", ", ".join(sorted(os.listdir(OUT))))
