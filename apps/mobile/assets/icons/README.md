# App icon

One Liquid Glass icon, `vera.icon`, made as an Icon Composer document. It
is a top-down aloe vera (Vera is named after the plant): two rings of six
curved leaves, like a pinwheel. It replaced a Messages-style speech bubble
that App Review would likely have rejected. The concepts it was chosen from
are in PR #52.

Appearances:

- Light: pale glass leaves on a green gradient.
- Dark: green leaves on near-black.
- Clear and tinted: gray leaves on near-black, which iOS turns into glass
  or tints.

Alternate leaves sit in separate layers with slightly different fills, so
overlapping leaves read as separate leaves. App color themes don't change
the icon.

Files:

- `vera.icon`: the Icon Composer bundle (`ios.icon` in `app.config.ts`).
  One SVG layer per ring half, with light, dark, and tinted fills.
- `vera-android-foreground.png`, `vera-android-monochrome.png`, and
  `vera-android-background.png`: Android adaptive icon layers.
- `../images/icon.png`: square, opaque, flat icon (the Expo fallback and the
  welcome screen).

## Editing

`build-icons.py` writes `vera.icon` from the leaf geometry and colors at
its top, then runs `render-flat.swift` for the flat assets. Change the
design there, not in Icon Composer. Then render every iOS appearance with
Apple's renderer and look at them:

```sh
python3 build-icons.py --check /tmp/vera-icons   # Default, Dark, Clear*, Tinted*
```

A layer's light fill must be the unqualified entry in its
`fill-specializations`. If it is a plain `fill` instead, `ictool` and iOS
ignore the dark fill.

To render one appearance by hand:

```sh
ICTOOL="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
"$ICTOOL" "$PWD/vera.icon" --export-image --output-file /tmp/vera-dark.png \
  --platform iOS --rendition Dark --width 1024 --height 1024 --scale 1
```

Renditions are `Default`, `Dark`, `ClearLight`, `ClearDark`, `TintedLight`,
and `TintedDark`. `ictool` exports are pre-masked previews, not source art.
`ictool` cannot open documents inside the Codex sandbox; run it from a
normal shell.
