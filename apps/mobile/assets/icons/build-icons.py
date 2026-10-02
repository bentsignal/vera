"""Writes the Vera Icon Composer bundles and their previews.

    python3 build-icons.py                  # bundles, palette.json, previews/ (app Settings)
    python3 build-icons.py --documents-only # bundles and palette.json only
    python3 build-icons.py --check DIR      # also 1024px Default/Dark/TintedDark renders in DIR

The design follows the Messages icon: one plain white speech bubble on a
vertical gradient in light mode, and the bubble filled with that gradient on
a near-black background in dark mode.
"""

from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
ICTOOL = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"

# Light background gradient (top, bottom); the dark bubble uses the same
# colors. Green matches the Messages icon (#53F06D to #1FD13C).
THEMES = {
    "indigo": ("#8c87ff", "#4a40e6"),
    "blue": ("#5cc0ff", "#0a74f5"),
    "teal": ("#5ae6d6", "#0fa596"),
    "green": ("#53f06d", "#1fd13c"),
    "orange": ("#ffb340", "#fa6e0a"),
    "pink": ("#ff7fb4", "#e62e7a"),
    "purple": ("#bb88ff", "#7a3ced"),
    "graphite": ("#9a9aa0", "#4a4a4e"),
}
# Graphite's dark bubble is silver; its light gradient would vanish on black.
DARK_BUBBLE = {"graphite": ("#e2e2e7", "#a4a4aa")}
# Near-black dark background, as in the Messages icon.
DARK_BACKGROUND = ("#313131", "#141414")
# Tint hue for checking the tinted appearance (ictool's hue scale is not HSB).
TINT_HUE = {"indigo": .7, "blue": .63, "teal": .55, "green": .5, "orange": .07, "pink": .93, "purple": .78, "graphite": .6}

# A wide rounded oval with a small tail at the lower left, in a 1024 canvas.
PATH = (
    "M 142 496 C 142 323 301 192 512 192 C 723 192 882 323 882 496 "
    "C 882 669 723 800 512 800 C 445 800 379 785 322 757 "
    "C 290 782 238 804 190 806 C 178 806 174 796 182 789 "
    "C 216 758 222 708 193 650 C 160 603 142 550 142 496 Z"
)
PREVIEW_SIZE = 180
SRGB = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"


def rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def color(h):
    return "extended-srgb:" + ",".join(f"{x:.5f}" for x in (*rgb(h), 1))


def gradient(pair):
    return {"linear-gradient": [color(pair[0]), color(pair[1])]}


def svg():
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        f'viewBox="0 0 1024 1024"><path fill="#ffffff" d="{PATH}"/></svg>\n'
    )


def document(theme):
    light = THEMES[theme]
    bubble = DARK_BUBBLE.get(theme, light)
    return {
        "fill": gradient(light),
        "fill-specializations": [
            {"appearance": "dark", "value": gradient(DARK_BACKGROUND)},
            {"appearance": "tinted", "value": gradient(DARK_BACKGROUND)},
        ],
        "groups": [{
            "name": "Bubble",
            "layers": [{
                "image-name": "bubble.svg",
                "name": "Bubble",
                "glass": True,
                "opacity": .95,
                "fill-specializations": [
                    {"appearance": "dark", "value": gradient(bubble)},
                    {"appearance": "tinted", "value": {"solid": color("#ffffff")}},
                ],
            }],
            "shadow": {"kind": "layer-color", "opacity": .5},
            "shadow-specializations": [
                {"appearance": "dark", "value": {"kind": "neutral", "opacity": .5}},
                {"appearance": "tinted", "value": {"kind": "neutral", "opacity": .5}},
            ],
            "specular": True,
            "translucency": {"enabled": True, "value": .3},
        }],
        "supported-platforms": {"squares": "shared"},
    }


def write_bundle(theme):
    bundle = ROOT / f"vera-{theme}.icon"
    shutil.rmtree(bundle, ignore_errors=True)
    (bundle / "Assets").mkdir(parents=True)
    (bundle / "Assets" / "bubble.svg").write_text(svg())
    (bundle / "icon.json").write_text(json.dumps(document(theme), indent=2) + "\n")
    return bundle


def render(bundle, theme, rendition, output, size):
    args = [
        ICTOOL, str(bundle), "--export-image", "--output-file", str(output),
        "--platform", "iOS", "--rendition", rendition,
        "--width", str(size), "--height", str(size), "--scale", "1",
    ]
    if rendition == "TintedDark":
        args += ["--tint-color", str(TINT_HUE[theme]), "--tint-strength", "0" if theme == "graphite" else "0.8"]
    subprocess.run(args, check=True)


def main():
    palette = {}
    bundles = {}
    for theme, (top, bottom) in THEMES.items():
        bundles[theme] = write_bundle(theme)
        bubble = DARK_BUBBLE.get(theme, (top, bottom))
        palette[theme] = {
            "light_top": top, "light_bottom": bottom,
            "dark_top": DARK_BACKGROUND[0], "dark_bottom": DARK_BACKGROUND[1],
            "dark_bubble_top": bubble[0], "dark_bubble_bottom": bubble[1],
        }
    (ROOT / "palette.json").write_text(json.dumps(palette, indent=2) + "\n")
    if "--documents-only" in sys.argv:
        return
    previews = ROOT / "previews"
    previews.mkdir(exist_ok=True)
    for theme, bundle in bundles.items():
        for label, rendition in (("light", "Default"), ("dark", "Dark")):
            output = previews / f"{theme}-{label}.png"
            render(bundle, theme, rendition, output, PREVIEW_SIZE)
            # ictool writes 16-bit Display P3; 8-bit sRGB is a third the size.
            subprocess.run(["sips", "-m", SRGB, str(output), "--out", str(output)], check=True, capture_output=True)
    if "--check" in sys.argv:
        check = Path(sys.argv[sys.argv.index("--check") + 1])
        check.mkdir(parents=True, exist_ok=True)
        for theme, bundle in bundles.items():
            for rendition in ("Default", "Dark", "TintedDark"):
                print(theme, rendition, flush=True)
                render(bundle, theme, rendition, check / f"{theme}-{rendition}.png", 1024)


if __name__ == "__main__":
    main()
