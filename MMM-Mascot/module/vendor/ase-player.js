/* global window */
/*
 * Tiny Aseprite spritesheet player.
 *
 * Consumes the Aseprite "Array" JSON export shape:
 *   { frames: [{ frame:{x,y,w,h}, duration }], meta:{ frameTags:[{name,from,to,direction}], image, size:{w,h} } }
 *
 * Usage:
 *   const player = new AsePlayer(canvasEl, imageEl, json);
 *   player.play("idle");
 *   player.stop();
 */
(function (global) {
  class AsePlayer {
    constructor(canvas, image, json) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.image = image;
      this.json = json;
      this.tag = null;
      this.frameIdx = 0;
      this.lastTickMs = 0;
      this.rafId = null;
    }

    play(tagName) {
      const tag = (this.json.meta.frameTags || []).find((t) => t.name === tagName);
      if (!tag) {
        // No tag? Loop the whole sheet.
        this.tag = { name: tagName, from: 0, to: this.json.frames.length - 1, direction: "forward" };
      } else {
        this.tag = tag;
      }
      this.frameIdx = this.tag.from;
      this.lastTickMs = performance.now();
      this._drawCurrent();
      this._loop();
    }

    stop() {
      if (this.rafId != null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    destroy() {
      this.stop();
      this.image = null;
      this.json = null;
    }

    _loop() {
      this.rafId = requestAnimationFrame((now) => {
        const elapsed = now - this.lastTickMs;
        const dur = this.json.frames[this.frameIdx].duration;
        if (elapsed >= dur) {
          this.lastTickMs = now;
          this._advance();
          this._drawCurrent();
        }
        this._loop();
      });
    }

    _advance() {
      const { from, to, direction } = this.tag;
      const dir = direction || "forward";
      if (dir === "forward") {
        this.frameIdx = this.frameIdx + 1 > to ? from : this.frameIdx + 1;
      } else if (dir === "reverse") {
        this.frameIdx = this.frameIdx - 1 < from ? to : this.frameIdx - 1;
      } else if (dir === "pingpong") {
        if (!this._pingDir) this._pingDir = 1;
        let next = this.frameIdx + this._pingDir;
        if (next > to) { this._pingDir = -1; next = this.frameIdx + this._pingDir; }
        if (next < from) { this._pingDir = 1; next = this.frameIdx + this._pingDir; }
        this.frameIdx = next;
      }
    }

    _drawCurrent() {
      const f = this.json.frames[this.frameIdx].frame;
      const c = this.canvas;
      this.ctx.clearRect(0, 0, c.width, c.height);
      this.ctx.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
    }
  }

  global.MascotAsePlayer = AsePlayer;
})(window);
