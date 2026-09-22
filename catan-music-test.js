"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), { spawn } = require("node:child_process"), { createHash } = require("node:crypto");
const Music = require("./catan-music");
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(saved = {}) {
  const storage = new Map(Object.entries(saved)), media = [], contexts = [];
  class Audio extends EventTarget {
    constructor() { super(); media.push(this); this.paused = true; this.currentTime = 0; this.plays = 0; this.volume = 1; }
    getAttribute(name) { return this[name]; }
    play() { this.plays++; this.paused = false; return this.result || Promise.resolve(); }
    pause() { this.paused = true; }
  }
  class AudioContext {
    constructor() { contexts.push(this); this.state = "running"; this.destination = {}; }
    createGain() { return this.node = { gain: { value: 1 }, connect() {} }; }
    createMediaElementSource() { return { connect() {} }; }
    resume() { this.state = "running"; return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const env = { Audio, AudioContext, document: { hidden: false }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  return { env, storage, media, contexts, player: Music.create(env) };
}

test("music loads only after a gesture, selects the edition and never stacks players", async () => {
  const f = fixture(), p = f.player;
  p.sync(); assert.equal(f.media.length, 0);
  assert.equal(p.track.title, "Oceanfront"); assert.equal(p.volume, .25);
  p.unlock(); await tick();
  const audio = f.media[0];
  assert.equal(audio.src, Music.tracks.base.src); assert.equal(audio.loop, true); assert.equal(audio.preload, "none");
  assert.equal(f.contexts[0].node.gain.value, .25); assert.equal(audio.volume, 1);
  audio.currentTime = 15;
  for (let i = 0; i < 10; i++) { p.setEdition("base"); p.sync(); p.unlock(); }
  assert.equal(audio.plays, 1); assert.equal(audio.currentTime, 15);
  p.setEdition("pirates"); await tick(); assert.equal(audio.src, Music.tracks.seafarers.src);
  p.setEdition("new-world"); p.setEdition("cloth"); assert.equal(audio.plays, 2);
  p.setEdition("base"); await tick(); assert.equal(audio.src, Music.tracks.base.src); assert.equal(f.media.length, 1);
});

test("music preferences, visibility and zero volume pause without changing the position", async () => {
  const f = fixture({ "catan-music-enabled": "false", "catan-music-volume": "0.4", "catan-muted": "true" }), p = f.player;
  p.unlock(); assert.equal(f.media.length, 0);
  p.setEdition("shores-1"); p.setEnabled(true); await tick();
  const audio = f.media[0]; audio.currentTime = 12;
  p.setVolume(.3); assert.equal(f.contexts[0].node.gain.value, .3); assert.equal(audio.plays, 1);
  f.env.document.hidden = true; p.sync(); assert.equal(audio.paused, true);
  f.env.document.hidden = false; p.sync(); await tick(); assert.equal(audio.paused, false); assert.equal(audio.currentTime, 12);
  p.setVolume(0); assert.equal(audio.paused, true); assert.equal(p.enabled, true);
  p.setVolume(.6); await tick(); assert.equal(audio.paused, false);
  p.stop(); p.sync(); assert.equal(audio.paused, true); p.unlock(); await tick(); assert.equal(audio.paused, false);
  p.setEnabled(false); assert.equal(audio.paused, true); assert.equal(p.volume, .6);
  assert.equal(f.storage.get("catan-muted"), "true");
  const fresh = Music.create(f.env); assert.equal(fresh.enabled, false); assert.equal(fresh.volume, .6);
  p.setVolume(NaN); p.setVolume(Infinity); assert.equal(p.volume, .6);
  p.setVolume(2); assert.equal(p.volume, 1); p.setVolume(-2); assert.equal(p.volume, 0);
  for (const value of ["bad", "", "NaN", "Infinity"]) assert.equal(fixture({ "catan-music-volume": value }).player.volume, .25);
});

test("pending playback, interrupted contexts, failures and missing APIs are handled", async () => {
  const f = fixture(), p = f.player; p.unlock(); await tick();
  const audio = f.media[0]; audio.pause();
  let reject;
  audio.result = new Promise((resolve, fail) => { reject = fail; });
  p.sync(); p.sync(); assert.equal(audio.plays, 2);
  audio.result = null; p.setEdition("seafarers"); await tick();
  reject(new Error("old request")); await tick(); assert.equal(p.failed, false); assert.equal(audio.paused, false);
  audio.dispatchEvent(new Event("error")); assert.equal(p.failed, true);
  audio.dispatchEvent(new Event("playing")); assert.equal(p.failed, false);
  f.contexts[0].state = "interrupted"; p.unlock(); assert.equal(f.contexts[0].state, "running");
  audio.pause(); audio.result = Promise.reject(Object.assign(new Error("gesture"), { name: "NotAllowedError" }));
  p.sync(); await tick(); assert.equal(p.failed, false);
  audio.pause(); audio.result = Promise.reject(new Error("network")); p.sync(); await tick(); assert.equal(p.failed, true);
  assert.doesNotThrow(() => { const p = Music.create({}); p.unlock(); p.setVolume(.2); p.setEnabled(false); });
  const fallback = fixture(); delete fallback.env.AudioContext;
  fallback.player.unlock(); await tick(); fallback.player.setVolume(.45); assert.equal(fallback.media[0].volume, .45);
});

const files = [
  ["peritune-oceanfront.mp3", 6643131, "c51b7d3707287047478e0d546c82b957125f29ffc3e7c9edc564f9bee793234b"],
  ["peritune-harbor-morning.mp3", 1909334, "2235cec10fd715fbc1fb17a3c850fe66f208b04372e5207b9897621711e96e69"]
];
test("both bundled tracks match the original author downloads and include credits", () => {
  for (const [name, size, hash] of files) {
    const bytes = fs.readFileSync(path.join(__dirname, "audio", name));
    assert.equal(bytes.length, size); assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  }
  const credits = fs.readFileSync(path.join(__dirname, "audio/CREDITS.md"), "utf8");
  for (const track of Object.values(Music.tracks)) { assert.ok(credits.includes(track.title)); assert.ok(credits.includes(track.source)); }
});

async function withServer(run) {
  const reserve = http.createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: String(port), CATAN_BOT_DELAY: "600000" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", spawnError; child.on("error", error => { spawnError = error; });
  child.stdout.on("data", b => { output += b; }); child.stderr.on("data", b => { output += b; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(output);
      try { ready = (await fetch(base + "/health")).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, output || "Server failed to start");
    await run(base);
  } finally {
    if (child.exitCode === null && !spawnError) { const closed = once(child, "exit"); child.kill(); await closed; }
  }
}

test("music HTTP streaming supports mobile byte ranges, HEAD and caching", { timeout: 30000 }, () => withServer(async base => {
  for (const [name, size] of files) {
    const url = `${base}/audio/${name}?v=1`, bytes = fs.readFileSync(path.join(__dirname, "audio", name));
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(head.headers.get("content-type"), "audio/mpeg");
    assert.equal(head.headers.get("accept-ranges"), "bytes"); assert.equal(head.headers.get("content-length"), String(size));
    assert.match(head.headers.get("cache-control"), /public, max-age=86400/); assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const [range, start, end] of [["bytes=0-31", 0, 31], ["bytes=-16", size - 16, size - 1], [`bytes=${size - 8}-`, size - 8, size - 1], [`bytes=${size - 8}-${size + 99}`, size - 8, size - 1]]) {
      const res = await fetch(url, { headers: { Range: range } });
      assert.equal(res.status, 206); assert.equal(res.headers.get("content-range"), `bytes ${start}-${end}/${size}`);
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    for (const range of [`bytes=${size}-`, "bytes=-0", "bytes=20-10", "bytes=", "bytes=0-1,4-5"]) {
      const res = await fetch(url, { headers: { Range: range } }); assert.equal(res.status, 416); assert.equal(res.headers.get("content-range"), `bytes */${size}`); await res.arrayBuffer();
    }
  }
  const code = await fetch(base + "/catan-music.js"); assert.equal(code.headers.get("cache-control"), "no-store"); await code.text();
}));

test("real mobile and desktop audio controls, playback, loop, edition changes and persisted settings", { skip: !process.argv.includes("--browser"), timeout: 120000 }, () => withServer(async base => {
  let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      const NativeAudio = window.Audio, NativeContext = window.AudioContext;
      window.testMedia = []; window.testGains = [];
      window.Audio = function (...args) { const media = new NativeAudio(...args); testMedia.push(media); return media; };
      window.AudioContext = class extends NativeContext { createGain() { const gain = super.createGain(); testGains.push(gain); return gain; } };
      for (const [name, key] of [["CatanMusic", "testMusic"], ["CatanAudio", "testSfx"]]) {
        let api; Object.defineProperty(window, name, { get: () => api, set(value) { api = value; const create = api.create; api.create = (...args) => window[key] = create(...args); } });
      }
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket { constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", e => { const data = JSON.parse(e.data); if (data.type === "state") window.testState = data; }); } };
    });
    const page = await context.newPage(), errors = [], musicRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.url().includes(".mp3")) musicRequests.push(request.url()); });
    await page.goto(base + "/catan.html");
    await page.waitForFunction(() => testSocket?.readyState === 1);
    assert.equal(await page.locator("dialog[open]").count(), 0); assert.equal(musicRequests.length, 0);
    assert.equal(await page.locator("#audioSettings svg").count(), 1);
    assert.equal(await page.evaluate(() => testMedia.length), 0);
    await page.locator("#audioSettings").tap();
    await page.waitForFunction(() => testMedia[0]?.currentTime > .05 && !testMedia[0].paused);
    assert.equal(await page.locator("#musicTrackCredit").textContent(), "Oceanfront");
    assert.equal(await page.locator("#sfxVolume").inputValue(), "60"); assert.equal(await page.locator("#musicVolume").inputValue(), "25");
    assert.ok(Math.abs(await page.evaluate(() => testMedia[0].duration) - 207) < 2);
    const slider = async (id, value) => { await page.locator(id).fill(String(value)); await page.locator(id).dispatchEvent("change"); };
    await slider("#sfxVolume", 37); await slider("#musicVolume", 18);
    assert.deepEqual(await page.evaluate(() => [testSfx.volume, testMusic.volume]), [.37, .18]);
    assert.equal(await page.locator("#sfxVolumeValue").textContent(), "37%");
    assert.ok(await page.evaluate(() => testGains.some(g => Math.abs(g.gain.value - .18) < .001)));
    assert.ok(await page.evaluate(async () => {
      const node = testGains.find(g => Math.abs(g.gain.value - .18) < .001), analyser = node.context.createAnalyser();
      node.connect(analyser); const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      for (let i = 0; i < 10; i++) { await new Promise(resolve => setTimeout(resolve, 40)); analyser.getFloatTimeDomainData(samples); peak = Math.max(peak, ...samples.map(Math.abs)); }
      node.disconnect(analyser); return peak > .0001;
    }), "The decoded music must reach the output gain, not just advance a silent timer");
    await page.locator("#sfxEnabled").uncheck(); assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => testMedia[0].paused), false);
    await page.locator("#musicEnabled").uncheck(); assert.equal(await page.evaluate(() => testMedia[0].paused), true);
    await page.locator("#sfxEnabled").check(); assert.equal(await page.evaluate(() => testMedia[0].paused), true);
    await page.locator("#musicEnabled").check(); await page.waitForFunction(() => !testMedia[0].paused);
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 740, height: 320 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      const fits = await page.evaluate(() => {
        const dialog = document.querySelector("#audioSettingsDialog"), r = dialog.getBoundingClientRect();
        const header = document.querySelector(".island-header");
        const controls = [...dialog.querySelectorAll("input,button")];
        return { viewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, scroll: dialog.scrollWidth <= dialog.clientWidth + 1, controls: controls.every(el => { const b = el.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right; }), header: header.scrollWidth <= header.clientWidth + 1 };
      });
      assert.deepEqual(fits, { viewport: true, scroll: true, controls: true, header: true }, JSON.stringify(viewport));
      await page.screenshot({ path: path.join(__dirname, `test-results/catan-audio-settings-${viewport.width}.png`) });
      if (viewport.height < 400) {
        await page.locator("#sfxVolume").scrollIntoViewIfNeeded();
        assert.ok(await page.locator("#sfxVolume").evaluate(el => { const r = el.getBoundingClientRect(), body = el.closest(".audio-settings-body").getBoundingClientRect(); return r.top >= body.top && r.bottom <= body.bottom; }), "Short landscape screens can scroll to the sound-effects control");
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#audioSettingsDialog > [data-close]').click();
    await page.locator('[data-edition="seafarers"]').tap();
    await page.waitForFunction(() => testMedia[0].src.includes("harbor-morning") && testMedia[0].currentTime > .05 && !testMedia[0].paused);
    assert.ok(Math.abs(await page.evaluate(() => testMedia[0].duration) - 59) < 2);
    assert.equal(await page.evaluate(() => testMedia.length), 1);
    await page.evaluate(() => { testMedia[0].currentTime = testMedia[0].duration - .15; });
    await page.waitForFunction(() => testMedia[0].currentTime < 1 && !testMedia[0].paused);
    await page.evaluate(() => { testMedia[0].currentTime = 10; });
    await page.locator("#name").fill("Music test"); await page.locator("#create").click();
    await page.locator("#lobby").waitFor();
    assert.equal(await page.evaluate(() => testMusic.track.title), "Harbor Morning");
    assert.ok(await page.evaluate(() => testMedia[0].currentTime >= 10), "Room renders must not restart the track");
    await page.locator("#audioSettings").tap(); await slider("#musicVolume", 0);
    assert.equal(await page.evaluate(() => testMedia[0].paused), true);
    await page.locator("#musicEnabled").uncheck(); await page.locator("#sfxEnabled").uncheck();
    await page.reload(); await page.waitForFunction(() => window.testMusic && window.testSfx);
    assert.deepEqual(await page.evaluate(() => [testMusic.enabled, testMusic.volume, testSfx.muted, testSfx.volume, testMedia.length]), [false, 0, true, .37, 0]);
    await page.locator("#audioSettings").tap(); assert.equal(await page.locator("#sfxVolumeValue").textContent(), "37%");
    assert.equal(await page.evaluate(() => testMedia.length), 0);
    assert.deepEqual(errors, []);
    await context.close();
    const broken = await browser.newContext();
    await broken.route("**/*.mp3?*", route => route.fulfill({ status: 404, body: "missing" }));
    const fallback = await broken.newPage(); await fallback.goto(base + "/catan.html?edition=seafarers");
    await fallback.locator("#audioSettings").click(); await fallback.locator("#musicError").waitFor();
    await fallback.locator('#audioSettingsDialog > [data-close]').click(); await fallback.locator("#name").fill("Still playable"); await fallback.locator("#create").click();
    await fallback.locator("#lobby").waitFor(); await broken.close();
  } finally { await browser.close(); }
}));
