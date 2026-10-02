# App icons

One Liquid Glass icon per color theme, made as Icon Composer documents.
`family-preview.png` shows the set.

- `vera-<theme>.icon`: Icon Composer bundles (one SVG layer with glass,
  specular, and dark and tinted fills). `vera-indigo.icon` is the primary
  iOS icon (`ios.icon` in `app.config.ts`); the other seven are iOS
  alternate icons, added to the Xcode project by
  `plugins/with-alternate-icons.cjs` and chosen in Settings → App Icon.
- `vera-<theme>-android-foreground.png` and `vera-android-monochrome.png`:
  Android adaptive icon layers (the glyph inside the 66% safe zone). The
  backgrounds are the theme colors in `palette.json`. Android uses indigo
  only for now; switching icons is iOS-only.

Themes: indigo (default), blue, teal, green, orange, pink, purple, graphite.

## Editing

`build-icons.py` writes every `.icon` bundle from one SVG path and the
palette, so change the design there rather than in Icon Composer. Then
render previews with Apple's renderer to check each appearance:

```sh
python3 build-icons.py --documents-only
ICTOOL="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
"$ICTOOL" "$PWD/vera-indigo.icon" --export-image --output-file /tmp/indigo-dark.png \
  --platform iOS --rendition Dark --width 1024 --height 1024 --scale 1
```

Renditions include `Default`, `Dark`, `TintedDark`, and `ClearLight`.
`ictool` exports are pre-masked previews, not source art. `ictool` cannot
open documents inside the Codex sandbox; run it from a normal shell.

`render-previews.swift` regenerates the Android PNGs (and square fallback
previews) from the same SVG path:

```sh
swift render-previews.swift "$PWD"
```

The bundles were designed by Codex (`gpt-6.1-sol`) and checked with
`ictool` renders of every appearance.
