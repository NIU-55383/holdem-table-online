"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./million-data"));
  else root.MillionBot = factory(root.MillionData);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Data) {
  const modern = g => g.edition === "2024";
  const live = p => p.slots.filter(s => !s.withdrawn);
  function temperament(g, actor) {
    let hash = actor + 7;
    for (const c of g.players[actor].name) hash = (Math.imul(hash, 31) + c.codePointAt(0)) >>> 0;
    return { bluff: .18 + (hash % 5) * .07, caution: .75 + (hash % 7) * .08 };
  }
  function claims(g, chat = []) {
    const found = new Map(), roles = Data.rolesForEdition(g.edition);
    (g.claims || []).forEach((list, i) => { if (list) found.set(i, list); });
    for (const m of chat) {
      if (m.round !== g.round || !Number.isInteger(m.playerId)) continue;
      if (g.claims?.[m.playerId]) continue;
      const text = String(m.text || "");
      const list = g.availableRoles.filter(r => new RegExp(`(?:我是|我选的是|I(?:'m| am)|I claim)\\s*(?:${roles[r].zh}|${roles[r].en})`, "i").test(text));
      if (list.length) found.set(m.playerId, list);
    }
    return found;
  }
  function risk(g, actor, role, removed = -1, chat = []) {
    const declared = claims(g, chat), own = live(g.players[actor]).filter(s => s.role === role).length;
    const others = g.players.flatMap((p, i) => i === actor || i === removed ? [] : live(p).map(s => ({ ...s, owner: i })));
    if (!others.length) return 0;
    if (others.some(s => s.role === role)) return .99;
    const knownOut = g.players.flatMap(p => p.slots).filter(s => s.withdrawn && s.role === role).length;
    const shown = g.revealedCards.filter(r => r === role).length - own - knownOut;
    const unknownOut = g.players.flatMap(p => p.slots).filter(s => s.withdrawn && !s.role).length + (removed >= 0 ? live(g.players[removed]).length : 0);
    let value = shown > 0 ? Math.max(.18, .95 - unknownOut * .23) : .18;
    if (others.some(s => declared.get(s.owner)?.includes(role))) value = Math.min(.98, value + .22);
    return value;
  }
  function value(g, actor, s, removed = -1, chat = []) {
    const remaining = g.players.flatMap((p, i) => i === removed ? [] : live(p));
    const n = Math.max(1, Math.min(g.availableRoles.length, remaining.length * .67));
    const collision = risk(g, actor, s.role, removed, chat), survival = 1 - collision;
    const bonus = g.bonusRole === s.role ? 100 : 0;
    let share = g.loot / n, extra = 0, downside = g.ante;
    if (modern(g)) {
      share = Math.max(0, g.loot + g.publicFund - 600) / n;
      if (s.role === "acrobat") extra = 500;
      if (s.role === "driver") extra = n * 100;
      if (s.role === "brain") extra = g.loot / n;
      if (s.role === "mentalist") extra = remaining.length > 2 ? 170 : 80;
      if (s.role === "tech" && remaining.length <= 2) share = -400;
      if (s.role === "brute") return survival * (share + bonus / n) - 25;
      return survival * (share + extra + bonus / n) - downside;
    }
    if (s.role === "driver") extra = Math.max(0, n - 1) * 100;
    if (s.role === "mastermind") extra = 200 / n;
    if (s.role === "crook") extra = 120;
    if (s.role === "brute") { extra = 40 - (g.availableRoles.includes("crook") ? 70 : 0); downside = 0; if (!g.settings.bruteShares) share = 0; }
    if (s.role === "snitch" && remaining.length <= 2) share = -250;
    return survival * (share + bonus + extra) - collision * downside;
  }
  function declaration(g, actor, rand) {
    const p = g.players[actor], style = temperament(g, actor);
    return p.slots.map(s => {
      const bluff = style.bluff + (["snitch", "tech", "mentalist", "crook"].includes(s.role) ? .2 : 0);
      const pool = g.availableRoles.filter(r => r !== s.role && (!g.settings.noRepeat || !p.lastRoles?.includes(r)));
      return rand() < bluff && pool.length ? pool[Math.floor(rand() * pool.length)] : s.role;
    });
  }
  function choose(g, actor, rand, chat = []) {
    const p = g.players[actor], style = temperament(g, actor);
    if (g.phase === "planning" && !p.locked) {
      const history = g.history.slice(-3).flatMap(h => h.players.flatMap((p, i) => i === actor ? [] : p.slots.map(s => s.role)));
      const pool = g.availableRoles.filter(r => !g.settings.noRepeat || !p.lastRoles.includes(r));
      const picks = pool.map(role => ({ role, score: rand() * 3 + (g.bonusRole === role ? .8 : 0)
        - history.filter(r => r === role).length * .25
        + (modern(g) && role === "acrobat" ? .8 : 0) + (role === "brute" && p.cash <= g.ante * 2 ? 1.1 : 0) }));
      return { type: "choose", roles: picks.sort((a, b) => b.score - a.score).slice(0, g.slotsPerPlayer).map(x => x.role) };
    }
    if (g.phase === "claims" && g.claimActor === actor) return { type: "claim", roles: declaration(g, actor, rand) };
    if (g.phase === "results" && actor === g.leader) return { type: "next" };
    if (g.phase === "mentalist" && g.mentalist.actor === actor) {
      const target = g.mentalist.targets.slice().sort((a, b) =>
        (b.owner === actor ? -1 : Math.min(200, g.players[b.owner].cash) + g.players[b.owner].cash / 100)
        - (a.owner === actor ? -1 : Math.min(200, g.players[a.owner].cash) + g.players[a.owner].cash / 100))[0];
      return { type: "steal", target: target.owner, slot: target.slot };
    }
    if (g.phase === "snitch" && g.snitch.actor === actor) {
      const declared = claims(g, chat), own = live(p).map(s => s.role);
      const scored = g.snitch.options.map(role => {
        let score = rand() * 20 - (own.includes(role) ? 2000 : 0);
        g.players.forEach((other, i) => {
          if (i === actor || !live(other).length) return;
          const chance = live(other).some(s => s.role === role) ? 1 : declared.get(i)?.includes(role) ? .65 : .15;
          score += chance * (other.cash / 12 + (role === "acrobat" ? 250 : role === "driver" ? 130 : role === "brute" ? -50 : 70));
        });
        const activeCount = g.players.flatMap(live).length;
        if (activeCount <= 2 && g.revealedCards.filter(r => r === role).length) score -= 1500;
        return { role, score };
      });
      return { type: "snitch", role: scored.sort((a, b) => b.score - a.score)[0].role };
    }
    if (g.phase !== "negotiation") return null;
    const offer = g.offers.find(o => o.status === "pending" && o.responder === actor);
    if (offer) {
      const estimate = offer.quitter === actor ? value(g, actor, p.slots[offer.slot], -1, chat) :
        live(p).reduce((sum, s) => sum + value(g, actor, s, offer.quitter, chat) - value(g, actor, s, -1, chat), 0);
      return { type: "respond", offerId: offer.id, accept: offer.quitter === actor ? offer.amount >= Math.max(100, estimate * style.caution) : offer.amount <= Math.max(0, estimate) && p.cash >= offer.amount };
    }
    if (modern(g) && g.vote.open && g.vote.votes[actor] === null) return { type: "vote", yes: true };
    if (!modern(g) && (p.ready || !live(p).length)) return null;
    if (modern(g) && g.vote.open) return null;
    if (p.threats > 0) {
      const targets = g.players.flatMap((other, i) => i === actor ? [] : live(other).filter(s => !s.role).map(s => ({ target: i, slot: s.slot, cash: other.cash })));
      if (targets.length) { const t = targets.sort((a, b) => b.cash - a.cash)[0]; return { type: "threat", target: t.target, slot: t.slot }; }
    }
    const sent = g.offers.filter(o => o.proposer === actor), declared = claims(g, chat);
    const risky = live(p).find(s => value(g, actor, s, -1, chat) < 80 * style.caution);
    if (risky && !sent.length) {
      const payer = g.players.map((other, i) => ({ i, cash: other.cash, match: declared.get(i)?.includes(risky.role) }))
        .filter(o => o.i !== actor && o.cash >= 100 && live(g.players[o.i]).length).sort((a, b) => Number(b.match) - Number(a.match) || b.cash - a.cash)[0];
      if (payer) return { type: "offer", payer: payer.i, quitter: actor, slot: risky.slot, amount: 100 };
    }
    if (sent.some(o => o.status === "pending")) return modern(g) && actor === g.leader ? { type: "callVote" } : modern(g) ? null : { type: "ready", ready: true };
    if (risky && sent.length) return { type: "withdraw", slot: risky.slot };
    if (!sent.length && p.cash >= 100) {
      const targets = g.players.flatMap((other, i) => i === actor ? [] : live(other).map(s => ({ i, s,
        gain: live(p).reduce((sum, mine) => sum + value(g, actor, mine, i, chat) - value(g, actor, mine, -1, chat), 0) })));
      targets.sort((a, b) => b.gain - a.gain);
      if (targets[0]?.gain > 150) return { type: "offer", payer: actor, quitter: targets[0].i, slot: targets[0].s.slot, amount: 100 };
    }
    if (modern(g)) return actor === g.leader ? { type: "callVote" } : null;
    return { type: "ready", ready: true };
  }
  function speech(g, actor, rand) {
    if (g.phase !== "negotiation" || !live(g.players[actor]).length) return null;
    const roles = Data.rolesForEdition(g.edition), claimed = modern(g) ? g.claims[actor] : declaration(g, actor, rand);
    if (!claimed?.length) return null;
    const r = claimed[0];
    const lines = {
      driver: ["车我来开，别挤同一个身份。", "I'll drive. Let's avoid a duplicate."],
      brute: ["这轮我扛得住，想让我退出得谈个价。", "I can afford to stay. Pay me if you want me out."],
      crook: ["暴徒留下也行，我不急着走。", "The Brute can stay. I'm in no hurry to leave."],
      mentalist: ["场上有我想找的人，我先留下。", "Someone here is worth watching. I'm staying."],
      tech: ["别急着撞车，等会儿我会点名。", "Don't rush into a clash. I'll name a role later."],
      snitch: ["别急着撞车，等会儿我会点名。", "Don't rush into a clash. I'll name a role later."],
      acrobat: ["我先拿一份，退出的价钱不能太低。", "I get paid first. Leaving won't come cheap."],
      brain: ["留我在场，大家能分的钱更多。", "Keep me in and there's more money to split."],
      mastermind: ["留我在场，大家能分的钱更多。", "Keep me in and there's more money to split."]
    };
    return `我是${roles[r].zh}。${lines[r][0]} / I am ${roles[r].en}. ${lines[r][1]}`;
  }
  return Object.freeze({ choose, speech, declaration });
});
