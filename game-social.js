"use strict";
const crypto = require("node:crypto");
const Data = require("./social-data");
const identities = new WeakMap(), lastSent = new WeakMap();
function publicId(player) {
  if (!identities.has(player)) identities.set(player, crypto.randomUUID());
  return identities.get(player);
}
function reaction(room, players, sender, request, now = Date.now()) {
  const target = players.find((p) => p && !p.departed && !p.vacant && publicId(p) === request.target);
  if (!players.includes(sender) || sender.departed || sender.vacant || !target || target === sender || !Object.hasOwn(Data.reactions, request.kind)) {
    throw new Error("互动对象或表情无效 / Invalid player or reaction");
  }
  if (now - (lastSent.get(sender) ?? -Infinity) < Data.COOLDOWN) throw new Error("慢一点，稍后再发 / Please wait before sending again");
  lastSent.set(sender, now);
  // Transient room events do not change game revisions, timers or hidden information.
  return { type: "reaction", room: room.code, id: crypto.randomUUID(), from: publicId(sender), to: publicId(target), kind: request.kind,
    fromName: sender.name, toName: target.name, time: now };
}
module.exports = { publicId, reaction };
