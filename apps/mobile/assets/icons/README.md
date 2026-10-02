# App icons

One Liquid Glass icon per color theme, made as Icon Composer documents.
The design follows the Messages icon: a plain white speech bubble on a
vertical gradient (light), and the bubble filled with that gradient on a
near-black background (dark). In the tinted appearance the bubble is
white on dark, so iOS tints it. `family-preview.png` shows every theme,
light over dark.

- `vera-<theme>.icon`: Icon Composer bundles (one SVG bubble layer with
  glass, specular, and dark and tinted fills). `vera-blue.icon` is the
  primary iOS icon (`ios.icon` in `app.config.ts`); the other seven are
  iOS alternate icons, added to the Xcode project by
  `plugins/with-alternate-icons.cjs` and chosen in Settings → Themes.
- `previews/<theme>-light.png` and `previews/<theme>-dark.png`: 180px
  pre-masked `ictool` renders (8-bit sRGB) that Settings shows as icon
  choices.
- `vera-android-foreground.png` (also the monochrome layer) and
  `vera-android-background.png`: Android adaptive icon layers.
  Android uses the default theme only; switching icons is iOS-only.
- `../images/icon.png` (square, opaque) and `../images/splash-icon.png`
  (the bubble in the default theme) are flat renders of the same bubble.
  `render-previews.swift` renders them in its `primary` theme.

Themes: blue (default), green, teal, indigo, purple, pink, orange,
graphite. Green uses the Messages icon's colors (#53F06D to #1FD13C); blue
is the default because a green Messages lookalike is likelier to draw App
Review objections.

## Editing

`build-icons.py` writes every `.icon` bundle, `palette.json`, and the
previews from one SVG path and the colors at its top, so change the design
there rather than in Icon Composer. Then render the full-size appearances
with Apple's renderer and look at them:

```sh
python3 build-icons.py --check /tmp/vera-icons   # Default, Dark, TintedDark per theme
swift render-previews.swift "$PWD"               # Android layers, icon.png, splash, family preview
```

To render one appearance by hand:

```sh
ICTOOL="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
"$ICTOOL" "$PWD/vera-green.icon" --export-image --output-file /tmp/green-dark.png \
  --platform iOS --rendition Dark --width 1024 --height 1024 --scale 1
```

Renditions include `Default`, `Dark`, `TintedDark`, and `ClearLight`.
`ictool` exports are pre-masked previews, not source art. `ictool` cannot
open documents inside the Codex sandbox; run it from a normal shell.
