#!/usr/bin/env node
// Automatic preview-clip capture for the portfolio demo pipeline (PORT-15).
//
// Serves a built static demo bundle locally, loads it in headless Chrome via
// Puppeteer, drives a short interaction, and records a muted WebM preview clip.
//
// Source of truth : repository-definitions/pipeline/capture-preview.mjs
// Deployed to     : SkylerGodfrey/portfolio-demos/pipeline/capture-preview.mjs
//                   (via Terraform github_repository_file — see
//                    repos/portfolio-demos/terragrunt.hcl) and executed by the
//                   reusable workflow (pipeline/portfolio-demo.yml).
//
// Recording approach — Puppeteer's page.screencast() (v21+):
//   page.screencast() streams CDP screencast frames and muxes them to WebM with
//   ffmpeg, which is PREINSTALLED on GitHub's ubuntu-latest runners. That makes
//   it the most reliable option there: it is a single, first-party API (no manual
//   CDP frame plumbing to get wrong), it emits a browser-native, seekable WebM,
//   and it needs no extra system packages beyond the ffmpeg the runner already
//   ships. We keep raw CDP + ffmpeg only as an implicit fallback concept; in
//   practice page.screencast is strictly simpler and equally dependency-light on
//   the target runner. If ffmpeg is somehow missing we degrade gracefully (see
//   below) rather than fail the publish.
//
// Robustness contract: capture must NEVER fail the demo publish. Every failure
// path here emits a GitHub `::warning::` annotation and exits 0 WITHOUT producing
// an output file. The workflow treats "no output file" as previewClipUrl = null.
//
// Usage:
//   node capture-preview.mjs \
//     --bundle <dir> --out <file.webm> \
//     [--capture-script <path.mjs>] \
//     [--width 800] [--height 500] \
//     [--duration 7000] [--max-bytes 4194304]

import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key || !key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const BUNDLE = args.bundle;
const OUT = args.out;
const CAPTURE_SCRIPT = args['capture-script'] || '';
const WIDTH = clampInt(args.width, 800, 320, 1920);
const HEIGHT = clampInt(args.height, 500, 240, 1080);
const DURATION_MS = clampInt(args.duration, 7000, 2000, 20000);
const MAX_BYTES = clampInt(args['max-bytes'], 4 * 1024 * 1024, 256 * 1024, 64 * 1024 * 1024);

function clampInt(v, dflt, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

// A soft failure: warn, ensure no partial output remains, exit 0 (never fail publish).
async function softFail(message) {
  console.log(`::warning title=Preview capture skipped::${message}`);
  try { if (OUT && existsSync(OUT)) await fs.unlink(OUT); } catch { /* ignore */ }
  process.exit(0);
}

if (!BUNDLE || !OUT) {
  // Missing wiring is a real programming error in the workflow, not a capture
  // failure — surface it loudly.
  console.error('::error::capture-preview.mjs requires --bundle <dir> and --out <file.webm>.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Minimal dependency-free static file server for the built bundle.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function createServer(root) {
  return http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(root, rel);
      // Prevent path traversal outside the served root.
      if (!filePath.startsWith(path.resolve(root))) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let stat = await fs.stat(filePath).catch(() => null);
      if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stat = await fs.stat(filePath).catch(() => null);
      }
      if (!stat) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(500).end('Server error');
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// ---------------------------------------------------------------------------
// Default footage driver: wait for fonts, gentle autoscroll, brief idle.
// Used when the caller repo provides no captureScript.
// ---------------------------------------------------------------------------
async function defaultDriver(page) {
  await page.evaluate(async () => {
    // Best-effort wait for web fonts so text isn't captured mid-swap.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(800); // settle after load

    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    if (maxScroll > 4) {
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        window.scrollTo(0, Math.round((maxScroll * i) / steps));
        await sleep(70);
      }
      await sleep(500);
      // Ease back to the top so the loop reads nicely.
      for (let i = steps; i >= 0; i--) {
        window.scrollTo(0, Math.round((maxScroll * i) / steps));
        await sleep(40);
      }
    } else {
      // Static page with no scroll overflow: keep paint activity flowing with
      // a slow, subtle push-in (Ken Burns). Without paints the screencast
      // emits no frames at all, and the clip would come out empty.
      const el = document.body;
      el.style.transformOrigin = '50% 35%';
      el.style.transition = 'transform 4.5s ease-in-out';
      el.style.transform = 'scale(1.045)';
      await sleep(4700);
      el.style.transition = 'transform 1.5s ease-in-out';
      el.style.transform = 'scale(1)';
      await sleep(1600);
    }
    await sleep(700); // final idle
  });
}

// ---------------------------------------------------------------------------
// ffmpeg helpers (only used to shrink an over-cap clip; optional).
// ---------------------------------------------------------------------------
function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// Re-encode/trim an over-cap clip in place. Returns true if the result fits.
async function shrinkToCap(file, maxBytes, width) {
  if (!hasFfmpeg()) return false;
  const tmp = `${file}.shrunk.webm`;
  // Cap duration to 6s, scale to <=640px wide, and target a bitrate that lands
  // comfortably under the cap. VP9, no audio (already muted).
  const targetKbps = Math.max(300, Math.floor((maxBytes * 8) / 6 / 1000 * 0.85));
  const scaleW = Math.min(640, width);
  const r = spawnSync('ffmpeg', [
    '-y', '-i', file,
    '-t', '6',
    '-an',
    '-vf', `scale=${scaleW}:-2`,
    '-c:v', 'libvpx-vp9', '-b:v', `${targetKbps}k`,
    '-deadline', 'good', '-cpu-used', '4',
    tmp,
  ], { stdio: 'ignore' });
  if (r.status !== 0 || !existsSync(tmp)) {
    try { if (existsSync(tmp)) await fs.unlink(tmp); } catch { /* ignore */ }
    return false;
  }
  const size = (await fs.stat(tmp)).size;
  if (size > maxBytes) {
    await fs.unlink(tmp).catch(() => {});
    return false;
  }
  await fs.rename(tmp, file);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(BUNDLE) || !existsSync(path.join(BUNDLE, 'index.html'))) {
    return softFail(`bundle '${BUNDLE}' has no index.html to capture.`);
  }

  // Puppeteer is installed by the workflow into a scratch dir (the current
  // working directory), which is not necessarily this script's own directory.
  // Resolve it from CWD's node_modules so the script can live anywhere. Import
  // lazily so a missing install becomes a soft failure rather than a crash.
  let puppeteer;
  try {
    const requireFromCwd = createRequire(path.join(process.cwd(), 'noop.js'));
    const puppeteerEntry = requireFromCwd.resolve('puppeteer');
    ({ default: puppeteer } = await import(pathToFileURL(puppeteerEntry).href));
  } catch (err) {
    return softFail(`puppeteer is not available: ${err.message}`);
  }

  // Resolve an optional caller-provided capture script up front so a bad path
  // fails soft before we spin up Chrome.
  let driver = defaultDriver;
  if (CAPTURE_SCRIPT) {
    const abs = path.resolve(CAPTURE_SCRIPT);
    if (!existsSync(abs)) {
      return softFail(`captureScript '${CAPTURE_SCRIPT}' not found in the repo.`);
    }
    try {
      const mod = await import(pathToFileURL(abs).href);
      if (typeof mod.default !== 'function') {
        return softFail(`captureScript '${CAPTURE_SCRIPT}' must have a default export (page) => Promise<void>.`);
      }
      driver = mod.default;
    } catch (err) {
      return softFail(`failed to import captureScript '${CAPTURE_SCRIPT}': ${err.message}`);
    }
  }

  const server = createServer(path.resolve(BUNDLE));
  let port;
  try {
    port = await listen(server);
  } catch (err) {
    return softFail(`could not start local preview server: ${err.message}`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-cap-'));
  const rawOut = path.join(tmpDir, 'preview.webm');
  let browser;
  let hadError = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio',
        '--force-color-profile=srgb',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

    // Start recording BEFORE navigation: Chrome's screencast only emits
    // frames on paint damage, so a fully static page after load can yield
    // zero frames (and an empty file). Recording from about:blank guarantees
    // the load-in paint is always captured, whatever the page does after.
    const recorder = await page.screencast({ path: rawOut });

    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Race the driver against the max clip duration so a runaway captureScript
    // (or a hanging default scroll) can't stretch the recording.
    let driverErr = null;
    await Promise.race([
      Promise.resolve()
        .then(() => driver(page))
        .catch((err) => { driverErr = err; }),
      new Promise((r) => setTimeout(r, DURATION_MS)),
    ]);

    await recorder.stop();
    if (driverErr) {
      console.log(`::warning title=Preview capture driver::captureScript/driver threw (clip may be short): ${driverErr.message}`);
    }
  } catch (err) {
    hadError = err;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  if (hadError) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return softFail(`recording failed: ${hadError.message}`);
  }

  if (!existsSync(rawOut) || (await fs.stat(rawOut)).size === 0) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return softFail('recorder produced no output.');
  }

  // Enforce the file-size cap.
  let size = (await fs.stat(rawOut)).size;
  if (size > MAX_BYTES) {
    console.log(`::warning title=Preview capture oversize::clip is ${(size / 1048576).toFixed(1)}MB (cap ${(MAX_BYTES / 1048576).toFixed(1)}MB) — attempting re-encode.`);
    const ok = await shrinkToCap(rawOut, MAX_BYTES, WIDTH);
    if (!ok) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return softFail(`clip exceeds the ${(MAX_BYTES / 1048576).toFixed(1)}MB cap and could not be shrunk — dropping preview.`);
    }
    size = (await fs.stat(rawOut)).size;
  }

  // Publish the final clip to the requested output path.
  await fs.mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
  await fs.copyFile(rawOut, OUT);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  console.log(`preview-capture: wrote ${OUT} (${(size / 1024).toFixed(0)}KB, ${WIDTH}x${HEIGHT}).`);
  process.exit(0);
}

main().catch((err) => softFail(`unexpected error: ${err && err.message ? err.message : err}`));
