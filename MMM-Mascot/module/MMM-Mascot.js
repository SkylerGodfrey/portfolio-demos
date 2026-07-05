/* global Module, Log */

Module.register("MMM-Mascot", {
  defaults: {
    // Path to the layout document the magicmirror-agent /mascot editor
    // writes (HOM-123). Resolved on the node side. When empty the module
    // falls back to the inline `sprites` array below.
    layoutPath: "../../config/mascot-layout.json",

    // Inline fallback used only when layoutPath is unset or missing.
    canvasSize: { w: 1080, h: 1780 },
    sprites: [],
    holidays: [],

    // Override the active state for testing. When null the module computes
    // it from the holiday list against today's local date (HOM-124).
    forceState: null,

    playerScript: "vendor/ase-player.js",

    // HOM-129: when mascot-layout.json (or the inline fallback) carries
    // an empty sprite list, render the bundled cat + dog so a fresh
    // install isn't a blank overlay. Disabled the moment the user saves
    // a real layout — the fallback only fires on an empty list.
    showDefaultSprites: true,
  },

  getScripts() {
    return [this.file(this.config.playerScript), this.file("vendor/state-engine.js")];
  },

  getStyles() {
    return [this.file("MMM-Mascot.css")];
  },

  start() {
    // Each mount is { player, rotator }. rotator is null for sprites
    // without a rotation config (they just play "idle"); when present it
    // owns the setTimeout that cycles animation tags (HOM-117).
    this.mounts = [];
    this.rootEl = null;
    // Monotonic mount generation. `_mountSprites` is async (it awaits sprite
    // fetches), so a fresh call can begin while an earlier one is still mid
    // await — e.g. the empty-config mount from getDom() racing the real layout
    // arriving over the socket. Each call captures a seq; an in-flight call
    // that finds itself superseded bails before appending, so stale default
    // sprites can't pile on top of the configured ones (HOM-117).
    this._mountSeq = 0;
    this.layout = {
      canvas: this.config.canvasSize,
      sprites: this.config.sprites,
      holidays: this.config.holidays,
    };
    this.activeState = this._computeState(new Date());
    // HOM-124: re-evaluate the active state once an hour. Hourly is
    // enough — holiday windows are day-granular and an hour of stale
    // skin around midnight is fine.
    setInterval(() => this._tickState(), 60 * 60 * 1000);

    this.sendSocketNotification("MMM_MASCOT_INIT", { layoutPath: this.config.layoutPath });
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_MASCOT_LAYOUT") return;
    if (payload.source === "layout" && payload.document) {
      const doc = payload.document;
      this.layout = {
        canvas: doc.canvas || this.config.canvasSize,
        sprites: doc.sprites || [],
        holidays: doc.holidays || [],
      };
      this.activeState = this._computeState(new Date());
      this._mountSprites();
    } else if (payload.source === "error") {
      Log.warn(`[MMM-Mascot] helper reported: ${payload.error}`);
    }
  },

  getDom() {
    const root = document.createElement("div");
    root.className = "mmm-mascot-overlay";
    // HOM-128: do NOT set aspect-ratio here. The overlay fills 100% of
    // whatever slot Canvas v2 hands it; forcing a 1080:1780 aspect
    // overflows narrow/short slots and bleeds into neighbouring slots
    // above the wrapper. Sprite positions are percentage-based so they
    // already scale with the container — accept some stretching if the
    // slot's aspect differs from the design canvas (recommend allocating
    // a slot covering the full canvas, per CLAUDE.md).
    this.rootEl = root;
    // Defer until next tick so socket-notification can also call _mountSprites
    // without racing against an unmounted root.
    setTimeout(() => this._mountSprites(), 0);
    return root;
  },

  async _mountSprites() {
    if (!this.rootEl) return;
    const seq = ++this._mountSeq;
    this._destroyPlayers();
    const canvas = {
      w: this.layout.canvas.w || this.layout.canvas.width,
      h: this.layout.canvas.h || this.layout.canvas.height,
    };
    const sprites = this._effectiveSprites();
    for (const s of sprites) {
      try {
        await this._mountOne(s, this.activeState, canvas, seq);
      } catch (err) {
        Log.error(`[MMM-Mascot] failed to mount sprite ${s.id}:`, err);
      }
      // A newer _mountSprites started while we were awaiting — abandon the
      // rest so we don't interleave two layouts into the same overlay.
      if (seq !== this._mountSeq) return;
    }
  },

  // HOM-129: fall back to the bundled cat + dog when the layout has no
  // sprites, so a fresh install isn't a blank overlay. The fallback is
  // visual-only — never persisted — so as soon as the user saves a real
  // sprite list via /mascot the defaults stop firing.
  _effectiveSprites() {
    const sprites = this.layout.sprites || [];
    if (sprites.length > 0 || !this.config.showDefaultSprites) return sprites;
    return DEFAULT_SPRITES;
  },

  // HOM-124: try the active state's assets first; fall back to "default"
  // when a state-specific file 404s. A sprite without "default" assets
  // is the only failure case worth surfacing — those configs are broken.
  async _mountOne(s, state, canvas, seq) {
    const tryStates = state && state !== "default" ? [state, "default"] : ["default"];
    let json, image, used;
    let lastErr;
    for (const st of tryStates) {
      const baseUrl = this.file(`sprites/${s.sprite}/${st}`);
      try {
        const [j, img] = await Promise.all([
          fetch(`${baseUrl}.json`).then((r) => { if (!r.ok) throw new Error(`json ${r.status}`); return r.json(); }),
          this._loadImage(`${baseUrl}.png`),
        ]);
        json = j; image = img; used = st;
        break;
      } catch (err) { lastErr = err; }
    }
    if (!json || !image) throw lastErr || new Error("no assets loaded");
    // A newer mount generation began while our assets were loading — drop this
    // sprite rather than appending it onto a layout that's already been
    // superseded (and may already have been cleared out from under us).
    if (seq != null && seq !== this._mountSeq) return;
    if (used !== state) Log.info(`[MMM-Mascot] sprite ${s.id} (${s.sprite}) falling back to default for state "${state}"`);

    const wrap = document.createElement("div");
    wrap.className = "mmm-mascot-sprite";
    wrap.style.left = `${(s.x / canvas.w) * 100}%`;
    wrap.style.top = `${(s.y / canvas.h) * 100}%`;
    wrap.style.width = `${(s.w / canvas.w) * 100}%`;
    wrap.style.height = `${(s.h / canvas.h) * 100}%`;

    const canvasEl = document.createElement("canvas");
    canvasEl.width = json.frames[0].frame.w;
    canvasEl.height = json.frames[0].frame.h;
    wrap.appendChild(canvasEl);
    this.rootEl.appendChild(wrap);

    const player = new window.MascotAsePlayer(canvasEl, image, json);
    const rotator = this._buildRotator(player, json, s.rotation);
    if (rotator) {
      rotator.start();
    } else {
      player.play("idle");
    }
    this.mounts.push({ player, rotator });
  },

  // HOM-117: build a rotation controller for a sprite, or null when the
  // sprite has no rotation config or none of its configured animations
  // exist in the active skin's JSON (in which case the caller plays
  // "idle"). Holidays still choose the skin (the PNG); the rotator only
  // chooses which tag inside it plays.
  _buildRotator(player, json, rotation) {
    if (!rotation || !Array.isArray(rotation.animations) || rotation.animations.length === 0) {
      return null;
    }
    const available = (json.meta.frameTags || []).map((t) => t.name);
    const tags = rotation.animations.filter((t) => available.includes(t));
    if (tags.length === 0) {
      Log.warn(`[MMM-Mascot] rotation tags ${JSON.stringify(rotation.animations)} not found in sheet (have ${JSON.stringify(available)}); playing idle`);
      return null;
    }

    const minMs = Math.max(1, rotation.minMs | 0);
    const maxMs = Math.max(minMs, rotation.maxMs | 0);
    let timer = null;
    let current = null;

    // Pick a random tag that isn't the one currently showing (no
    // back-to-back repeats). With a single tag the "no repeat" rule can't
    // hold, so it just stays on that tag.
    const pickNext = () => {
      const choices = tags.filter((t) => t !== current);
      const pool = choices.length ? choices : tags;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const schedule = () => {
      const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
      timer = setTimeout(() => {
        current = pickNext();
        player.play(current);
        schedule();
      }, delay);
    };

    return {
      start() {
        current = pickNext();
        player.play(current);
        // A single usable tag never switches — skip the timer entirely.
        if (tags.length > 1) schedule();
      },
      stop() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  },

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image load failed: ${url}`));
      img.src = url;
    });
  },

  _destroyPlayers() {
    for (const m of this.mounts) {
      if (m.rotator) m.rotator.stop();
      m.player.destroy();
    }
    this.mounts = [];
    if (this.rootEl) this.rootEl.innerHTML = "";
  },

  // HOM-124: state engine. First holiday window in document order whose
  // [start, end] MM-DD range contains today wins; else "default". Both
  // ends are inclusive. Config override (forceState) bypasses the lookup.
  _computeState(date) {
    if (this.config.forceState) return this.config.forceState;
    return window.MascotStateEngine.computeState(date, this.layout.holidays || []);
  },

  _tickState() {
    const next = this._computeState(new Date());
    if (next !== this.activeState) {
      Log.info(`[MMM-Mascot] state transition: ${this.activeState} → ${next}`);
      this.activeState = next;
      this._mountSprites();
    }
  },

  suspend() {
    for (const m of this.mounts) {
      if (m.rotator) m.rotator.stop();
      m.player.stop();
    }
  },

  resume() {
    for (const m of this.mounts) {
      if (m.rotator) {
        m.rotator.start();
      } else {
        m.player.play("idle");
      }
    }
  },
});

// HOM-129: bundled default placements. Both sprites are large (256 px)
// so they read clearly from across the room even when the slot scales
// them down. Coordinates are in the canonical 1080×1780 design space.
const DEFAULT_SPRITES = [
  { id: "default_cat", sprite: "cat-grey-tabby", x: 120, y: 760, w: 256, h: 256 },
  { id: "default_dog", sprite: "dog-coonhound",  x: 700, y: 760, w: 256, h: 256 },
];

