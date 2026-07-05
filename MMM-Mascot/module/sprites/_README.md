# MMM-Mascot sprite catalog

Each top-level directory here is one **sprite id**. The id is what `mascot-layout.json` (HOM-123) references.

```
sprites/
├── placeholder/         ← shipped test sprite (used by the default HOM-122 module config)
│   ├── default.png      ← Aseprite spritesheet PNG (sheet, not single frame)
│   └── default.json     ← Aseprite "Array" JSON export
└── <sprite-id>/
    ├── default.png      ← required
    ├── default.json
    ├── halloween.png    ← optional, used by the HOM-124 holiday engine
    ├── halloween.json
    ├── christmas.png
    └── christmas.json
```

## Aseprite export settings

Export from Aseprite → Sprite Sheet with:
- **Output**: PNG + JSON.
- **JSON layout**: Array.
- **Meta**: Tags ON, Layers OFF, Slices OFF.

Make sure there is a frame tag named `idle` covering the looping idle animation — it's what a sprite plays when no rotation is configured. **Additional tags are now first-class** (HOM-117): a sprite's per-sprite *rotation*, configured in the `/mascot` editor, cycles between the named tags at random intervals. Holidays still pick the *skin* (which `<state>.png`); rotation picks the *animation* (which tag inside it). See `_HOWTO-grid-sheet.md` for building a multi-tag sheet.

## File-name conventions

- Directory names are kebab-case sprite ids: `cat-grey-tabby`, `dog-coonhound`.
- State filenames are `<state>.png` + `<state>.json`. Required: `default`. Holiday states defined in HOM-124.
- Directories starting with `_` (like this README's parent) and `.` are skipped by the catalog scanner.

## Attribution

Asset licenses live in `ATTRIBUTIONS.md` (created in HOM-125 alongside the real cat/dog packs). Every third-party sprite needs source URL + creator + license in that file.
