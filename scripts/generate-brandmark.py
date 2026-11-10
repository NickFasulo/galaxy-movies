#!/usr/bin/env python3
# Renders the "G" brandmark badge: the SpaceRangerLaserItalic glyph on the
# favicon's deep-navy rounded square. One source so the site favicon and the
# browser-extension icons can't drift. Supersampled 4x, then downscaled.
#
#   python3 scripts/generate-brandmark.py                    # public/favicon.ico
#   python3 scripts/generate-brandmark.py --extension-dir DIR  # + icons/{16,32,48,128}.png
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
FONT = REPO / 'public' / 'fonts' / 'SpaceRangerLaserItalic-J7an.otf'

BG = (0, 30, 46, 255)          # favicon background navy
FG = (255, 255, 255, 255)      # glyph white
RING = (255, 255, 255, 26)     # faint ring so the badge reads on dark toolbars
SS = 4                         # supersample factor
RADIUS = 0.16                  # corner radius as a fraction of canvas


def render(size: int) -> Image.Image:
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    box = (0, 0, s - 1, s - 1)  # badge fills the canvas edge-to-edge
    radius = int(s * RADIUS)
    d.rounded_rectangle(box, radius=radius, fill=BG)
    d.rounded_rectangle(box, radius=radius, outline=RING, width=max(1, s // 64))

    # The G runs large — up to ~84% of the canvas — and the final mask clips
    # anything that reaches past the badge shape.
    target = s * 0.84
    font_size = s
    for _ in range(40):
        font = ImageFont.truetype(str(FONT), font_size)
        l, t, r, b = font.getbbox('G')
        w, h = r - l, b - t
        if h <= 0 or w <= 0:
            break
        if abs(max(w, h) - target) < 1:
            break
        font_size = max(8, int(font_size * (target / max(w, h))))
    # Bounding-box center reads right-of-center on an italic face — nudge left.
    d.text((s / 2 - (l + w / 2) - s * 0.02, s / 2 - (t + h / 2)), 'G', font=font, fill=FG)

    # Clip to the badge so glyph strokes can't escape the icon shape.
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    alpha = Image.composite(img.split()[3], Image.new('L', (s, s), 0), mask)
    img.putalpha(alpha)

    return img.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--extension-dir', type=Path, help='also write icons/{16,32,48,128}.png here')
    args = ap.parse_args()

    favicon = REPO / 'public' / 'favicon.ico'
    render(48).save(favicon, format='ICO', append_images=[render(16), render(32)])
    print(favicon)

    if args.extension_dir:
        out = Path(args.extension_dir) / 'icons'
        for size in (16, 32, 48, 128):
            p = out / f'{size}.png'
            render(size).save(p)
            print(p)


if __name__ == '__main__':
    main()
