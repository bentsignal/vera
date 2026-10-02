# App icon concepts

Exploration for a new app icon. The current icon is too close to the
Messages icon to be safe in App Review. None of these concepts are used by
the app yet.

- `bubbles.png`: b01-b10, speech bubble shapes on the default blue theme.
- `aloe.png`: a01-a10, top-down aloe vera rosettes. Vera is named after
  the plant.

Each sheet shows the light appearance above the dark one. The renders come
from Apple's `ictool`, so they show real Liquid Glass.

```sh
python3 build-concepts.py          # out/<id>.icon bundles and renders/ (ignored)
swift contact-sheet.swift "$PWD"   # bubbles.png and aloe.png
```

The `out/*.icon` bundles open in Icon Composer. When a concept is chosen,
move its shapes into `../build-icons.py` and rebuild every theme from there.
