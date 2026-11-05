"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./million-data"), require("node:crypto"), require("./million-2024"), require("./million-bot"));
  else root.MillionEngine = factory(root.MillionData, root.crypto, root.Million2024, root.MillionBot);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Data, cryptoSource, Modern, Bot) {
  if (!Data) throw Error("先加载角色资料 / Load million-data.js first");
  const rule = (ok, message) => { if (!ok) throw Error(message); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const seat = (g, index) => Number.isInteger(index) && index >= 0 && index < g.players.length;
  const modern = g => g.edition === "2024";
  const edition = Modern?.(Data, { rule, clone, slots, log, moveCash });
  function randomIndex(size, rng) {
    rule(rng === undefined || typeof rng === "function", "随机源无效 / Invalid random source");
    if (rng !== undefined) {
      const n = rng();
      rule(typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1, "随机值无效 / Random value must be in [0, 1)");
      return Math.floor(n * size);
    }
    if (cryptoSource && typeof cryptoSource.randomInt === "function") return cryptoSource.randomInt(size);
    rule(cryptoSource && typeof cryptoSource.getRandomValues === "function", "需要安全随机源 / Secure randomness unavailable");
    const values = new Uint32Array(1), limit = 0x100000000 - 0x100000000 % size;
    do { cryptoSource.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % size;
  }
  function shuffled(values, rng) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1, rng);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function log(g, type, zh, en, details = {}) { g.logs.push({ type, zh, en, ...details }); }
  function slots(g) {
    return g.players.flatMap((p, owner) => p.slots.map((s, slot) => ({ ...s, owner, slot })));
  }
  function active(g) { return slots(g).filter(s => s.role && !s.withdrawn); }
  function liveSlot(g, owner, index) {
    rule(seat(g, owner) && Number.isInteger(index), "角色槽无效 / Invalid role slot");
    const s = g.players[owner].slots[index];
    rule(s && s.role && !s.withdrawn, "角色已退出或不存在 / Role is withdrawn or absent");
    return s;
  }
  function refund(g, owner, index) {
    const s = g.players[owner].slots[index];
    if (s.refunded) return;
    g.players[owner].cash += g.ante;
    g.publicFund -= g.ante;
    s.refunded = true;
    log(g, "refund", `${g.players[owner].name}的角色${index + 1}取回保证金${g.ante}万。`,
      `${g.players[owner].name}'s role ${index + 1} recovers its $${g.ante / 100}M ante.`, { owner, slot: index, amount: g.ante });
  }
  function moveCash(g, from, to, amount) {
    if (from === to) return 0;
    const paid = Math.min(amount, g.players[from].cash);
    g.players[from].cash -= paid;
    g.players[to].cash += paid;
    return paid;
  }
  function startRound(g, rng) {
    g.phase = "planning";
    g.loot = 800 + 100 * randomIndex(5, rng);
    g.ante = g.loot === 800 ? 100 : g.loot === 1200 ? 200 : 100 + 100 * randomIndex(2, rng);
    g.bonusRole = [null, ...g.availableRoles][randomIndex(g.availableRoles.length + 1, rng)];
    if (modern(g)) {
      // This club deliberately retains the legacy loot amounts and $1M bonuses.
      g.ante = 200;
      const legacyRoles = Data.rolesForCount(Math.min(8, g.players.length));
      const bonus = [null, ...legacyRoles][randomIndex(legacyRoles.length + 1, rng)];
      g.bonusRole = ({ snitch: "tech", crook: "mentalist", mastermind: "brain" })[bonus] || bonus;
      g.lootPool = g.loot; g.reserve -= g.loot;
      g.claims = g.players.map(() => null); g.claimActor = null;
      g.vote = { open: false, votes: g.players.map(() => null), attempt: 0 };
      g.heist = null; g.mentalist = null; g.nextLeader = null;
    }
    g.revealedCards = [];
    g.hiddenCard = null;
    g.offers = [];
    g.snitch = null;
    g.result = null;
    g.logs = [];
    g.intel = g.players.map(() => ({}));
    for (const p of g.players) {
      // Previous-role restrictions advance only when the next round begins.
      p.lastRoles = p.slots.map(s => s.role);
      p.roundStartCash = p.cash;
      p.threats += p.pendingThreats;
      p.pendingThreats = 0;
      p.locked = false;
      p.ready = false;
      p.slots = Array.from({ length: g.slotsPerPlayer }, (_, slot) => ({
        slot, role: null, withdrawn: false, paidAnte: 0, refunded: false, status: "waiting", share: 0
      }));
    }
  }
  function createGame(names, settings = {}, rng) {
    rule(isObject(settings) && Object.keys(settings).every(k => ["bruteShares", "noRepeat", "edition"].includes(k)), "设置无效 / Invalid settings");
    const selectedEdition = settings.edition ?? "2016", { edition: ignored, ...options } = settings;
    rule(["2016", "2024"].includes(selectedEdition), "版本无效 / Invalid edition");
    rule(Array.isArray(names) && names.length >= 3 && names.length <= (selectedEdition === "2024" ? 9 : 8), "人数不符合所选版本 / Invalid player count for this edition");
    rule(names.every(name => typeof name === "string" && name.trim().length > 0 && [...name.trim()].length <= 40), "玩家名称无效 / Invalid player names");
    for (const value of Object.values(options)) rule(typeof value === "boolean", "设置须为开关 / Settings must be boolean");
    rule(selectedEdition !== "2024" || (edition && !options.noRepeat && options.bruteShares !== false), "新版不使用旧版变体 / Legacy variants are not available in 2024");
    const g = {
      type: "million", version: selectedEdition === "2024" ? 3 : 2, edition: selectedEdition, revision: 0, round: 1, maxRounds: selectedEdition === "2024" ? 5 : Data.MAX_ROUNDS,
      leader: randomIndex(names.length, rng), settings: { bruteShares: true, noRepeat: false, ...options },
      slotsPerPlayer: names.length === 3 ? 2 : 1, availableRoles: Data.rolesForCount(names.length, selectedEdition),
      players: names.map(name => ({ name: name.trim(), cash: selectedEdition === "2024" ? 1000 : Data.INITIAL_CASH, threats: 0, pendingThreats: 0, lastRoles: [], slots: [] })),
      // Reserve is the house's signed net balance; negative means money supplied.
      publicFund: 0, reserve: 0, offerSequence: 0, history: [], winners: [], winReason: null
    };
    startRound(g, rng);
    return g;
  }
  function invalidateOffers(g) {
    for (const o of g.offers) {
      if (o.status !== "pending") continue;
      if (g.players[o.quitter].slots[o.slot].withdrawn || g.players[o.payer].cash < o.amount
        || g.players[o.payer].slots.every(s => s.withdrawn)) o.status = "stale";
    }
  }
  function withdraw(g, owner, index) {
    const s = g.players[owner].slots[index];
    refund(g, owner, index);
    s.withdrawn = true;
    s.status = "withdrawn";
    g.players[owner].ready = false;
    log(g, "withdraw", `${g.players[owner].name}的角色${index + 1}退出。`, `${g.players[owner].name}'s role ${index + 1} withdrew.`, { owner, slot: index });
    invalidateOffers(g);
  }
  function finish(g, namedRole) {
    const current = active(g), counts = {};
    for (const s of current) counts[s.role] = (counts[s.role] || 0) + 1;
    const participants = [];
    for (const s of current) {
      const actual = g.players[s.owner].slots[s.slot];
      if (s.role === namedRole) {
        actual.status = "eliminated";
        if (s.role === "brute") refund(g, s.owner, s.slot);
      } else if (counts[s.role] > 1) {
        actual.status = "duplicate";
        if (s.role === "brute") refund(g, s.owner, s.slot);
      } else {
        refund(g, s.owner, s.slot);
        if (s.role === "brute") {
          g.players[s.owner].pendingThreats++;
          log(g, "threat-earned", `${g.players[s.owner].name}获得下轮起可用的威胁标记。`, `${g.players[s.owner].name} earned a threat for future rounds.`, { owner: s.owner });
        }
        if (s.role === "brute" && !g.settings.bruteShares) actual.status = "exited";
        else { actual.status = "sharing"; participants.push(s); }
      }
      if (!actual.refunded) log(g, "forfeit", `${g.players[s.owner].name}的角色${s.slot + 1}损失实付入场费${s.paidAnte}万。`,
        `${g.players[s.owner].name}'s role ${s.slot + 1} forfeits its paid ante of ${s.paidAnte}.`, { owner: s.owner, slot: s.slot, amount: s.paidAnte });
    }
    let totalLoot = 0, share = 0, remainder = 0, penalty = 0;
    const splitting = [];
    if (participants.length === 1 && participants[0].role === "snitch") {
      const s = participants[0], p = g.players[s.owner];
      penalty = Math.min(300, p.cash);
      p.cash -= penalty;
      g.reserve += penalty;
      p.slots[s.slot].status = "alone";
      log(g, "snitch-alone", `${p.name}的告密者独自留下，支付${penalty}万罚款，不分赃。`, `${p.name}'s lone Snitch pays ${penalty} and takes no loot.`, { owner: s.owner, amount: penalty });
    } else if (participants.length) {
      totalLoot = g.loot + (participants.some(s => s.role === "mastermind") ? 200 : 0);
      share = Math.floor(totalLoot / participants.length / 100) * 100;
      remainder = totalLoot - share * participants.length;
      g.reserve -= totalLoot - remainder;
      for (const s of participants) {
        g.players[s.owner].cash += share;
        g.players[s.owner].slots[s.slot].share = share;
        log(g, "payout", `${g.players[s.owner].name}的角色${s.slot + 1}分得${share}万。`, `${g.players[s.owner].name}'s role ${s.slot + 1} receives a ${share} share.`, { owner: s.owner, slot: s.slot, amount: share });
        if (!splitting.includes(s.owner)) splitting.push(s.owner);
      }
      log(g, "split", `${participants.length}个角色各分得${share}万，余款${remainder}万退回储备。`, `${participants.length} roles receive ${share} each; ${remainder} returns to the reserve.`, { totalLoot, share, remainder });
      const driver = participants.find(s => s.role === "driver");
      if (driver) for (const s of participants) {
        if (s.role === "driver") continue;
        const paid = moveCash(g, s.owner, driver.owner, 100);
        log(g, "driver-fee", `${g.players[s.owner].name}向${g.players[driver.owner].name}支付司机费用${paid}万。`, `${g.players[s.owner].name} pays ${g.players[driver.owner].name} a driver fee of ${paid}.`, { from: s.owner, to: driver.owner, amount: paid });
      }
      const crook = participants.find(s => s.role === "crook"), brute = participants.find(s => s.role === "brute");
      if (crook && brute) {
        const paid = moveCash(g, brute.owner, crook.owner, 200);
        log(g, "crook-steal", `${g.players[crook.owner].name}从${g.players[brute.owner].name}处偷取${paid}万。`, `${g.players[crook.owner].name} steals ${paid} from ${g.players[brute.owner].name}.`, { from: brute.owner, to: crook.owner, amount: paid });
      }
      for (const s of participants) if (s.role === g.bonusRole) {
        g.players[s.owner].cash += 100;
        g.reserve -= 100;
        log(g, "bonus", `${g.players[s.owner].name}获得100万角色奖金。`, `${g.players[s.owner].name} receives a 100 role bonus.`, { owner: s.owner, role: s.role, amount: 100 });
      }
    } else log(g, "no-share", "没有角色参与分赃。", "No roles share the loot.");
    // Only refundable antes stay in escrow; forfeited stakes return to the reserve.
    g.reserve += g.publicFund;
    g.publicFund = 0;
    for (const o of g.offers) if (o.status === "pending") o.status = "expired";
    for (const s of current) log(g, "role-result", `${g.players[s.owner].name}：${Data.ROLES[s.role].zh}。`, `${g.players[s.owner].name}: ${Data.ROLES[s.role].en}.`, { owner: s.owner, slot: s.slot, role: s.role, status: g.players[s.owner].slots[s.slot].status });
    g.result = {
      round: g.round, leader: g.leader, loot: g.loot, ante: g.ante, bonusRole: g.bonusRole,
      revealedCards: g.revealedCards.slice(), namedRole, totalLoot, share, remainder, penalty,
      participants: participants.map(s => ({ owner: s.owner, slot: s.slot, role: s.role })), splitting,
      players: g.players.map(p => ({ name: p.name, cash: p.cash, delta: p.cash - p.roundStartCash, slots: clone(p.slots) })),
      logs: clone(g.logs), privateIntel: clone(g.intel)
    };
    g.history.push(clone(g.result));
    const early = splitting.filter(i => g.players[i].cash >= Data.WIN_CASH);
    const candidates = early.length ? early : g.round === g.maxRounds ? g.players.map((_, i) => i) : [];
    if (candidates.length) {
      const highest = Math.max(...candidates.map(i => g.players[i].cash));
      g.winners = candidates.filter(i => g.players[i].cash === highest);
      g.winReason = early.length ? "target" : "round-limit";
      g.phase = "over";
    } else g.phase = "results";
  }
  function beginHeist(g) {
    if (modern(g)) return edition.beginHeist(g);
    for (const o of g.offers) if (o.status === "pending") o.status = "expired";
    const snitches = active(g).filter(s => s.role === "snitch");
    if (snitches.length === 1) {
      const s = snitches[0];
      refund(g, s.owner, s.slot);
      const options = [...new Set(g.revealedCards.filter(role => role !== "snitch"))];
      g.snitch = { player: s.owner, actor: s.owner, slot: s.slot, options, role: null };
      if (options.length) { g.phase = "snitch"; return; }
    }
    finish(g, null);
  }
  function maybeHeist(g) {
    if (modern(g)) return edition.maybeHeist(g);
    if (g.phase === "negotiation" && g.players.every(p => !p.slots.some(s => !s.withdrawn) || p.ready)) beginHeist(g);
  }
  function validateTransfer(g, payer, recipient, amount) {
    rule(seat(g, payer) && seat(g, recipient) && payer !== recipient, "双方玩家须不同 / Parties must be different players");
    rule(Number.isSafeInteger(amount) && amount > 0 && amount % 100 === 0 && amount <= g.players[payer].cash, "金额须为100万的整数倍且不超过余额 / Pay in whole $1M within your balance");
    rule(Number.isSafeInteger(g.players[recipient].cash + amount), "余额超出范围 / Balance exceeds safe range");
  }
  function perform(g, actor, a, rng) {
    const p = g.players[actor];
    if (modern(g) && edition.perform(g, actor, a)) return;
    if (!modern(g)) rule(!["claim", "callVote", "vote", "steal"].includes(a.type), "此操作仅限新版 / This action requires the 2024 edition");
    if (a.type === "threat") {
      rule(["planning", "negotiation", "snitch"].includes(g.phase), "本轮身份已揭晓 / This round's roles are already revealed");
      rule(seat(g, a.target) && a.target !== actor && p.threats > 0, "威胁目标或标记无效 / Invalid threat target or no token");
      const index = a.slot === undefined && g.slotsPerPlayer === 1 ? 0 : a.slot;
      rule(Number.isInteger(index), "请选择一张角色牌 / Choose one character card");
      const target = g.players[a.target].slots[index], key = `${a.target}:${index}`;
      rule(target?.role && !g.intel[actor][key]
        && !(g.phase === "snitch" && g.snitch.actor === a.target && g.snitch.slot === index), "没有未知角色 / No unknown character at this slot");
      p.threats--;
      g.intel[actor][key] = target.role;
      log(g, "threat", `${p.name}查看了${g.players[a.target].name}的角色${index + 1}。`,
        `${p.name} inspects ${g.players[a.target].name}'s character ${index + 1}.`, { from: actor, to: a.target, slot: index });
      return;
    }
    if (a.type === "choose") {
      rule(g.phase === "planning" && !p.locked, "只能锁定一次角色 / Roles can only be locked once");
      rule(Array.isArray(a.roles) && a.roles.length === g.slotsPerPlayer && new Set(a.roles).size === a.roles.length,
        "请选择所需数量的不同角色 / Choose the required number of distinct roles");
      rule(a.roles.every(r => g.availableRoles.includes(r) && (!g.settings.noRepeat || !p.lastRoles.includes(r))), "角色不可选 / Role is unavailable");
      for (let i = 0; i < a.roles.length; i++) {
        const s = p.slots[i];
        s.role = a.roles[i];
        s.status = "active";
        s.paidAnte = Math.min(g.ante, p.cash);
        p.cash -= s.paidAnte;
        g.publicFund += g.ante;
        g.reserve -= g.ante - s.paidAnte;
        log(g, "ante", `${p.name}的角色${i + 1}支付入场费${s.paidAnte}万，储备补足${g.ante - s.paidAnte}万。`,
          `${p.name}'s role ${i + 1} pays an ante of ${s.paidAnte}; the reserve covers ${g.ante - s.paidAnte}.`,
          { owner: actor, slot: i, amount: s.paidAnte, subsidy: g.ante - s.paidAnte });
      }
      p.locked = true;
      if (g.players.every(player => player.locked)) {
        const cards = shuffled(slots(g).map(s => s.role), rng);
        g.hiddenCard = cards.pop();
        g.revealedCards = cards;
        g.phase = modern(g) ? "claims" : "negotiation";
        if (modern(g)) g.claimActor = g.leader;
      }
      return;
    }
    if (a.type === "next") {
      rule(g.phase === "results" && actor === g.leader, "由本轮领队开始下一轮 / This round's leader starts the next round");
      g.round++;
      g.leader = modern(g) ? g.nextLeader : (g.leader + 1) % g.players.length;
      startRound(g, rng);
      return;
    }
    if (a.type === "snitch") {
      rule(g.phase === "snitch" && g.snitch.actor === actor && g.snitch.options.includes(a.role), "告密目标无效 / Invalid Snitch target");
      g.snitch.role = a.role;
      log(g, "snitch", `告密者指认${Data.ROLES[a.role].zh}。`, `The Snitch names ${Data.ROLES[a.role].en}.`, { role: a.role });
      finish(g, a.role);
      return;
    }
    rule(g.phase === "negotiation", "现在不是谈判阶段 / Not in negotiation");
    if (["transfer", "offer"].includes(a.type) || (a.type === "respond" && a.accept === true)) {
      rule(p.slots.some(s => !s.withdrawn), "完全退出后不能交易 / Fully withdrawn players cannot trade");
    }
    switch (a.type) {
      case "withdraw":
        liveSlot(g, actor, a.slot);
        withdraw(g, actor, a.slot);
        break;
      case "ready":
        rule(typeof a.ready === "boolean" && p.ready !== a.ready && p.slots.some(s => !s.withdrawn), "准备状态无效 / Invalid ready state");
        p.ready = a.ready;
        break;
      case "transfer":
        validateTransfer(g, actor, a.to, a.amount);
        moveCash(g, actor, a.to, a.amount);
        invalidateOffers(g);
        log(g, "transfer", `${p.name}向${g.players[a.to].name}转账${a.amount}万。`, `${p.name} transfers ${a.amount} to ${g.players[a.to].name}.`, { from: actor, to: a.to, amount: a.amount });
        break;
      case "offer": {
        rule(actor === a.payer || actor === a.quitter, "只能代表自己提出交易 / Proposer must be a party");
        validateTransfer(g, a.payer, a.quitter, a.amount);
        rule(g.players[a.payer].slots.some(s => !s.withdrawn), "付款者已退出 / Payer has withdrawn");
        liveSlot(g, a.quitter, a.slot);
        rule(g.offers.filter(o => o.status === "pending").length < 24 && g.offers.length < 128, "交易数量已达上限 / Offer limit reached");
        rule(!g.offers.some(o => o.status === "pending" && o.proposer === actor && o.payer === a.payer && o.quitter === a.quitter && o.slot === a.slot && o.amount === a.amount), "已有相同交易 / Duplicate offer");
        g.offers.push({ id: `${g.round}:${++g.offerSequence}`, round: g.round, proposer: actor,
          responder: actor === a.payer ? a.quitter : a.payer, payer: a.payer, quitter: a.quitter,
          slot: a.slot, amount: a.amount, status: "pending" });
        break;
      }
      case "respond":
      case "cancel": {
        const o = g.offers.find(offer => offer.id === a.offerId);
        rule(o && o.round === g.round && o.status === "pending", "交易已过期 / Offer is stale");
        if (a.type === "cancel") {
          rule(o.proposer === actor, "仅提议者可撤回 / Only proposer can cancel");
          o.status = "cancelled";
        } else {
          rule(o.responder === actor && typeof a.accept === "boolean", "仅对方可回应 / Only the other party may respond");
          if (!a.accept) o.status = "rejected";
          else {
            validateTransfer(g, o.payer, o.quitter, o.amount);
            liveSlot(g, o.quitter, o.slot);
            moveCash(g, o.payer, o.quitter, o.amount);
            o.status = "accepted";
            log(g, "deal", `${g.players[o.payer].name}向${g.players[o.quitter].name}支付${o.amount}万，后者的角色${o.slot + 1}退出。`, `${g.players[o.payer].name} pays ${g.players[o.quitter].name} ${o.amount}; the latter's role ${o.slot + 1} withdraws.`, { from: o.payer, to: o.quitter, amount: o.amount, slot: o.slot });
            withdraw(g, o.quitter, o.slot);
          }
        }
        break;
      }
    }
    maybeHeist(g);
  }
  function act(game, actor, action, rng) {
    rule(game && game.type === "million" && game.phase !== "over", "本局已结束 / Game is not active");
    rule(seat(game, actor), "玩家无效 / Invalid actor");
    rule(isObject(action) && Object.hasOwn(Data.ACTION_FIELDS, action.type), "操作无效 / Invalid action");
    const fields = Data.ACTION_FIELDS[action.type];
    rule(Object.keys(action).every(key => ["type", "revision", "round", ...fields].includes(key)), "操作参数无效 / Invalid action fields");
    rule(action.revision === undefined || action.revision === game.revision, "操作版本已过期 / Stale revision");
    rule(action.round === undefined || action.round === game.round, "轮次已过期 / Stale round");
    rule(rng === undefined || typeof rng === "function", "随机源无效 / Invalid random source");
    // Validate and resolve on a transaction copy, including all random draws.
    const next = clone(game);
    perform(next, actor, action, rng);
    next.revision++;
    Object.assign(game, next);
    return game;
  }
  function requiredActors(g) {
    if (g.phase === "planning") return g.players.flatMap((p, i) => p.locked ? [] : [i]);
    if (modern(g)) {
      if (g.phase === "claims") return [g.claimActor];
      if (g.phase === "mentalist") return [g.mentalist.actor];
      if (g.phase === "negotiation") return g.vote.open ? g.vote.votes.flatMap((v, i) => v === null ? [i] : []) : [g.leader];
    }
    if (g.phase === "negotiation") return g.players.flatMap((p, i) => p.ready || p.slots.every(s => s.withdrawn) ? [] : [i]);
    if (g.phase === "snitch") return [g.snitch.actor];
    if (g.phase === "results") return [g.leader];
    return [];
  }
  function visibleSlot(g, s, owner, viewer, intel, resolved) {
    const known = seat(g, viewer) && intel[viewer] && intel[viewer][`${owner}:${s.slot}`];
    const visible = owner === viewer || g.phase === "over" || known || resolved || (modern(g) && !s.withdrawn && g.heist?.revealed.includes(s.role))
      || (!resolved && g.phase === "snitch" && g.snitch.actor === owner && g.snitch.slot === s.slot);
    return { id: s.slot, slot: s.slot, role: visible ? s.role : null, withdrawn: s.withdrawn,
      paidAnte: s.paidAnte, refunded: s.refunded, status: s.status, outcome: s.status, share: s.share };
  }
  function ledger(logs, owner) { return clone(logs.filter(entry => entry.owner === owner || entry.from === owner || entry.to === owner)); }
  function resultView(g, result, viewer) {
    if (!result) return null;
    return {
      round: result.round, leader: result.leader, loot: result.loot, ante: result.ante,
      bonusRole: result.bonusRole, revealedCards: result.revealedCards.slice(), namedRole: result.namedRole,
      totalLoot: result.totalLoot, share: result.share, remainder: result.remainder, penalty: result.penalty, topUp: result.topUp || 0,
      participants: clone(result.participants), splitting: result.splitting.slice(), logs: clone(result.logs),
      players: result.players.map((p, owner) => ({ name: p.name, cash: p.cash, delta: p.delta, ledger: ledger(result.logs, owner),
        slots: p.slots.map(s => visibleSlot(g, s, owner, viewer, result.privateIntel, true)) }))
    };
  }
  function publicGame(g, viewer = -1) {
    if (!seat(g, viewer)) viewer = -1;
    const resolved = g.phase === "results" || g.phase === "over";
    return {
      type: "million", version: g.version, edition: g.edition || "2016", revision: g.revision, phase: g.phase, round: g.round,
      ...(modern(g) ? { lootPool: g.lootPool, claims: clone(g.claims), claimActor: g.claimActor, vote: clone(g.vote), mentalist: clone(g.mentalist), nextLeader: g.nextLeader } : {}),
      maxRounds: g.maxRounds, leader: g.leader, settings: clone(g.settings), availableRoles: g.availableRoles.slice(),
      allowedRoles: g.availableRoles.filter(role => !g.settings.noRepeat || !seat(g, viewer) || !g.players[viewer].lastRoles.includes(role)),
      slotsPerPlayer: g.slotsPerPlayer, loot: g.loot, ante: g.ante, bonusRole: g.bonusRole,
      revealedCards: g.revealedCards.slice(), hiddenCount: g.hiddenCard === null ? 0 : 1,
      center: { revealed: g.revealedCards.slice(), hiddenCount: g.hiddenCard === null ? 0 : 1 },
      ready: g.players.map(p => p.ready),
      private: seat(g, viewer) ? Object.entries(g.intel[viewer]).map(([key, role]) => {
        const [player, slot] = key.split(":").map(Number);
        return { player, slot, role };
      }) : [],
      publicFund: g.publicFund, reserve: g.reserve, requiredActors: requiredActors(g),
      players: g.players.map((p, owner) => ({ name: p.name, cash: p.cash, threats: p.threats,
        delta: p.cash - p.roundStartCash, ledger: ledger(g.logs, owner),
        pendingThreats: p.pendingThreats, locked: p.locked, ready: p.ready,
        slots: p.slots.map(s => visibleSlot(g, s, owner, viewer, g.intel, resolved)),
        ...(g.settings.noRepeat ? { lastRoles: p.lastRoles.slice() } : {}) })),
      offers: clone(g.offers), snitch: clone(g.snitch), result: resultView(g, g.result, viewer),
      history: g.history.map(r => resultView(g, r, viewer)), logs: clone(g.logs),
      winners: g.winners.slice(), winReason: g.winReason
    };
  }
  function chooseBotAction(game, actor, rng, chat = []) {
    rule(seat(game, actor), "玩家无效 / Invalid actor");
    // Decisions deliberately consume only the same redacted state sent to this seat.
    rule(Bot, "先加载机器人策略 / Load million-bot.js first");
    return Bot.choose(publicGame(game, actor), actor, () => randomIndex(0x1000000, rng) / 0x1000000, chat);
  }
  function chooseBotSpeech(game, actor, rng) {
    rule(seat(game, actor) && Bot, "机器人无效 / Invalid bot");
    return Bot.speech(publicGame(game, actor), actor, () => randomIndex(0x1000000, rng) / 0x1000000);
  }
  return Object.freeze({ createGame, act, requiredActors, publicGame, chooseBotAction, chooseBotSpeech });
});
