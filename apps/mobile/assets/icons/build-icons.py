"""Writes the Vera app icons, Icon Composer documents, and their flat renders.

    python3 build-icons.py              # vera.icon and vera-dev.icon, then render-flat.swift
    python3 build-icons.py --check DIR  # also every iOS appearance at 1024px in DIR/<icon>

The icon is a top-down aloe vera (Vera is named after the plant): two rings
of six curved leaves, like a pinwheel. Light is pale glass leaves on a green
gradient; dark is green leaves on near-black; tinted and clear use gray
leaves, which iOS tints. Vera Dev (the dev variant, app.config.ts) is the
same icon in amber, so the two apps differ at a glance.
"""

from pathlib import Path
import json
import math
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
ICTOOL = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
RENDITIONS = ("Default", "Dark", "ClearLight", "ClearDark", "TintedLight", "TintedDark")
# Aloe green, for checking the tinted renditions (ictool's hue scale is not HSB).
TINT_HUE = .47

DARK_BACKGROUND = ("#313131", "#141414")

# (count, length, width, first leaf angle) per ring, outermost first. The
# inner ring sits between the outer ring's leaves.
RINGS = ((6, 372, 120, -90), (6, 268, 106, -60))
# Leaf fills per ring as (alternate leaf a, alternate leaf b). Neighbors
# differ slightly so overlapping leaves read as separate leaves.
TINTED = (("#b0b0b0", "#9c9c9c"), ("#ffffff", "#e6e6e6"))
# Per icon: the light background, and the light and dark leaf fills.
ICONS = {
    "vera": {
        "background": ("#a6e57f", "#2f9e5a"),
        "light": (("#e4f7d8", "#cfeac0"), ("#ffffff", "#eef7e8")),
        "dark": ((("#3fae62", "#237a45"), ("#389c58", "#1f6d3e")),
                 (("#8bd77a", "#4fb565"), ("#7cc56c", "#46a35b"))),
    },
    "vera-dev": {
        "background": ("#ffcf70", "#ec8a1e"),
        "light": (("#fdeed6", "#f7dfba"), ("#ffffff", "#fff4e4")),
        "dark": ((("#e9962f", "#b0611a"), ("#d98928", "#a05716")),
                 (("#ffcb6b", "#f0a03c"), ("#f2bd5f", "#e39234"))),
    },
}
BEND = .3


def f(x):
    return f"{x:.1f}"


def poly(points):
    return "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in points) + " Z"


def half_width(t, width):
    """An almond profile: narrow base, widest near a third, pointed tip."""
    def raw(u):
        return (u + .1) ** .6 * (1 - u) ** .95
    return width / 2 * raw(t) / max(raw(i / 200) for i in range(201))


def leaf(angle, length, width, cx=512, cy=512, n=64):
    """A leaf from the center at `angle` degrees, curving clockwise."""
    a = math.radians(angle)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        x = cx + ux * length * t + nx * BEND * length * t * t
        y = cy + uy * length * t + ny * BEND * length * t * t
        dx, dy = ux + nx * 2 * BEND * t, uy + ny * 2 * BEND * t
        d = math.hypot(dx, dy)
        px, py = -dy / d, dx / d
        h = half_width(t, width)
        left.append((x + px * h, y + py * h))
        right.append((x - px * h, y - py * h))
    # Round the base off behind the center.
    h0 = half_width(0, width)
    base = [(cx - nx * h0 * math.cos(math.pi * k / 12) - ux * .6 * h0 * math.sin(math.pi * k / 12),
             cy - ny * h0 * math.cos(math.pi * k / 12) - uy * .6 * h0 * math.sin(math.pi * k / 12))
            for k in range(1, 12)]
    return poly(left + right[::-1] + base)


def svg(paths):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        + "".join(f'<path fill="#ffffff" d="{d}"/>' for d in paths) + "</svg>\n"
    )


def rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def color(h):
    return "extended-srgb:" + ",".join(f"{x:.5f}" for x in (*rgb(h), 1))


def fill(v):
    return {"linear-gradient": [color(v[0]), color(v[1])]} if isinstance(v, tuple) else {"solid": color(v)}


def layer_names(ring, parity):
    return f"Ring {ring + 1}{'ab'[parity]}", f"ring-{ring + 1}{'ab'[parity]}.svg"


def document(icon):
    groups = []
    for ring in range(len(RINGS)):
        layers = []
        for parity in (0, 1):
            name, image = layer_names(ring, parity)
            layers.append({
                "image-name": image,
                "name": name,
                "glass": True,
                # The light fill must be the unqualified specialization: with
                # a plain "fill", ictool and iOS ignore the dark one.
                "fill-specializations": [
                    {"value": fill(icon["light"][ring][parity])},
                    {"appearance": "dark", "value": fill(icon["dark"][ring][parity])},
                    {"appearance": "tinted", "value": fill(TINTED[ring][parity])},
                ],
            })
        groups.append({
            "name": f"Ring {ring + 1}",
            "layers": layers,
            "shadow": {"kind": "layer-color", "opacity": .5},
            "shadow-specializations": [
                {"appearance": "dark", "value": {"kind": "neutral", "opacity": .5}},
                {"appearance": "tinted", "value": {"kind": "neutral", "opacity": .5}},
            ],
            "specular": True,
            "translucency": {"enabled": True, "value": .1},
        })
    return {
        "fill": fill(icon["background"]),
        "fill-specializations": [
            {"appearance": "dark", "value": fill(DARK_BACKGROUND)},
            {"appearance": "tinted", "value": fill(DARK_BACKGROUND)},
        ],
        # Icon Composer lists groups front to back: the inner ring on top.
        "groups": groups[::-1],
        "supported-platforms": {"squares": "shared"},
    }


def write_bundle(name):
    bundle = ROOT / f"{name}.icon"
    shutil.rmtree(bundle, ignore_errors=True)
    (bundle / "Assets").mkdir(parents=True)
    for ring, (count, length, width, start) in enumerate(RINGS):
        leaves = [leaf(start + 360 * i / count, length, width) for i in range(count)]
        for parity in (0, 1):
            (bundle / "Assets" / layer_names(ring, parity)[1]).write_text(svg(leaves[parity::2]))
    (bundle / "icon.json").write_text(json.dumps(document(ICONS[name]), indent=2) + "\n")
    return bundle


def render(bundle, rendition, output, size):
    args = [
        ICTOOL, str(bundle), "--export-image", "--output-file", str(output),
        "--platform", "iOS", "--rendition", rendition,
        "--width", str(size), "--height", str(size), "--scale", "1",
    ]
    if rendition.startswith("Tinted"):
        args += ["--tint-color", str(TINT_HUE), "--tint-strength", "0.8"]
    subprocess.run(args, check=True, capture_output=True)


def main():
    for name in ICONS:
        bundle = write_bundle(name)
        subprocess.run(["swift", str(ROOT / "render-flat.swift"), str(ROOT), name], check=True)
        if "--check" in sys.argv:
            check = Path(sys.argv[sys.argv.index("--check") + 1]) / name
            check.mkdir(parents=True, exist_ok=True)
            for rendition in RENDITIONS:
                render(bundle, rendition, check / f"{rendition}.png", 1024)
                print(name, rendition, flush=True)


if __name__ == "__main__":
    main()
