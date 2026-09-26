"""
Renders every launcher/splash/notification asset from the one brand mark used in-app
(src/components/brand/Logo.tsx): a bold rising arrow over three soft volume bars on a
mint-to-emerald gradient tile.

    python scripts/generate-brand-assets.py

Requires Pillow. Shapes are drawn at 4x and downsampled for anti-aliasing. Edit the
geometry here and in Logo.tsx together, then rebuild native projects (`npm run
prebuild`) — launcher icons and the splash are baked in at build time.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "images"
SUPERSAMPLE = 4

# Logo.tsx MARK_GRADIENT (top-left → bottom-right).
GRADIENT_FROM = (0x1F, 0xD1, 0xA0)
GRADIENT_TO = (0x00, 0x80, 0x5E)
WHITE = (255, 255, 255, 255)
BAR_WHITE = (255, 255, 255, round(255 * 0.3))
CLEAR = (0, 0, 0, 0)

# Geometry in the 30-unit tile, identical to Logo.tsx.
TILE_RADIUS = 9.0
TREND = [(6.8, 19.2), (12.0, 14.0), (15.6, 17.2), (23.2, 9.6)]
ARROW = [(18.6, 9.6), (23.2, 9.6), (23.2, 14.2)]
BARS = [(7.6, 21.0, 2.8, 2.0), (13.2, 19.5, 2.8, 3.5), (18.8, 16.5, 2.8, 6.5)]  # x, y, w, h
BAR_RADIUS = 1.0
STROKE = 2.6


def gradient(size: int) -> Image.Image:
    """Diagonal two-stop gradient, computed small and upscaled (smooth, and fast in pure Python)."""
    n = 256
    small = Image.new("RGB", (n, n))
    px = small.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(GRADIENT_FROM, GRADIENT_TO))
    return small.resize((size, size), Image.BICUBIC).convert("RGBA")


def polyline(draw: ImageDraw.ImageDraw, points, width: float, color) -> None:
    """Round-capped, round-joined polyline."""
    draw.line(points, fill=color, width=round(width), joint="curve")
    r = width / 2
    for x, y in points:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def draw_glyph(canvas: Image.Image, scale: float, ox: float, oy: float, bars: bool = True,
               line_color=WHITE, stroke: float = STROKE) -> Image.Image:
    """Bars + arrow, mapping tile units (x, y) → (ox + x·scale, oy + y·scale) in canvas pixels."""
    if bars:
        layer = Image.new("RGBA", canvas.size, CLEAR)
        d = ImageDraw.Draw(layer)
        for x, y, w, h in BARS:
            d.rounded_rectangle(
                (ox + x * scale, oy + y * scale, ox + (x + w) * scale, oy + (y + h) * scale),
                radius=BAR_RADIUS * scale,
                fill=BAR_WHITE,
            )
        canvas = Image.alpha_composite(canvas, layer)
    d = ImageDraw.Draw(canvas)
    for points in (TREND, ARROW):
        polyline(d, [(ox + x * scale, oy + y * scale) for x, y in points], stroke * scale, line_color)
    return canvas


def tile(size: int, rounded: bool) -> Image.Image:
    """The full mark: gradient tile + glyph. `rounded=False` is full-bleed (iOS masks it)."""
    s = size * SUPERSAMPLE
    scale = s / 30
    canvas = gradient(s)
    if rounded:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=TILE_RADIUS * scale, fill=255)
        clipped = Image.new("RGBA", (s, s), CLEAR)
        clipped.paste(canvas, (0, 0), mask)
        canvas = clipped
    canvas = draw_glyph(canvas, scale, 0, 0)
    return canvas.resize((size, size), Image.LANCZOS)


def glyph_only(size: int, tile_fraction: float, bars: bool, line_color=WHITE, stroke: float = STROKE) -> Image.Image:
    """The glyph alone on transparency, as if the 30-unit tile spanned `tile_fraction` of the canvas."""
    s = size * SUPERSAMPLE
    tile_px = s * tile_fraction
    scale = tile_px / 30
    offset = (s - tile_px) / 2
    canvas = draw_glyph(Image.new("RGBA", (s, s), CLEAR), scale, offset, offset, bars, line_color, stroke)
    return canvas.resize((size, size), Image.LANCZOS)


def save(image: Image.Image, name: str) -> None:
    path = OUT / name
    image.save(path, optimize=True)
    print(f"  {name:36} {image.width}x{image.height}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Writing brand assets to {OUT}")

    # iOS/App Store: full-bleed and opaque — iOS applies its own corner mask.
    save(tile(1024, rounded=False).convert("RGB"), "icon.png")

    # Android adaptive: launchers show a ~61% circle of this canvas. Mapping the tile onto
    # 80% keeps the glyph's diagonal (~57%) inside that circle while matching iOS's weight.
    save(glyph_only(1024, 0.8, bars=True), "adaptive-icon.png")
    save(gradient(1024).convert("RGB"), "adaptive-icon-background.png")
    # Themed (Material You) icon: one flat colour, the OS tints it — bars would read as noise.
    save(glyph_only(1024, 0.8, bars=False), "adaptive-icon-monochrome.png")

    # Splash: the rounded tile itself, on transparency so one file works on the light and
    # dark splash backgrounds. Logo.tsx draws the same tile for the in-app hand-off.
    save(tile(512, rounded=True), "splash.png")

    # Web favicon.
    save(tile(48, rounded=True), "favicon.png")

    # Android status-bar icon: white silhouette (the OS tints it), heavier stroke so the
    # arrow survives at 24dp, no bars.
    save(glyph_only(96, 1.35, bars=False, stroke=3.2), "notification-icon.png")


if __name__ == "__main__":
    main()
