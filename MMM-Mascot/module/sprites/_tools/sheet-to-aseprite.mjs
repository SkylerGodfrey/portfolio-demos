#!/usr/bin/env node
/*
 * sheet-to-aseprite.mjs — turn a uniform-grid spritesheet (one cell per
 * frame, like the "Pixel Dogs" pack) into the Aseprite "Array" JSON that
 * MMM-Mascot's vendor/ase-player.js consumes.
 *
 * It does NOT touch pixels. The player draws sub-rectangles out of whatever
 * PNG it loads for a state, so you copy the *whole* sheet to <state>.png and
 * this script emits the JSON whose frames index the cells you want.
 *
 * One JSON = one animation (it writes a single tag, default `idle`, which is
 * the only tag the module plays today — see ../_README.md).
 *
 * Usage:
 *   node sheet-to-aseprite.mjs \
 *     --cell 64x48 --cols 8 --rows 9 --sheet 512x432 \
 *     --row 0 --from 0 --to 7 \
 *     --tag idle --duration 150 --image default.png \
 *     > ../dog-brown/default.json
 *
 * Flags:
 *   --cell   WxH    cell size in px               (required, e.g. 64x48)
 *   --cols   N      columns in the sheet          (required, for sanity-check)
 *   --rows   N      rows in the sheet             (required, for sanity-check)
 *   --sheet  WxH    full sheet size in px         (required; written to meta)
 *   --row    R      0-based row to slice           (required)
 *   --from   C      first 0-based column          (default 0)
 *   --to     C      last 0-based column inclusive  (default cols-1)
 *   --tag    NAME   frame-tag name                 (default "idle")
 *   --duration MS   per-frame duration in ms       (default 150)
 *   --image  NAME   meta.image filename            (default "default.png")
 */

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--")) die(`unexpected argument: ${k}`);
    const key = k.slice(2);
    const val = argv[i + 1];
    // Repeated flags (--anim ... --anim ...) accumulate into an array so
    // multi-animation sheets can be described on one command line.
    if (key in a) {
      a[key] = Array.isArray(a[key]) ? [...a[key], val] : [a[key], val];
    } else {
      a[key] = val;
    }
  }
  return a;
}
function die(msg) {
  process.stderr.write(`sheet-to-aseprite: ${msg}\n`);
  process.exit(1);
}
function wh(s, name) {
  const m = /^(\d+)x(\d+)$/.exec(s || "");
  if (!m) die(`--${name} must be WxH (got "${s}")`);
  return { w: +m[1], h: +m[2] };
}

const a = parseArgs(process.argv.slice(2));
const cell = wh(a.cell, "cell");
const sheet = wh(a.sheet, "sheet");
const cols = +a.cols, rows = +a.rows;
const image = a.image || "default.png";

// Sanity check the grid tiles the sheet exactly — catching this here
// beats a silently-wrong sheet downstream.
if (cols * cell.w !== sheet.w) die(`cols*cellW (${cols * cell.w}) != sheet width (${sheet.w})`);
if (rows * cell.h !== sheet.h) die(`rows*cellH (${rows * cell.h}) != sheet height (${sheet.h})`);

// Two modes:
//   single-row : --row R [--from C --to C] [--tag NAME] [--duration MS]
//   multi-anim : one or more --anim NAME=ROW:FROM:TO[:DURATION]
// Multi-anim wins when any --anim is present, and produces one JSON with
// several frame tags sharing the single sheet — the shape the rotation
// feature (HOM-117) and the Phase-2 slice UI both emit.
const animSpecs = [];
const rawAnims = a.anim === undefined ? [] : (Array.isArray(a.anim) ? a.anim : [a.anim]);
for (const spec of rawAnims) {
  const m = /^([A-Za-z0-9_-]+)=(\d+):(\d+):(\d+)(?::(\d+))?$/.exec(spec);
  if (!m) die(`--anim must be NAME=ROW:FROM:TO[:DURATION] (got "${spec}")`);
  animSpecs.push({ tag: m[1], row: +m[2], from: +m[3], to: +m[4], duration: m[5] ? +m[5] : 150 });
}
if (animSpecs.length === 0) {
  // Single-row mode (back-compat with the original flags).
  if (a.row === undefined) die("provide --row (single mode) or at least one --anim (multi mode)");
  animSpecs.push({
    tag: a.tag || "idle",
    row: +a.row,
    from: a.from === undefined ? 0 : +a.from,
    to: a.to === undefined ? cols - 1 : +a.to,
    duration: a.duration === undefined ? 150 : +a.duration,
  });
}

const frames = [];
const frameTags = [];
for (const an of animSpecs) {
  if (an.row < 0 || an.row >= rows) die(`anim "${an.tag}": row ${an.row} out of range 0..${rows - 1}`);
  if (an.from < 0 || an.to >= cols || an.from > an.to) {
    die(`anim "${an.tag}": from/to ${an.from}..${an.to} out of range 0..${cols - 1}`);
  }
  const start = frames.length;
  for (let c = an.from; c <= an.to; c++) {
    frames.push({
      filename: `${an.tag}_${c - an.from}.png`,
      frame: { x: c * cell.w, y: an.row * cell.h, w: cell.w, h: cell.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cell.w, h: cell.h },
      sourceSize: { w: cell.w, h: cell.h },
      duration: an.duration,
    });
  }
  frameTags.push({ name: an.tag, from: start, to: frames.length - 1, direction: "forward" });
}

const doc = {
  frames,
  meta: {
    app: "sheet-to-aseprite.mjs",
    version: "1.0",
    image,
    format: "RGBA8888",
    size: sheet,
    scale: "1",
    frameTags,
    layers: [{ name: "Layer", opacity: 255, blendMode: "normal" }],
    slices: [],
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
