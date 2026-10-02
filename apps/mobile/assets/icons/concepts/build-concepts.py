"""Writes exploratory Vera app icon concepts as Icon Composer bundles.

    python3 build-concepts.py          # bundles in out/, renders in renders/
    swift contact-sheet.swift "$PWD"   # bubbles.png and aloe.png contact sheets

Concepts b01-b10 are speech bubbles; a01-a10 are top-down aloe vera
rosettes. None of these are wired into the app; see README.md.
"""

from pathlib import Path
import json
import math
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
ICTOOL = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
SIZE = 512
SRGB = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"

BLUE = ("#5cc0ff", "#0a74f5")
TEAL = ("#5ae6d6", "#0fa596")
DARK = ("#313131", "#141414")
ALOE = ("#a6e57f", "#2f9e5a")
SAGE = ("#c9efb4", "#7cc68a")
MINT = ("#f4fbef", "#d6efd2")
FOREST = ("#2c5a3c", "#0f2618")
WHITE = "#ffffff"
LEAF = "#3fae62"
LEAF_DARK = "#237a45"
LEAF_LIGHT = "#8bd77a"
GEL = "#e9fbe0"


# Geometry helpers ------------------------------------------------------------

def f(x):
    return f"{x:.1f}"


def poly(points):
    return "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in points) + " Z"


def path(d, fill=WHITE, extra=""):
    return f'<path fill="{fill}" d="{d}"{extra}/>'


def circle(cx, cy, r, fill=WHITE):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}"/>'


def ellipse(cx, cy, rx, ry, fill=WHITE):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"/>'


def arc_points(cx, cy, r, a0, a1, n=48):
    """Points on a circle from angle a0 to a1 (degrees, SVG orientation)."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def rotate(points, cx, cy, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in points]


def leaf_half_width(t, width, taper, peak=0):
    if peak:
        # Smooth almond profile: narrow base, widest near a third, pointed tip.
        def raw(u):
            return (u + .1) ** .6 * (1 - u) ** taper
        top = max(raw(i / 200) for i in range(201))
        return width / 2 * raw(t) / top
    rise = 1.0 if t > .18 else .62 + .38 * math.sin(math.pi / 2 * t / .18)
    return width / 2 * rise * (1 - t) ** taper


def leaf_frame(cx, cy, angle, r0, length, bend, t):
    """Point on the leaf midline at t (0 base, 1 tip) and the unit normal."""
    a = math.radians(angle)
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    along = r0 + length * t
    side = bend * length * t * t
    x, y = cx + ux * along + nx * side, cy + uy * along + ny * side
    # Normal of the bent midline.
    dx, dy = ux * length + nx * 2 * bend * length * t, uy * length + ny * 2 * bend * length * t
    d = math.hypot(dx, dy)
    return x, y, -dy / d, dx / d


def leaf(cx, cy, angle, length, width, r0=0, bend=0, taper=.85, teeth=0, n=48, half=None, peak=0):
    """A pointed aloe leaf radiating from (cx, cy) at `angle` degrees.

    `teeth` adds that many small serrations per edge; `half` is "left" or
    "right" for one side of the midline (the faceted look).
    """
    left, right, mid = [], [], []
    tooth_at = {round(n * (.18 + .7 * (k + .5) / teeth)) for k in range(teeth)} if teeth else set()
    for i in range(n + 1):
        t = i / n
        x, y, nx, ny = leaf_frame(cx, cy, angle, r0, length, bend, t)
        h = leaf_half_width(t, width, taper, peak)
        mid.append((x, y))
        left.append((x + nx * h, y + ny * h))
        right.append((x - nx * h, y - ny * h))
        if i in tooth_at:
            tx, ty, _, _ = leaf_frame(cx, cy, angle, r0, length, bend, min(1, t + .035))
            s = width * .07
            left.append((tx + nx * (h + s), ty + ny * (h + s)))
            right.append((tx - nx * (h + s), ty - ny * (h + s)))
    # Rounded base: a half circle behind the base.
    bx, by, nx, ny = leaf_frame(cx, cy, angle, r0, length, bend, 0)
    h0 = leaf_half_width(0, width, taper, peak)
    base = []
    for k in range(1, 12):
        a = math.pi * k / 12
        # From the right edge round the back to the left edge.
        ux, uy = ny, -nx  # Backwards along the leaf.
        base.append((bx - nx * h0 * math.cos(a) + ux * h0 * .6 * math.sin(a) * -1,
                     by - ny * h0 * math.cos(a) + uy * h0 * .6 * math.sin(a) * -1))
    if half == "left":
        return path(poly(mid + left[::-1]))
    if half == "right":
        return path(poly(mid + right[::-1]))
    return path(poly(left + right[::-1] + base))


def rosette(cx, cy, count, length, width, start=-90, **kw):
    return [leaf(cx, cy, start + 360 * i / count, length, width, **kw) for i in range(count)]


# Layer and document helpers --------------------------------------------------

def rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def color(h):
    return "extended-srgb:" + ",".join(f"{x:.5f}" for x in (*rgb(h), 1))


def gradient(pair):
    return {"linear-gradient": [color(pair[0]), color(pair[1])]}


def fill_value(v):
    return gradient(v) if isinstance(v, tuple) else {"solid": color(v)}


def layer(name, shapes, fill=None, dark=None, glass=True, opacity=1.0):
    """One SVG layer. `fill` overrides the SVG colors (a hex or a gradient pair)."""
    return {"name": name, "shapes": shapes, "fill": fill, "dark": dark, "glass": glass, "opacity": opacity}


def group(name, *layers, shadow=.5, translucency=.3):
    return {"name": name, "layers": list(layers), "shadow": shadow, "translucency": translucency}


def write_concept(c):
    bundle = ROOT / "out" / f"{c['id']}.icon"
    shutil.rmtree(bundle, ignore_errors=True)
    (bundle / "Assets").mkdir(parents=True)
    groups = []
    for g in c["groups"]:
        layers = []
        for lay in g["layers"]:
            image = f"{c['id']}-{lay['name'].lower().replace(' ', '-')}.svg"
            (bundle / "Assets" / image).write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
                + "".join(lay["shapes"]) + "</svg>\n")
            entry = {"image-name": image, "name": lay["name"], "glass": lay["glass"], "opacity": lay["opacity"]}
            if lay["fill"]:
                entry["fill"] = fill_value(lay["fill"])
            if lay["dark"]:
                entry["fill-specializations"] = [{"appearance": "dark", "value": fill_value(lay["dark"])}]
            layers.append(entry)
        groups.append({
            "name": g["name"], "layers": layers,
            "shadow": {"kind": "layer-color", "opacity": g["shadow"]},
            "shadow-specializations": [{"appearance": "dark", "value": {"kind": "neutral", "opacity": .5}}],
            "specular": True,
            "translucency": {"enabled": True, "value": g["translucency"]},
        })
    doc = {
        "fill": gradient(c["bg"]),
        "fill-specializations": [{"appearance": "dark", "value": gradient(c.get("dark_bg", DARK))}],
        # Icon Composer lists groups front to back.
        "groups": groups[::-1],
        "supported-platforms": {"squares": "shared"},
    }
    (bundle / "icon.json").write_text(json.dumps(doc, indent=2) + "\n")
    return bundle


def render(bundle, rendition, output):
    subprocess.run([
        ICTOOL, str(bundle), "--export-image", "--output-file", str(output),
        "--platform", "iOS", "--rendition", rendition,
        "--width", str(SIZE), "--height", str(SIZE), "--scale", "1",
    ], check=True)
    # ictool writes 16-bit Display P3; 8-bit sRGB is a fraction of the size.
    subprocess.run(["sips", "-m", SRGB, str(output), "--out", str(output)], check=True, capture_output=True)


# Speech bubble concepts ------------------------------------------------------

def round_bubble(cx=512, cy=492, r=318):
    """A circle with a short tail curling out at the lower left."""
    pts = arc_points(cx, cy, r, 150, 470)  # Clockwise from lower left round to 110 degrees.
    tail = [(cx - r * .62, cy + r * .93), (cx - r * .86, cy + r * 1.08), (cx - r * 1.0, cy + r * 1.1),
            (cx - r * .97, cy + r * 1.02), (cx - r * .9, cy + r * .86), (cx - r * .87, cy + r * .5)]
    return poly(pts + tail)


def corner_bubble(cx, cy, r, corner=135, radius=.18):
    """A circle with one corner squared off (the corner at `corner` degrees)."""
    a0 = corner + 45
    pts = arc_points(cx, cy, r, a0, a0 + 270, 72)
    # Square corner with a small rounding.
    c = math.radians(corner)
    k = r * math.sqrt(2)
    tip = (cx + k * math.cos(c), cy + k * math.sin(c))
    p_end, p_start = pts[-1], pts[0]
    def toward(p, q, s):
        return (p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s)
    rr = radius
    corner_pts = [toward(tip, p_end, rr)]
    for i in range(1, 8):
        s = i / 8
        a = toward(tip, p_end, rr * (1 - s))
        b = toward(tip, p_start, rr * s)
        # Quadratic through the tip.
        q1 = toward(toward(tip, p_end, rr), tip, s)
        q2 = toward(tip, toward(tip, p_start, rr), s)
        corner_pts.append(toward(q1, q2, s))
    corner_pts.append(toward(tip, p_start, rr))
    return poly(pts + corner_pts)


def drop_bubble(cx, cy, r, corner=135):
    """A teardrop: a circle drawn to a point at `corner` degrees."""
    a0 = corner + 38
    pts = arc_points(cx, cy, r, a0, a0 + 284, 72)
    c = math.radians(corner)
    k = r * 1.55
    return poly(pts + [(cx + k * math.cos(c), cy + k * math.sin(c))])


def pill(x, y, w, h):
    r = h / 2
    pts = arc_points(x + w - r, y + r, r, -90, 90, 24) + arc_points(x + r, y + r, r, 90, 270, 24)
    return poly(pts)


def rounded_rect_bubble(x, y, w, h, r, tail_w=110, tail_h=96):
    cx = x + w / 2
    pts = (arc_points(x + w - r, y + r, r, -90, 0, 16) + arc_points(x + w - r, y + h - r, r, 0, 90, 16)
           + [(cx + tail_w / 2, y + h), (cx + 8, y + h + tail_h - 8), (cx, y + h + tail_h), (cx - 8, y + h + tail_h - 8),
              (cx - tail_w / 2, y + h)]
           + arc_points(x + r, y + h - r, r, 90, 180, 16) + arc_points(x + r, y + r, r, 180, 270, 16))
    return poly(pts)


def ring_bubble(cx=512, cy=496, r=318, thickness=96):
    outer = arc_points(cx, cy, r, 152, 478, 96)
    inner = arc_points(cx, cy, r - thickness, 0, 360, 96)[::-1]
    tip = (cx + 1.32 * r * math.cos(math.radians(138)), cy + 1.32 * r * math.sin(math.radians(138)))
    return poly(outer + [tip]) + " " + poly(inner)


def v_mark(cx, cy, w, h, stroke):
    """A rounded V monogram as a filled outline."""
    left = (cx - w / 2, cy - h / 2)
    right = (cx + w / 2, cy - h / 2)
    bottom = (cx, cy + h / 2)
    def thick_line(p, q):
        dx, dy = q[0] - p[0], q[1] - p[1]
        d = math.hypot(dx, dy)
        nx, ny = -dy / d * stroke / 2, dx / d * stroke / 2
        a = math.degrees(math.atan2(dy, dx))
        return poly([(p[0] + nx, p[1] + ny), (q[0] + nx, q[1] + ny)] + arc_points(q[0], q[1], stroke / 2, a + 90, a - 90, 12)
                    + [(p[0] - nx, p[1] - ny)] + arc_points(p[0], p[1], stroke / 2, a - 90, a - 270, 12))
    return [path(thick_line(left, bottom)), path(thick_line(bottom, right))]


BUBBLES = [
    {"id": "b01", "name": "Round", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(round_bubble())], dark=BLUE)),
    ]},
    {"id": "b02", "name": "Corner", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(corner_bubble(512, 512, 300))], dark=BLUE)),
    ]},
    {"id": "b03", "name": "Duo", "bg": BLUE, "groups": [
        group("Back", layer("Back", [path(corner_bubble(424, 420, 236))], fill="#b9e3ff", dark="#0a74f5", opacity=.85)),
        group("Front", layer("Front", [path(corner_bubble(616, 618, 196, corner=45))], dark=BLUE)),
    ]},
    {"id": "b04", "name": "Typing", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(corner_bubble(512, 512, 300))], dark="#2a2a2c")),
        group("Dots", layer("Dots", [circle(512 + dx, 512, 44) for dx in (-128, 0, 128)], fill=BLUE)),
    ]},
    {"id": "b05", "name": "Thread", "bg": BLUE, "groups": [
        group("Them", layer("Them", [path(pill(192, 236, 420, 150)), path(pill(192, 638, 330, 150))], dark="#3a3a3c")),
        group("You", layer("You", [path(pill(412, 437, 420, 150))], fill="#bfe6ff", dark=BLUE)),
    ]},
    {"id": "b06", "name": "Ring", "bg": BLUE, "groups": [
        group("Ring", layer("Ring", [path(ring_bubble(), extra=' fill-rule="evenodd"')], dark=BLUE)),
        group("Dot", layer("Dot", [circle(512, 496, 74)], dark=BLUE)),
    ]},
    {"id": "b07", "name": "Card", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(rounded_rect_bubble(196, 214, 632, 500, 150))], dark=BLUE)),
    ]},
    {"id": "b08", "name": "Monogram", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(corner_bubble(512, 512, 300))], dark="#2a2a2c")),
        group("V", layer("V", v_mark(512, 520, 250, 210, 74), fill=BLUE)),
    ]},
    {"id": "b09", "name": "Drop", "bg": TEAL, "groups": [
        group("Drop", layer("Drop", [path(drop_bubble(548, 478, 280))], dark=TEAL)),
    ]},
    {"id": "b10", "name": "Sprout", "bg": BLUE, "groups": [
        group("Bubble", layer("Bubble", [path(corner_bubble(512, 512, 300))], dark="#2a2a2c")),
        group("Sprout", layer("Sides", [
            leaf(500, 700, -114, 280, 96, bend=-.22, taper=.95, peak=1),
            leaf(524, 700, -66, 280, 96, bend=.22, taper=.95, peak=1),
        ], fill=(LEAF, LEAF_DARK)), layer("Middle", [
            leaf(512, 700, -90, 360, 110, taper=.95, peak=1),
        ], fill=(LEAF_LIGHT, LEAF)), translucency=.1),
    ]},
]


# Aloe concepts ---------------------------------------------------------------
# Top down, an aloe is rings of thick, broad-based leaves; each ring is its
# own glass group so the rings separate, younger (inner) leaves on top.

ALOE_LEAF = {"taper": .95, "peak": 1, "bend": .05}


def ring(count, length, width, start=-90, parity=None, cx=512, cy=512, **kw):
    kw = {**ALOE_LEAF, **kw}
    leaves = rosette(cx, cy, count, length, width, start=start, **kw)
    return leaves if parity is None else leaves[parity::2]


def shade(fill, amount):
    """Darkens a hex color or gradient pair slightly, for alternate leaves."""
    if isinstance(fill, tuple):
        return tuple(shade(c, amount) for c in fill)
    r, g, b = (int(fill[i:i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{max(0, round(v * (1 - amount))):02x}" for v in (r, g, b))


def rings(spec, fills, dark=None, **kw):
    """Groups from (count, length, width, start) rings, outermost first.

    Alternate leaves sit in two layers with slightly different shades so
    neighbors read as separate leaves instead of one merged star.
    """
    out = []
    for n, (c, l, w, s) in enumerate(spec):
        d = dark[n] if dark else None
        out.append(group(
            f"Ring {n + 1}",
            layer(f"Ring {n + 1} a", ring(c, l, w, s, parity=0, **kw), fill=fills[n], dark=d),
            layer(f"Ring {n + 1} b", ring(c, l, w, s, parity=1, **kw), fill=shade(fills[n], .07),
                  dark=shade(d, .1) if d else None), translucency=.1))
    return out


def spiral(cx, cy, count, bands):
    """Aloe polyphylla: leaves at the golden angle, grouped outermost first."""
    out = [[] for _ in range(bands)]
    for i in reversed(range(count)):
        s = (i + 1) / count
        length = 90 + 300 * s ** .9
        band = min(bands - 1, int(s * bands))
        out[bands - 1 - band].append(leaf(cx, cy, -90 + i * 137.508, length, length * .42, r0=20 * s,
                                          bend=.16, taper=.95, peak=1))
    return out


def spots(count, length, start=-90, cx=512, cy=512):
    out = []
    for i in range(count):
        a = math.radians(start + 360 * i / count)
        for t, off, r in ((.3, -.16, 12), (.42, .14, 11), (.55, -.1, 9), (.66, .08, 7), (.76, -.03, 5)):
            along = length * t
            side = off * length * (1 - t)
            out.append(circle(cx + math.cos(a) * along - math.sin(a) * side,
                              cy + math.sin(a) * along + math.cos(a) * side, r))
    return out


def side_view():
    """A front view: leaves fanning up and out from the soil line."""
    base = (512, 760)
    leaves = []
    for angle, length, width, bend in ((-162, 330, 96, .22), (-18, 330, 96, -.22), (-138, 420, 100, .16),
                                       (-42, 420, 100, -.16), (-114, 470, 104, .08), (-66, 470, 104, -.08),
                                       (-90, 500, 108, 0)):
        leaves.append((abs(angle + 90), leaf(*base, angle, length, width, taper=.95, peak=1, bend=bend)))
    # Outermost (lowest) leaves at the back, alternate leaves in separate layers.
    ordered = [s for _, s in sorted(leaves, key=lambda x: -x[0])]
    return ordered[0::2], ordered[1::2]


SPIRAL = spiral(512, 512, 30, 4)
SIDE = side_view()
WHITE_RINGS = ("#d9f5c9", "#f2fcec", WHITE)
GREEN_RINGS = ((LEAF, LEAF_DARK), ("#5fc46e", "#2f9450"), (LEAF_LIGHT, "#56b964"))
THREE = ((6, 400, 140, -60), (6, 310, 124, -90), (3, 190, 100, -90))

ALOE_CONCEPTS = [
    {"id": "a01", "name": "Rosette", "bg": ALOE, "groups": rings(THREE, WHITE_RINGS, dark=GREEN_RINGS)},
    {"id": "a02", "name": "Layered", "bg": MINT, "dark_bg": FOREST, "groups": rings(THREE, GREEN_RINGS)},
    {"id": "a03", "name": "Spiral", "bg": FOREST, "groups": [
        group(f"Band {n + 1}", layer(f"Band {n + 1}", shapes, fill=fill))
        for n, (shapes, fill) in enumerate(zip(SPIRAL, ((LEAF, LEAF_DARK), ("#5fc46e", "#2f9450"),
                                                         (LEAF_LIGHT, "#56b964"), ("#d8f7c4", LEAF_LIGHT))))
    ]},
    {"id": "a04", "name": "Bloom", "bg": ALOE, "groups": rings(
        ((4, 400, 190, -45), (4, 290, 160, -90)), WHITE_RINGS[1:], dark=GREEN_RINGS[1:])},
    {"id": "a05", "name": "Toothed", "bg": MINT, "dark_bg": FOREST, "groups": rings(
        ((6, 400, 150, -60), (6, 290, 130, -90)), GREEN_RINGS[:2], teeth=7)},
    {"id": "a06", "name": "Faceted", "bg": MINT, "dark_bg": FOREST, "groups": [
        group("Outer", layer("Outer dark", [leaf(512, 512, -60 + 60 * i, 400, 170, half="right", taper=.95, peak=1)
                                            for i in range(6)], fill=LEAF_DARK, glass=False),
              layer("Outer light", [leaf(512, 512, -60 + 60 * i, 400, 170, half="left", taper=.95, peak=1)
                                    for i in range(6)], fill=LEAF, glass=False)),
        group("Inner", layer("Inner dark", [leaf(512, 512, -90 + 60 * i, 280, 140, half="right", taper=.95, peak=1)
                                            for i in range(6)], fill="#4fb565", glass=False),
              layer("Inner light", [leaf(512, 512, -90 + 60 * i, 280, 140, half="left", taper=.95, peak=1)
                                    for i in range(6)], fill=LEAF_LIGHT, glass=False)),
    ]},
    {"id": "a07", "name": "Speckled", "bg": SAGE, "dark_bg": FOREST, "groups": [
        *rings(((6, 400, 160, -60), (6, 290, 140, -90)), GREEN_RINGS[:2]),
        group("Spots", layer("Spots", spots(6, 290), fill="#e9fbe0", glass=False, opacity=.85)),
    ]},
    {"id": "a08", "name": "Dew", "bg": ALOE, "groups": [
        *rings(((6, 400, 140, -60), (6, 310, 124, -90)), WHITE_RINGS[:2], dark=GREEN_RINGS[:2]),
        group("Drop", layer("Drop", [circle(512, 512, 92)], fill=("#e6ffd9", "#8ad97a"), dark=("#e6ffd9", "#8ad97a"))),
    ]},
    {"id": "a09", "name": "Side view", "bg": ALOE, "groups": [
        group("Leaves", layer("Back", SIDE[0], fill="#e4f7da", dark=GREEN_RINGS[1]),
              layer("Front", SIDE[1], dark=GREEN_RINGS[2]), translucency=.1),
    ]},
    {"id": "a10", "name": "Pinwheel", "bg": ALOE, "groups": rings(
        ((6, 400, 130, -90), (6, 290, 115, -60)), WHITE_RINGS[:2], dark=GREEN_RINGS[:2], bend=.3)},
]


def main():
    renders = ROOT / "renders"
    renders.mkdir(exist_ok=True)
    concepts = BUBBLES + ALOE_CONCEPTS
    for c in concepts:
        bundle = write_concept(c)
        for label, rendition in (("light", "Default"), ("dark", "Dark")):
            render(bundle, rendition, renders / f"{c['id']}-{label}.png")
        print(c["id"], c["name"], flush=True)
    (ROOT / "concepts.json").write_text(json.dumps(
        [{"id": c["id"], "name": c["name"]} for c in concepts], indent=2) + "\n")


if __name__ == "__main__":
    main()
