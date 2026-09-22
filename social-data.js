"use strict";
((root, factory) => {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.GameSocialData = data;
})(typeof window === "object" ? window : globalThis, () => {
  const reactions = Object.freeze({
    flowers: { emoji: "\uD83D\uDC90", label: "送花 / Flowers" },
    splash: { emoji: "\uD83D\uDCA6", label: "泼水 / Splash" },
    heart: { emoji: "\uD83E\uDEF6", label: "比心 / Heart" },
    clap: { emoji: "\uD83D\uDC4F", label: "鼓掌 / Applause" },
    cheers: { emoji: "\uD83E\uDD42", label: "干杯 / Cheers" },
    luck: { emoji: "\uD83C\uDF40", label: "好运 / Good luck" },
  });
  const skins = Object.freeze({
    robber: [
      { id: "classic", art: "robber", label: "经典强盗 / Classic robber" },
      { id: "smile", art: "robber-hood", label: "兜帽强盗 / Hooded robber" },
      { id: "angry", art: "robber-bandana", label: "头巾强盗 / Bandana robber" },
      { id: "red", emoji: "\uD83D\uDC79", label: "红色强盗 / Red robber" },
    ],
    pirate: [
      { id: "classic", art: "pirate", label: "经典海盗船 / Classic pirate ship" },
      { id: "flag", emoji: "\uD83C\uDFF4\u200D\u2620\uFE0F", label: "海盗旗 / Pirate flag" },
      { id: "skull", emoji: "\u2620\uFE0F", label: "骷髅海盗 / Skull and crossbones" },
    ],
  });
  function skin(kind, id) { return skins[kind]?.find((s) => s.id === id) || skins[kind]?.[0]; }
  function normalizeSkins(value) {
    return Object.fromEntries(Object.keys(skins).map((kind) => [kind, skin(kind, value?.[kind]).id]));
  }
  return Object.freeze({ reactions, skins, skin, normalizeSkins, COOLDOWN: 1200 });
});
