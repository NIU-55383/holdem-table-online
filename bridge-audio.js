"use strict";
window.BridgeAudio = {
  create() {
    const base = window.BoardGameAudio, sounds = { ...base.durations, bid: .22, card: .12, trick: .4, turn: .45, victory: 1.05 };
    return base.create({ storagePrefix: "bridge", sounds, render(ctx, destination, kind) {
      if (kind.startsWith("reaction-")) return base.synthesize(ctx, destination, kind);
      const nodes = [], start = ctx.currentTime;
      const tones = kind === "victory" ? [523, 659, 784, 1047] : kind === "turn" ? [659, 880] : kind === "trick" ? [440, 660] : kind === "bid" ? [570] : [180];
      tones.forEach((frequency, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), at = start + i * .15, length = kind === "card" ? .07 : .2;
        osc.type = kind === "card" ? "triangle" : "sine"; osc.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.001, at); gain.gain.linearRampToValueAtTime(.16, at + .009); gain.gain.exponentialRampToValueAtTime(.001, at + length);
        osc.connect(gain); gain.connect(destination); osc.start(at); osc.stop(at + length + .01);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); }; nodes.push(osc);
      });
      return { duration: sounds[kind], stop() { nodes.forEach((n) => { try { n.stop(); n.disconnect(); } catch {} }); } };
    } });
  }
};
