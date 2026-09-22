"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CatanMusic = api;
})(typeof window === "object" ? window : globalThis, function () {
  const tracks = Object.freeze({
    base: { title: "Oceanfront", artist: "PeriTune", src: "audio/peritune-oceanfront.mp3?v=1", source: "https://peritune.com/blog/2026/06/17/oceanfront/" },
    seafarers: { title: "Harbor Morning", artist: "PeriTune", src: "audio/peritune-harbor-morning.mp3?v=1", source: "https://peritune.com/blog/2026/07/18/harbor_morning/" }
  });
  function create(env = globalThis) {
    let edition = "base", enabled = true, volume = .25, unlocked = false, suspended = false;
    let media, ctx, gain, pending = false, generation = 0, failed = false, changed = () => {};
    try {
      enabled = env.localStorage.getItem("catan-music-enabled") !== "false";
      const saved = env.localStorage.getItem("catan-music-volume");
      if (saved !== null && saved !== undefined && saved !== "" && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)));
    } catch {}
    function save(key, value) { try { env.localStorage.setItem(key, String(value)); } catch {} }
    const wanted = () => unlocked && enabled && volume > 0 && !suspended && !env.document?.hidden;
    function pause() { generation++; pending = false; media?.pause(); }
    function sync() {
      if (!wanted()) { pause(); changed(); return; }
      try {
        if (!media) {
          if (!env.Audio) return;
          media = new env.Audio(); media.loop = true; media.preload = "none";
          media.addEventListener("error", () => { failed = true; changed(); });
          media.addEventListener("playing", () => { failed = false; changed(); });
          const AudioContext = env.AudioContext || env.webkitAudioContext;
          // A gain node also provides per-app volume on mobile browsers that ignore media.volume.
          if (AudioContext) {
            try {
              ctx = new AudioContext(); gain = ctx.createGain();
              ctx.createMediaElementSource(media).connect(gain); gain.connect(ctx.destination);
            } catch { gain = null; ctx?.close?.().catch(() => {}); ctx = null; }
          }
        }
        if (gain) gain.gain.value = volume; else media.volume = volume;
        const src = tracks[edition].src;
        if (media.getAttribute("src") !== src) { pause(); media.src = src; failed = false; }
        if (ctx && ["suspended", "interrupted"].includes(ctx.state)) ctx.resume().catch(() => {});
        if (pending || !media.paused) return;
        const token = generation; pending = true;
        Promise.resolve(media.play()).then(() => {
          if (token === generation) { pending = false; if (!wanted()) media.pause(); }
        }).catch(error => {
          if (token === generation) { pending = false; failed = error?.name !== "NotAllowedError" && error?.name !== "AbortError"; changed(); }
        });
      } catch { pending = false; failed = true; changed(); }
    }
    return {
      unlock() { unlocked = true; suspended = false; sync(); },
      sync,
      stop() { suspended = true; pause(); },
      setEdition(value) { const next = value === "base" ? "base" : "seafarers"; if (next !== edition) { edition = next; sync(); changed(); } },
      setEnabled(value) { enabled = Boolean(value); save("catan-music-enabled", enabled); sync(); changed(); },
      setVolume(value) { if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(1, value)); save("catan-music-volume", volume); sync(); changed(); },
      onChange(callback) { changed = callback; },
      get track() { return tracks[edition]; },
      get enabled() { return enabled; },
      get volume() { return volume; },
      get failed() { return failed; }
    };
  }
  return { create, tracks };
});
