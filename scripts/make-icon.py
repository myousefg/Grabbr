#!/usr/bin/env python3
"""
Generate the Grabbr app icon (window / tray / installer).

Swiss / high-contrast look: near-black rounded tile, bold white "pull down into
a tray" glyph, a download arrow sitting on a baseline.

    py scripts/make-icon.py
    -> electron/assets/icon.ico  (16..256 multi-res)
    -> electron/assets/icon.png  (512)
    -> electron/assets/icon.svg
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "electron", "assets")
os.makedirs(OUT, exist_ok=True)

BG = (10, 10, 10, 255)       # #0a0a0a, matches the app background
FG = (255, 255, 255, 255)

S = 1024                     # master canvas


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def render(size=S):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024.0

    # tile
    m = 36 * u
    rounded(d, [m, m, size - m, size - m], 224 * u, BG)

    cx = size / 2
    stem_w = 150 * u

    # arrow stem
    rounded(d, [cx - stem_w / 2, 250 * u, cx + stem_w / 2, 560 * u], stem_w / 2, FG)

    # arrow head (triangle pointing down)
    half = 235 * u
    d.polygon([(cx - half, 470 * u), (cx + half, 470 * u), (cx, 730 * u)], fill=FG)

    # baseline / tray
    bl_w = 470 * u
    rounded(d, [cx - bl_w / 2, 790 * u, cx + bl_w / 2, 858 * u], 34 * u, FG)

    return img


master = render(S)

# PNG
master.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon.png"))

# ICO (multi-resolution)
sizes = [16, 24, 32, 48, 64, 128, 256]
master.save(os.path.join(OUT, "icon.ico"),
            sizes=[(s, s) for s in sizes])

# SVG (hand-written to match)
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="36" y="36" width="952" height="952" rx="224" fill="#0a0a0a"/>
  <rect x="437" y="250" width="150" height="310" rx="75" fill="#fff"/>
  <path d="M277 470 H747 L512 730 Z" fill="#fff"/>
  <rect x="277" y="790" width="470" height="68" rx="34" fill="#fff"/>
</svg>
"""
with open(os.path.join(OUT, "icon.svg"), "w", encoding="utf-8") as f:
    f.write(svg)

# copy png into the frontend public dir for the favicon too
pub = os.path.join(ROOT, "frontend", "public")
if os.path.isdir(pub):
    master.resize((256, 256), Image.LANCZOS).save(os.path.join(pub, "icon.png"))
    master.save(os.path.join(pub, "icon.ico"), sizes=[(s, s) for s in [16, 32, 48]])

print("wrote:", ", ".join(sorted(os.listdir(OUT))))
