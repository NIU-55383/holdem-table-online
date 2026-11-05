"use strict";
// Edition-specific resolution. Common escrow, deals and private views stay in the main engine.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.Million2024 = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function modernEdition(Data, H) {
  const { rule, clone, slots, log, moveCash } = H;
  const order = Data.MODERN_ROLE_IDS;
  const survivors = g => slots(g).filter(s => s.role && !s.withdrawn && ["active", "sharing"].includes(s.status));
  const clockwise = (g, indices) => indices.slice().sort((a, b) =>
    ((a - g.leader - 1 + g.players.length) % g.players.length) - ((b - g.leader - 1 + g.players.length) % g.players.length));
  function take(g, s, wanted, type) {
    const amount = Math.min(wanted, g.lootPool);
    g.lootPool -= amount;
    g.players[s.owner].cash += amount;
    log(g, type, `${g.players[s.owner].name}的${Data.MODERN_ROLES[s.role].zh}从中央拿走${amount}万。`,
      `${g.players[s.owner].name}'s ${Data.MODERN_ROLES[s.role].en} takes $${amount / 100}M from the center.`, { owner: s.owner, slot: s.slot, amount });
  }
  function steal(g, from, to) {
    const amount = moveCash(g, from.owner, to.owner, 200);
    log(g, "mentalist-steal", `${g.players[to.owner].name}从${g.players[from.owner].name}处拿走${amount}万。`,
      `${g.players[to.owner].name} takes $${amount / 100}M from ${g.players[from.owner].name}.`, { from: from.owner, to: to.owner, amount });
  }
  function finish(g) {
    const participants = survivors(g), splitting = [...new Set(participants.map(s => s.owner))];
    let totalLoot = 0, share = 0, penalty = 0, topUp = 0;
    if (participants.length === 1 && participants[0].role === "tech") {
      const s = participants[0], p = g.players[s.owner];
      penalty = Math.min(500, p.cash); p.cash -= penalty; g.reserve += penalty;
      p.slots[s.slot].status = "alone";
      log(g, "tech-alone", `${p.name}的技术员独自留下，损失${penalty}万，不分赃。`, `${p.name}'s lone Tech loses $${penalty / 100}M and receives no loot.`, { owner: s.owner, amount: penalty });
      splitting.length = 0;
    } else if (participants.length) {
      for (const s of participants) if (s.role === g.bonusRole) {
        g.lootPool += 100; g.reserve -= 100;
        log(g, "pool-bonus", `${Data.MODERN_ROLES[s.role].zh}奖励：中央增加100万。`, `${Data.MODERN_ROLES[s.role].en} bonus: add $1M to the center.`, { role: s.role, amount: 100 });
      }
      totalLoot = g.lootPool;
      share = Math.ceil(totalLoot / participants.length / 100) * 100;
      topUp = share * participants.length - totalLoot;
      g.reserve -= topUp; g.lootPool += topUp;
      for (const s of participants) {
        const actual = g.players[s.owner].slots[s.slot]; actual.status = "sharing"; actual.share = share;
        take(g, s, share, "payout");
      }
      log(g, "split", `${participants.length}个角色各分${share}万；储备补足${topUp}万。`, `${participants.length} roles receive $${share / 100}M each; reserve rounding adds $${topUp / 100}M.`, { totalLoot, share, topUp });
    } else log(g, "no-share", "无人留下，余款退回储备。", "Nobody remains; the remaining pot returns to the reserve.");
    g.reserve += g.lootPool; g.lootPool = 0;
    for (const o of g.offers) if (o.status === "pending") o.status = "expired";
    for (const s of slots(g)) log(g, "role-result", `${g.players[s.owner].name}：${Data.MODERN_ROLES[s.role].zh}。`, `${g.players[s.owner].name}: ${Data.MODERN_ROLES[s.role].en}.`, { owner: s.owner, slot: s.slot, role: s.role, status: s.status });
    g.result = { round: g.round, leader: g.leader, loot: g.loot, ante: g.ante, bonusRole: g.bonusRole,
      revealedCards: g.revealedCards.slice(), namedRole: g.snitch?.role || null, totalLoot, share, remainder: 0, penalty, topUp,
      participants: participants.map(s => ({ owner: s.owner, slot: s.slot, role: s.role })), splitting,
      players: g.players.map(p => ({ name: p.name, cash: p.cash, delta: p.cash - p.roundStartCash, slots: clone(p.slots) })), logs: clone(g.logs), privateIntel: clone(g.intel) };
    g.history.push(clone(g.result));
    const highest = Math.max(...g.players.map(p => p.cash));
    if (highest >= 5000 || g.round === 5) {
      g.winners = clockwise(g, g.players.flatMap((p, i) => p.cash === highest ? [i] : [])).slice(0, 1);
      g.winReason = highest >= 5000 ? "target" : "round-limit"; g.phase = "over";
    } else {
      const lowest = Math.min(...g.players.map(p => p.cash));
      g.nextLeader = clockwise(g, g.players.flatMap((p, i) => p.cash === lowest ? [i] : []))[0];
      g.phase = "results";
    }
  }
  function advance(g) {
    while (g.heist.cursor < order.length) {
      const role = order[g.heist.cursor++];
      g.heist.revealed.push(role);
      const current = survivors(g).filter(s => s.role === role);
      if (current.length > 1) for (const s of current) g.players[s.owner].slots[s.slot].status = "duplicate";
      if (role === "brute") {
        for (const s of slots(g).filter(s => !s.withdrawn && s.role === "brute")) take(g, s, 200, "brute-take");
      }
      if (current.length !== 1) continue;
      const s = current[0];
      if (role === "tech") {
        const options = [...new Set(g.revealedCards.filter(r => r !== "tech"))];
        g.snitch = { player: s.owner, actor: s.owner, slot: s.slot, options, role: null };
        if (options.length) { g.phase = "snitch"; return; }
      } else if (role === "acrobat") take(g, s, 500, "acrobat-take");
      else if (role === "mentalist") {
        const targets = survivors(g).filter(t => ["tech", "acrobat", "brute"].includes(t.role)).map(t => ({ owner: t.owner, slot: t.slot, role: t.role }));
        if (targets.length) { g.mentalist = { actor: s.owner, slot: s.slot, targets }; g.phase = "mentalist"; return; }
      } else if (role === "brain") {
        g.lootPool += g.loot; g.reserve -= g.loot;
        log(g, "brain-add", `谋士向中央再加${g.loot}万。`, `The Brain adds another $${g.loot / 100}M to the center.`, { owner: s.owner, amount: g.loot });
      } else if (role === "driver") take(g, s, survivors(g).length * 100, "driver-take");
    }
    finish(g);
  }
  function beginHeist(g) {
    g.vote.open = false;
    for (const o of g.offers) if (o.status === "pending") o.status = "expired";
    g.lootPool += g.publicFund; g.publicFund = 0;
    g.heist = { cursor: 0, revealed: [] };
    advance(g);
  }
  function maybeHeist(g) {
    if (g.phase !== "negotiation" || !g.vote.open) return;
    if (g.vote.votes.filter(v => v === true).length >= Math.ceil(g.players.length / 2)) return beginHeist(g);
    if (g.vote.votes.every(v => v !== null)) {
      g.vote.open = false;
      log(g, "vote-failed", "赞成未达半数，继续谈判。", "Fewer than half voted yes; negotiations continue.");
    }
  }
  function perform(g, actor, a) {
    if (a.type === "claim") {
      rule(g.phase === "claims" && g.claimActor === actor, "请按带头人起的顺序声明 / Wait for your declaration turn");
      rule(Array.isArray(a.roles) && a.roles.length === g.slotsPerPlayer && a.roles.every(r => g.availableRoles.includes(r)), "声明身份无效 / Invalid declared roles");
      g.claims[actor] = a.roles.slice();
      log(g, "claim", `${g.players[actor].name}声称：${a.roles.map(r => Data.MODERN_ROLES[r].zh).join("、")}。`, `${g.players[actor].name} claims: ${a.roles.map(r => Data.MODERN_ROLES[r].en).join(", ")}.`, { owner: actor, roles: a.roles.slice() });
      if (g.claims.every(Boolean)) { g.phase = "negotiation"; g.claimActor = null; }
      else g.claimActor = (actor + 1) % g.players.length;
    } else if (a.type === "callVote") {
      rule(g.phase === "negotiation" && actor === g.leader && !g.vote.open, "仅带头人可发起开车投票 / Only the leader can call a vote");
      g.vote = { open: true, votes: g.players.map(() => null), attempt: g.vote.attempt + 1 };
      g.vote.votes[actor] = true;
      maybeHeist(g);
    } else if (a.type === "vote") {
      rule(g.phase === "negotiation" && g.vote.open && typeof a.yes === "boolean" && g.vote.votes[actor] === null, "投票无效或已投票 / Vote unavailable or already cast");
      g.vote.votes[actor] = a.yes; maybeHeist(g);
    } else if (a.type === "snitch") {
      rule(g.phase === "snitch" && g.snitch.actor === actor && g.snitch.options.includes(a.role), "点名无效 / Invalid role to eliminate");
      g.snitch.role = a.role;
      for (const s of survivors(g).filter(s => s.role === a.role)) g.players[s.owner].slots[s.slot].status = "eliminated";
      log(g, "snitch", `技术员点名${Data.MODERN_ROLES[a.role].zh}。`, `The Tech eliminates ${Data.MODERN_ROLES[a.role].en}.`, { role: a.role });
      advance(g);
    } else if (a.type === "steal") {
      rule(g.phase === "mentalist" && g.mentalist.actor === actor, "现在不能使用读心者 / Mentalist cannot act now");
      const target = g.mentalist.targets.find(t => t.owner === a.target && t.slot === a.slot);
      rule(target, "请选择仍在场的合法目标 / Choose a surviving eligible target");
      steal(g, target, { owner: actor }); g.mentalist = null; advance(g);
    } else if (["ready", "threat"].includes(a.type)) rule(false, "新版不使用此操作 / This action belongs to the 2016 edition");
    else return false;
    return true;
  }
  return { perform, beginHeist, maybeHeist };
});
