# Using a uniform-grid spritesheet (e.g. the "Pixel Dogs" pack)

> **Easiest path (HOM-117 Phase 2):** the `/mascot` editor now has a
> **"+ Import spritesheet"** wizard — upload the PNG, it auto-detects the
> grid, you name animations by clicking rows (with live previews), and it
> writes the sheet + JSON to the Pi and offers a download bundle to commit
> back here. This document covers the CLI generator (`sheet-to-aseprite.mjs`),
> the power-user / scripting path that produces the same files.

Most pixel-art character packs ship as a single PNG laid out on a regular
grid: one **cell per frame**, rows = animations, columns = frames. MMM-Mascot's
player (`vendor/ase-player.js`) draws **sub-rectangles** of a PNG from the
Aseprite "Array" JSON `frame:{x,y,w,h}` — so you do **not** have to cut the
sheet apart. Point a state's `<state>.png` at the whole sheet and let its
`<state>.json` select which cells animate.

## Worked example: `Dogs-Remastered-08.png`

| Property         | Value     | How to get it                                       |
|------------------|-----------|-----------------------------------------------------|
| Sheet size       | 512 × 432 | `sips -g pixelWidth -g pixelHeight <file>`           |
| Grid             | 8 × 9     | count dogs across / down                             |
| **Cell size**    | **64 × 48** | 512 ÷ 8 = 64, 432 ÷ 9 = 48                          |

Verified: every dog's opaque pixels fall inside its own 64×48 cell, so the
grid tiles the sheet exactly.

### Row map (best read — eyeball before trusting)

The pack is rows-of-animations. Column = animation frame.

| Row | y range   | Looks like                         | Frames |
|-----|-----------|------------------------------------|--------|
| 0   | 0–47      | standing / tail-wag (good `idle`)  | 8      |
| 1   | 48–95     | sitting on haunches                | 8      |
| 2   | 96–143    | lying / crouch                     | 8      |
| 3   | 144–191   | running (legs extended)            | 8      |
| 4   | 192–239   | running variant                    | 8      |
| 5   | 240–287   | leaping / run                      | 8      |
| 6   | 288–335   | walking                            | 8      |
| 7   | 336–383   | begging (up on hind legs)          | 8      |
| 8   | 384–431   | sleeping / curled                  | ~4     |

Only the geometry (64×48, 8×9) is certain — confirm a row's meaning by eye,
since the bottom row has fewer real frames.

## Steps

1. **Pick a sprite id** (kebab-case): `dog-brown`.

2. **Copy the whole sheet in as the state PNG** — one copy per state you want;
   they can all be the same file:

   ```sh
   mkdir -p sprites/dog-brown
   cp "/Users/Skyler/Downloads/Pixel Dogs-Sprites/Dogs-Remastered-08.png" \
      sprites/dog-brown/default.png
   ```

3. **Generate the JSON** for the row you want as the looping `idle`. From
   `sprites/_tools/`:

   ```sh
   node sheet-to-aseprite.mjs \
     --cell 64x48 --cols 8 --rows 9 --sheet 512x432 \
     --row 0 --from 0 --to 7 \
     --tag idle --duration 150 --image default.png \
     > ../dog-brown/default.json
   ```

   `--row 0` slices the standing/tail-wag row across all 8 columns into an
   8-frame `idle` loop at 150 ms/frame. Want a slower wag? Bump `--duration`.
   Want just the bottom sleeping frames? `--row 8 --from 0 --to 3`.

4. **(Optional) holiday states** — re-run step 3 with a different `--image`
   pointing at a recoloured sheet, e.g. `--image halloween.png > ../dog-brown/halloween.json`,
   and `cp` that sheet to `sprites/dog-brown/halloween.png`. The module falls
   back to `default` when a state file is missing, so this is purely additive.

5. **Place it.** Reference the id from `mascot-layout.json` via the `/mascot`
   editor, or add it to the inline `sprites` array / `DEFAULT_SPRITES`. The
   slot's aspect should match the cell (64:48 ≈ 4:3) or the dog stretches —
   the player scales each 64×48 cell to fill the slot.

6. **Attribution.** Add the pack's source URL + creator + license to
   `sprites/ATTRIBUTIONS.md` before committing the PNG. Don't commit
   third-party art whose license you haven't confirmed.

## Multiple animations in one sheet (idle + run + sit)

Under the rotation model (HOM-117), poses are **frame tags inside one sheet's
JSON**, not separate state files. The generator takes repeatable `--anim
NAME=ROW:FROM:TO[:DURATION]` flags and emits a single JSON with one tag per
animation, all referencing the shared sheet:

```sh
node sheet-to-aseprite.mjs \
  --cell 64x48 --cols 8 --rows 9 --sheet 512x432 --image default.png \
  --anim idle=0:0:7:150 \
  --anim sit=1:0:7:200 \
  --anim barking-run=3:0:7:90 \
  > ../dog-brown/default.json
```

That yields tags `idle`, `sit`, `barking-run` over 24 frames. The `/mascot`
editor reads these tags and lets you build a per-sprite rotation that cycles
between them at random intervals (with a live preview of each). Holidays still
swap the whole PNG (`halloween.png`); the tags ride along in each skin's JSON.

> Don't make a pose its own `<state>.png` — that's the old holiday-skin slot
> and it shows up in the editor as a fake holiday. Poses are tags.

## Why not slice into per-frame PNGs?

You can (Aseprite import → export Array JSON, per `_README.md`), but for a
clean grid it's wasted work: the player already crops cells out of the sheet
at draw time, and one shared sheet keeps the repo's 2 MB sprite budget happy.
Reach for real slicing only when frames are trimmed/packed irregularly.
