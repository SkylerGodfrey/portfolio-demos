# Sprite attributions

All bundled sprite assets and their licenses are listed here. Add new
entries above the `## Placeholder pack` block when sourcing real art.

## Pixel Dogs — `dog-brown` (HOM-143 / HOM-144)

`dog-brown/` uses art from the **Pixel Dogs** pack by **benvictus**.

- Source: https://benvictus.itch.io/pixel-dogs
- Creator: benvictus (itch.io)
- License: free placeholder asset — the author publishes no formal license
  text. Used here as a placeholder mascot; swap for a licensed pack if you
  want stronger provenance.
- Sheet: `Dogs-Remastered-08.png`, 512×432, an 8×9 grid of 64×48 cells.
  `default.json` tags: `idle` (row 0), `sit` (row 1), `barking-run` (row 3).

## Placeholder pack (HOM-125, v0)

The current `cat-grey-tabby/`, `dog-coonhound/`, and `placeholder/`
directories ship **silhouette stubs** generated programmatically by
`gen-pet.js` during the HOM-125 scaffolding pass. They prove the
plumbing (catalog scan, state engine, fs.watch hot-reload) end-to-end
on the Pi without depending on third-party art.

- License: CC0 — generated, no attribution required.
- Animation: 2-frame head-bob idle at 600 ms/frame.
- States included: `default`, `halloween`, `christmas`. State variations
  are pure palette swaps; no holiday-specific shapes.

**These are not the final art.** Replace each `.png` + `.json` with a
real spritesheet when you have one. The file layout (`<state>.png` +
`<state>.json`) is the contract — keep that and the editor catalog,
holiday engine, and fs.watch all pick up the new asset automatically.

### Sourcing real art

Recommended starting points (verify the specific asset's license before
committing):

- [OpenGameArt: Cat & Dog Free Sprites](https://opengameart.org/content/cat-dog-free-sprites)
- [Game Art 2D: Cat and Dog](https://www.gameart2d.com/cat-and-dog-free-sprites.html)
- [Kenney pixel asset packs](https://kenney.nl/) — CC0, broad coverage

When dropping new art in, also:

1. Re-export from Aseprite as **Array** JSON with the `idle` frame tag.
2. Keep individual frames ≤ 64 px square and total sheet ≤ 1024 px wide
   so older browsers don't choke on the texture.
3. Stay under 2 MB total bundled to keep the repo svelte.

## Format reference

See `sprites/_README.md` for the directory contract and Aseprite export
settings. The HOM-122 player (`vendor/ase-player.js`) consumes the
"Array" JSON format directly.
