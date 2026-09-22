"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BoardGameAudio = api;
})(typeof window === "object" ? window : globalThis, function () {
  const durations = Object.freeze({ "reaction-flowers": .8, "reaction-splash": .7, "reaction-heart": .8, "reaction-clap": 1, "reaction-cheers": .85, "reaction-luck": .9 });
  const noiseBuffers = new WeakMap();
  function synthesize(ctx, destination, kind, start = ctx.currentTime) {
    if (!Object.hasOwn(durations, kind)) return null;
    const output = ctx.createGain(), nodes = new Set([output]);
    output.gain.value = .65; output.connect(destination);
    let sources = 0;
    function voice(source, at, length, level, attack = .006, filter = null) {
      const gain = ctx.createGain(), when = start + at;
      nodes.add(source); nodes.add(gain); sources++;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, when + length);
      if (filter) { nodes.add(filter); source.connect(filter); filter.connect(gain); }
      else source.connect(gain);
      gain.connect(output); source.start(when); source.stop(when + length + .01);
      source.onended = () => { source.disconnect(); gain.disconnect(); filter?.disconnect(); nodes.delete(source); if (!--sources) output.disconnect(); };
    }
    function tone(at, length, frequency, level, end = frequency) {
      const osc = ctx.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start + at);
      osc.frequency.exponentialRampToValueAtTime(end, start + at + length);
      voice(osc, at, length, level);
    }
    function noise(at, length, frequency, level, end = frequency, type = "bandpass") {
      if (!noiseBuffers.has(ctx)) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
        let seed = 17351;
        for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
        noiseBuffers.set(ctx, buffer);
      }
      const source = ctx.createBufferSource(); source.buffer = noiseBuffers.get(ctx);
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.Q.value = .8;
      filter.frequency.setValueAtTime(frequency, start + at);
      filter.frequency.exponentialRampToValueAtTime(end, start + at + length);
      voice(source, at, length, level, .004, filter);
    }
    function glass(at, frequency, length, level) {
      tone(at, length, frequency, level);
      tone(at, length * .7, frequency * 1.48, level * .35);
      tone(at, length * .4, frequency * 2.09, level * .16);
    }
    switch (kind) {
      case "reaction-flowers":
        noise(0, .25, 3200, .09, 1700);
        [659, 831, 988].forEach((f, i) => tone(.1 + i * .17, .32, f, .13)); break;
      case "reaction-splash":
        noise(0, .38, 2100, .45, 380, "lowpass");
        [0, .13, .3, .46].forEach((at, i) => tone(at, .17, 1050 + i * 240, .18, 230 + i * 100)); break;
      case "reaction-heart":
        [0, .22, .48, .62].forEach((at, i) => { tone(at, .14, i % 2 ? 145 : 105, .32, 58); tone(at, .1, 210, .07, 120); }); break;
      case "reaction-clap":
        [0, .045, .16, .22, .33, .41, .52, .57, .7, .82].forEach((at, i) => {
          noise(at, .095, 1700 + i % 3 * 750, i % 2 ? .2 : .3);
          tone(at, .045, 360 + i % 3 * 60, .07, 160);
        }); break;
      case "reaction-cheers":
        glass(0, 2350, .55, .16); glass(.17, 2960, .64, .14); break;
      case "reaction-luck":
        [1047, 1319, 1568, 2093, 2637].forEach((f, i) => glass(i * .1, f, .42, .09)); break;
    }
    return { duration: durations[kind], stop() { for (const node of nodes) { try { node.stop?.(); node.disconnect(); } catch {} } nodes.clear(); } };
  }
  function create({ render = synthesize, sounds = durations, storagePrefix = "boardclub" } = {}) {
    let ctx, compressor, volume, level = .6, muted = false, unlocked = false, lastClick = -Infinity;
    const playing = new Set(), muteKey = `${storagePrefix}-muted`, volumeKey = `${storagePrefix}-sfx-volume`;
    try { muted = localStorage.getItem(muteKey) === "true"; } catch {}
    try { const saved = localStorage.getItem(volumeKey); if (saved !== null && saved !== undefined && saved !== "" && Number.isFinite(Number(saved))) level = Math.max(0, Math.min(1, Number(saved))); } catch {}
    function stop() { for (const voice of playing) { clearTimeout(voice.timer); voice.stop(); } playing.clear(); }
    function unlock() {
      unlocked = true;
      if (muted) return;
      try {
        if (!ctx) {
          const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Audio) return;
          ctx = new Audio(); compressor = ctx.createDynamicsCompressor(); volume = ctx.createGain();
          compressor.threshold.value = -14; compressor.ratio.value = 8; volume.gain.value = level;
          compressor.connect(volume); volume.connect(ctx.destination);
        }
        if (ctx.state !== "running") ctx.resume().catch(() => {});
      } catch {}
    }
    function play(kind) {
      if (muted || level === 0 || !unlocked || !ctx || ctx.state !== "running" || globalThis.document?.hidden || !Object.hasOwn(sounds, kind)) return false;
      if (kind === "click") { if (ctx.currentTime - lastClick < .07) return false; lastClick = ctx.currentTime; }
      if (kind === "victory") stop();
      if (playing.size >= 4) { const oldest = playing.values().next().value; clearTimeout(oldest.timer); oldest.stop(); playing.delete(oldest); }
      try {
        const voice = render(ctx, compressor, kind); if (!voice) return false;
        playing.add(voice); voice.timer = setTimeout(() => playing.delete(voice), (voice.duration + .1) * 1000);
        return true;
      } catch { return false; }
    }
    function setMuted(value) {
      muted = Boolean(value); stop();
      try { localStorage.setItem(muteKey, String(muted)); } catch {}
      if (!muted) unlock();
    }
    function setVolume(value) {
      if (!Number.isFinite(value)) return;
      level = Math.max(0, Math.min(1, value));
      if (volume) volume.gain.value = level;
      if (!level) stop();
      try { localStorage.setItem(volumeKey, String(level)); } catch {}
    }
    return { play, unlock, stop, setMuted, setVolume, get volume() { return level; }, get muted() { return muted; } };
  }
  return { create, synthesize, durations };
});
