# Claude Code Rules for MMM-Mascot

Tracked under YouTrack epic **HOM-117** (https://sgodfrey.youtrack.cloud/issue/HOM-117).
Sub-tickets: HOM-122 (this scaffold), HOM-123 (editor), HOM-124 (terraform + holiday engine), HOM-125 (sprite pack).

## What this module does

Renders animated pixel-art sprites at free-form positions over the MagicMirror canvas. Positioning, state mapping, and the holiday calendar live in `mascot-layout.json` written by `magicmirror-agent` (per the workspace [[terraform-managed-state]] convention).

This module is one of three workspace modules whose state surface is owned by the agent and shaped by Terraform — alongside `MMM-Canvas` and (eventually) the canvas-managed module configs.

## Architecture

```
MMM-Mascot/
├── MMM-Mascot.js     ← module shell, mounts <canvas> per sprite, hands them to the player
├── MMM-Mascot.css    ← overlay sized to canvas, pointer-events:none, image-rendering:pixelated
├── node_helper.js    ← serves /MMM-Mascot/sprites assets + /MMM-Mascot/api/sprites catalog
├── vendor/
│   └── ase-player.js ← ~100-LOC Aseprite-JSON spritesheet player (no deps)
└── sprites/
    ├── _README.md
    ├── placeholder/     ← committed test sprite (2-frame magenta/teal flash)
    └── <sprite-id>/<state>.png + <state>.json
```

## Spritesheet format (Aseprite "Array" export)

The player consumes Aseprite's standard Array-format JSON. Tag `idle` is required and plays when a sprite has no rotation. Frame durations are read from `frames[i].duration` in milliseconds — do NOT hand-roll FPS.

**Animation rotation (HOM-117):** a sprite may carry a `rotation` object (`{ animations: [tags], minMs, maxMs }`, written by the `/mascot` editor). When present the module cycles those frame tags — random order, no back-to-back repeats, random dwell in `[minMs, maxMs]` — instead of playing `idle`. The rotation controller lives in `MMM-Mascot.js` (`_buildRotator`); tags not found in the active skin's JSON are skipped, falling back to `idle`. Holidays remain orthogonal: they choose the **skin** (which PNG), rotation chooses the **animation** (which tag inside it).

Asset path layout: `sprites/<sprite-id>/<state>.{png,json}`. The `default` state is required; holiday states (`halloween`, `christmas`, …) are optional. The module falls back to `default` when a state-specific asset is missing (HOM-124).

## Coordinate system

Sprite x/y/w/h are expressed in the canvas design space (default 1080×1780). The module's DOM root fills 100%×100% of whatever slot Canvas v2 hands it; sprites are positioned with percentages so they scale correctly when the slot is smaller than the design canvas.

**Slot sizing** (HOM-128): allocate the MMM-Mascot slot at the same aspect ratio as the design canvas — typically a fullscreen slot covering the whole canvas. Slots with a different aspect (e.g. a 360×140 bottom strip) will stretch sprites because the percentage-based positioning maps each axis independently. There is no letterboxing.

## Default sprites (HOM-129)

When `mascot-layout.json` carries an empty sprite list, the module renders the bundled `cat-grey-tabby` and `dog-coonhound` placeholders so a fresh install isn't a blank overlay. The defaults are visual-only and never persisted — the moment the user saves any non-empty sprite list via `/mascot`, the fallback stops firing. Opt out per-deploy with `showDefaultSprites: false`.

## Feature Flags Requirement

Same workspace rule as siblings: every new behavior gets a config flag, defaults are sensible, the option is documented if user-facing.

## What lives where

- Schema for `mascot-layout.json` will be defined in the agent (HOM-123) — do NOT invent fields here that the agent does not write.
- Holiday-calendar selection (HOM-124) belongs in this module; the agent only stores the windows.
- Editor (HOM-123) is in `magicmirror-agent`, NOT in this repo.

## Conventions

- No npm dependencies — the player is vanilla JS.
- Sprite assets stay under 2 MB total.
- Image rendering is `pixelated` everywhere — the aesthetic is pixel art, not blurred upscales.
