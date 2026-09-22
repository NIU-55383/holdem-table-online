"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CatanAudio = api;
})(typeof window === "object" ? window : globalThis, function () {
  const durations = { click: .07, road: .4, settlement: .65, city: .95, ship: 1.05, robber: .6, pirate: .9, monopoly: .85, plenty: .85, roads: .7, knight: .55, victory: 1.85, trade: .65, gold: .85, exchange: .45, dice: .55, cancel: .18 };
  const banks = new WeakMap();
  function noiseBuffer(ctx) {
    if (!banks.has(ctx)) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
      let seed = 73013;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
      banks.set(ctx, buffer);
    }
    return banks.get(ctx);
  }
  // Small, local Foley-style layers. No media downloads or speech synthesis.
  function synthesize(ctx, destination, kind, start = ctx.currentTime) {
    if (!durations[kind]) return null;
    const output = ctx.createGain(), nodes = new Set([output]); output.gain.value = .65; output.connect(destination);
    let sources = 0;
    function voice(source, level, at, length, attack, filter) {
      const gain = ctx.createGain(), when = start + at;
      nodes.add(source); nodes.add(gain); sources++;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + attack);
      gain.gain.exponentialRampToValueAtTime(.0001, when + length);
      if (filter) { nodes.add(filter); source.connect(filter); filter.connect(gain); } else source.connect(gain);
      gain.connect(output); source.start(when); source.stop(when + length + .01);
      source.onended = () => { source.disconnect(); gain.disconnect(); filter?.disconnect(); nodes.delete(source); if (!--sources) output.disconnect(); };
    }
    function tone(at, length, frequency, level = .15, type = "sine", end = frequency) {
      const osc = ctx.createOscillator(); osc.type = type;
      osc.frequency.setValueAtTime(frequency, start + at); osc.frequency.exponentialRampToValueAtTime(end, start + at + length);
      voice(osc, level, at, length, Math.min(.012, length / 4));
    }
    function noise(at, length, frequency, level = .15, end = frequency, type = "bandpass", attack = .005) {
      const source = ctx.createBufferSource(); source.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.Q.value = .7;
      filter.frequency.setValueAtTime(frequency, start + at); filter.frequency.exponentialRampToValueAtTime(end, start + at + length);
      voice(source, level, at, length, Math.min(attack, length / 2), filter);
    }
    function hammer(at, heavy = false) {
      tone(at, .16, heavy ? 115 : 235, .25, "triangle", heavy ? 70 : 150);
      tone(at, .07, heavy ? 730 : 1380, .06);
      noise(at, .075, heavy ? 650 : 1700, .2);
    }
    function bell(at, frequency, length = .35, level = .18) {
      tone(at, length, frequency, level); tone(at, length * .55, frequency * 2.76, level * .22);
    }
    switch (kind) {
      case "click": tone(0, .045, 920, .07, "triangle", 620); break;
      case "road": [0,.11,.23].forEach(at => { noise(at,.12,480,.36,260,"lowpass"); tone(at,.07,90,.13,"triangle",65); }); break;
      case "settlement": [0,.19,.4].forEach(at => hammer(at)); break;
      case "city": [0,.15,.32].forEach(at => hammer(at,true)); bell(.53,784,.34,.13); bell(.62,1047,.3,.11); break;
      case "ship":
        noise(0,.8,700,.25,3100,"bandpass",.2); // Sail unfurling, timber creak, then a small wake.
        tone(.14,.3,190,.09,"triangle",290); tone(.25,.24,130,.07,"triangle",95);
        noise(.5,.5,1200,.24,380,"lowpass",.07); break;
      case "robber": tone(0,.35,230,.2,"triangle",65); tone(.19,.36,155,.16,"sine",52); noise(.05,.35,1800,.1,350); break;
      case "pirate":
        [146.83,196].forEach(f => tone(.04,.54,f,.1,"triangle",f*.94));
        noise(0,.8,450,.3,1300,"lowpass",.16); bell(.55,370,.25,.08); break;
      case "monopoly": noise(0,.4,280,.22,3600,"bandpass",.16); [1568,1318,1047,784].forEach((f,i) => bell(.25+i*.1,f,.26,.14)); tone(.57,.22,110,.16,"triangle"); break;
      case "plenty": noise(0,.55,2800,.07,1400); [523,659,784,1047].forEach((f,i) => bell(i*.14,f,.38,.15)); break;
      case "roads": noise(0,.24,2400,.25,700); [.22,.43].forEach(at => { noise(at,.12,1200,.23); tone(at,.17,340,.16,"triangle",260); }); break;
      case "knight": noise(0,.12,2500,.18); [587,880].forEach(f => bell(.06,f,.43,.15)); break;
      case "victory":
        [523,659,784,1047].forEach((f,i) => bell(i*.18,f,.4,.19));
        [523,659,784,1047].forEach(f => tone(.9,.85,f,.07,"triangle")); break;
      case "trade": bell(0,880,.24,.23); bell(.18,1175,.34,.23); bell(.38,1568,.24,.13); break;
      case "gold": [1318,1760,2093].forEach((f,i) => bell(i*.19,f,.43,.19)); tone(.38,.4,659,.08); break;
      case "exchange": bell(0,1397,.25,.13); bell(.13,1865,.27,.12); break;
      case "dice": [0,.07,.16,.28,.4].forEach(at => { noise(at,.06,1500,.18); tone(at,.07,430,.12,"triangle",220); }); break;
      case "cancel": tone(0,.15,440,.09,"sine",220); break;
    }
    return { duration: durations[kind], stop() { for (const node of nodes) { try { node.stop?.(); node.disconnect(); } catch {} } nodes.clear(); } };
  }
  function create() {
    let ctx, compressor, volume, muted = false, unlocked = false, lastClick = -Infinity;
    const playing = new Set();
    try { muted = localStorage.getItem("catan-muted") === "true"; } catch {}
    function stop() { for (const voice of playing) { clearTimeout(voice.timer); voice.stop(); } playing.clear(); }
    function unlock() {
      unlocked = true;
      if (muted) return;
      try {
        if (!ctx) {
          const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Audio) return;
          ctx = new Audio(); compressor = ctx.createDynamicsCompressor(); volume = ctx.createGain();
          compressor.threshold.value = -14; compressor.ratio.value = 8; volume.gain.value = .6;
          compressor.connect(volume); volume.connect(ctx.destination);
        }
        if (ctx.state !== "running") ctx.resume().catch(() => {});
      } catch {}
    }
    function play(kind) {
      if (muted || !unlocked || !ctx || ctx.state !== "running" || globalThis.document?.hidden || !durations[kind]) return false;
      if (kind === "click") { if (ctx.currentTime - lastClick < .07) return false; lastClick = ctx.currentTime; }
      if (kind === "victory") stop();
      if (playing.size >= 4) { const oldest = playing.values().next().value; clearTimeout(oldest.timer); oldest.stop(); playing.delete(oldest); }
      try {
        const voice = synthesize(ctx, compressor, kind); if (!voice) return false;
        playing.add(voice); voice.timer = setTimeout(() => playing.delete(voice), (voice.duration + .1) * 1000);
        return true;
      } catch { return false; }
    }
    function setMuted(value) {
      muted = Boolean(value); stop();
      try { localStorage.setItem("catan-muted", String(muted)); } catch {}
      if (!muted) unlock();
    }
    return { play, unlock, stop, setMuted, get muted() { return muted; } };
  }
  function incoming(room) {
    const game = room?.game, trade = game?.trade, you = room?.you;
    return Boolean(game?.phase === "main" && !room.control?.paused && game.players[you] && trade && trade.from === game.current && trade.from !== you && (trade.to == null || trade.to === you) && !trade.rejected.includes(you));
  }
  function tracker(play) {
    let previous = null;
    return {
      reset() { previous = null; },
      update(room) {
        const g = room?.game, before = previous;
        previous = g ? { code: room.code, you: room.you, revision: g.revision, phase: g.phase, effect: g.effect?.id, trade: g.trade?.id, gold: goldKey(room) } : null;
        if (!before || !g || before.code !== room.code || before.you !== room.you || g.revision < before.revision || (before.phase === "over" && g.phase !== "over")) return;
        if (g.effect?.id > before.revision && g.effect.id <= g.revision && g.effect.id !== before.effect) play(g.effect.sound);
        if (incoming(room) && g.trade.id !== before.trade) play("trade");
        if (goldChoice(room) && previous.gold !== before.gold) play("gold");
      }
    };
  }
  function goldKey(room) {
    const g = room?.game, choice = g?.goldQueue?.[0];
    return g?.phase === "gold" && g.legal?.gold > 0 && choice?.id === room.you ? `${g.turn}:${choice.id}:${choice.count}` : "";
  }
  function goldChoice(room) {
    return Boolean(goldKey(room) && !room.control?.paused && !room.control?.auto);
  }
  return { create, synthesize, tracker, incoming, goldChoice, durations };
});
