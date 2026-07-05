# MMM-Mascot

A MagicMirror² module that renders animated pixel-art pet mascots as a
fullscreen overlay on the mirror canvas. Sprites (Aseprite spritesheet format)
are placed at free-form positions using a percentage-based coordinate system so
they scale correctly across any mirror resolution without letterboxing.

A built-in holiday state engine swaps seasonal sprite skins — halloween,
christmas, and any custom windows — based on configurable MM-DD date ranges,
with no restart required. When a state-specific asset is missing the module
silently falls back to the default skin. A rotation controller cycles a
sprite's animation tags (idle, sit, barking-run, etc.) in random order with
per-sprite configurable dwell timers, so the mascots feel alive without all
animations running in lockstep.

The module integrates fully with the MagicMirror front-end API — loading
vendor scripts via `getScripts`, applying `image-rendering: pixelated` CSS,
and receiving hot-reloaded layout updates from a `node_helper` that watches
`mascot-layout.json` for agent-written changes.

**The demo runs in a static harness with fixture data.** No MagicMirror
install or server process is required: the harness stubs the front-end API
and replays scripted socket notifications over ~20 s to simulate the
`node_helper` delivering a saved layout, then activating holiday skins.

## Highlights

- Canvas/pixel animation via a custom Aseprite spritesheet player (vanilla JS, zero runtime deps)
- Full MagicMirror module API: `getScripts`, `getStyles`, `getDom`, `socketNotificationReceived`, `suspend`/`resume`
- Date-driven holiday state engine selects seasonal skins from configurable MM-DD windows
- Animation rotation engine: random tag cycling, no back-to-back repeats, per-sprite dwell range
- Graceful asset fallback — missing holiday variants fall back silently to the default skin
- Static harness demo: no MagicMirror, no node process, fully offline after build
