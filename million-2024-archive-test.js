"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { encode, decode, createRoomArchive } = require("./room-archive");
const { createRoomControl } = require("./room-control");
const E = require("./million-engine"), Data = require("./million-data");
const clone = value => JSON.parse(JSON.stringify(value));
const rng = () => 0;

function fixture(count, edition = "2024") {
  const seats = Array.from({ length: count }, (_, i) => ({
    name: `Original-person-${i}`, position: i, token: `secret-token-${i}`, socialId: `old-social-${i}`,
    avatar: `old-avatar-${i}`, bot: i > 0, auto: true, ws: { connection: i }
  }));
  const settings = { bruteShares: true, noRepeat: false };
  return { edition, capacity: count, settings, seats, host: seats[0].token, game: E.createGame(seats.map(p => p.name), { ...settings, edition }, rng) };
}

function choose(g) {
  const choices = g.players.length === 3 ? [["tech", "brute"], ["mentalist", "driver"], ["acrobat", "driver"]]
    : [["tech"], ["brute"], ["mentalist"], ["acrobat"], ["brain"], ["driver"], ["driver"], ["driver"], ["driver"]];
  for (let i = 0; i < g.players.length; i++) E.act(g, i, { type: "choose", roles: choices[i] }, rng);
}

function advance(g) {
  const actor = E.requiredActors(g)[0];
  if (g.phase === "planning") return choose(g);
  const action = {
    claims: () => ({ type: "claim", roles: g.players[actor].slots.map(s => s.role) }),
    negotiation: () => g.vote.open ? { type: "vote", yes: true } : { type: "callVote" },
    snitch: () => ({ type: "snitch", role: g.snitch.options.includes("driver") ? "driver" : g.snitch.options[0] }),
    mentalist: () => ({ type: "steal", target: g.mentalist.targets[0].owner, slot: g.mentalist.targets[0].slot }),
    results: () => ({ type: "next" })
  }[g.phase]();
  E.act(g, actor, action, rng);
}

function snapshots(count) {
  const r = fixture(count), states = [clone(r)];
  for (let step = 0; r.game.phase !== "over" && step < 200; step++) {
    advance(r.game); states.push(clone(r));
  }
  assert.equal(r.game.phase, "over");
  return states;
}

const statesByCount = new Map([3, 9].map(count => [count, snapshots(count)]));
const phaseRoom = (phase, count = 3) => clone(statesByCount.get(count).find(r => r.game.phase === phase));
const saved = (phase, count = 3) => encode("million", phaseRoom(phase, count));

for (const count of [3, 9]) test(`2024 ${count} seats: every phase round-trips, with private views and resumable progress`, () => {
  const states = statesByCount.get(count);
  assert.deepEqual([...new Set(states.map(r => r.game.phase))].sort(), ["planning", "claims", "negotiation", "snitch", "mentalist", "results", "over"].sort());
  for (const r of states) {
    const original = clone(r), archive = encode("million", r);
    const { room } = decode(clone(archive), ["million"]);
    assert.deepEqual(r, original, "export must not mutate the live game");
    assert.equal(room.edition, "2024"); assert.equal(room.capacity, count);
    assert.equal(room.host, ""); assert.equal(room.archiveRestoring, true);
    assert.equal(new Set(room.seats.map(p => p.token)).size, count);
    assert.ok(room.seats.every((p, i) => p.vacant && !p.bot && !p.auto && !p.ready && p.ws === null && p.avatar === null && !p.socialId && p.token !== r.seats[i].token));
    assert.deepEqual(room.game, archive.progress);
    assert.deepEqual(encode("million", room).progress, archive.progress);
    assert.deepEqual(encode("million", room).config, archive.config);
    assert.doesNotMatch(JSON.stringify(archive), /Original-person-|secret-token-|old-social-|old-avatar-|"(?:token|socialId|avatar|ws|auto)":/);
    for (let viewer = -1; viewer < count; viewer++) {
      const view = E.publicGame(room.game, viewer);
      assert.ok(view.requiredActors.every(i => Number.isInteger(i) && i >= 0 && i < count));
      assert.equal(view.hiddenCard, undefined); assert.equal(view.intel, undefined);
      if (["claims", "negotiation"].includes(view.phase)) {
        view.players.forEach((p, i) => assert.deepEqual(p.slots.map(s => s.role), i === viewer ? room.game.players[i].slots.map(s => s.role) : Array(room.game.slotsPerPlayer).fill(null)));
      }
    }
    const resumed = room.game;
    for (let step = 0; resumed.phase !== "over" && step < 200; step++) advance(resumed);
    assert.equal(resumed.phase, "over", `resume ${r.game.phase}, round ${r.game.round}`);
  }
});

test("modern count-specific role pools and mapped legacy bonuses are accepted for 3..9 seats", () => {
  for (let count = 3; count <= 9; count++) {
    const r = fixture(count);
    for (const bonusRole of [null, ...Data.MODERN_ROLE_IDS]) {
      r.game.bonusRole = bonusRole;
      const restored = decode(encode("million", r), ["million"]).room;
      assert.deepEqual(restored.game.availableRoles, Data.rolesForCount(count, "2024"));
      assert.equal(restored.game.bonusRole, bonusRole);
    }
  }
});

test("seeded legal games preserve partial choices, bluffs, withdrawals, deals and failed votes at every count", () => {
  for (let count = 3; count <= 9; count++) for (let seed = 1; seed <= 3; seed++) {
    let state = seed;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const one = list => list[Math.floor(random() * list.length)];
    const r = fixture(count), g = r.game, negotiations = new Map();
    for (let step = 0; step < 500; step++) {
      const a = encode("million", r), restored = decode(a, ["million"]).room;
      assert.deepEqual(encode("million", restored).progress, a.progress);
      for (let i = -1; i < count; i++) E.publicGame(restored.game, i);
      if (g.phase === "over") break;
      let actor = one(E.requiredActors(g)), action;
      if (g.phase === "planning") {
        const roles = g.availableRoles.slice(), selected = [];
        while (selected.length < g.slotsPerPlayer) selected.push(roles.splice(Math.floor(random() * roles.length), 1)[0]);
        action = { type: "choose", roles: selected };
      } else if (g.phase === "claims") action = { type: "claim", roles: Array.from({ length: g.slotsPerPlayer }, () => one(g.availableRoles)) };
      else if (g.phase === "snitch") action = { type: "snitch", role: one(g.snitch.options) };
      else if (g.phase === "mentalist") {
        const target = one(g.mentalist.targets); action = { type: "steal", target: target.owner, slot: target.slot };
      } else if (g.phase === "results") action = { type: "next" };
      else if (g.vote.open) action = { type: "vote", yes: g.vote.attempt > 1 || random() < .3 };
      else {
        const turns = negotiations.get(g.round) || 0; negotiations.set(g.round, turns + 1);
        const live = g.players.flatMap((p, owner) => p.slots.flatMap(s => s.withdrawn ? [] : [{ owner, slot: s.slot }]));
        const payable = live.filter(s => g.players[s.owner].cash >= 100);
        const pending = g.offers.find(o => o.status === "pending");
        if (pending) { actor = pending.responder; action = { type: "respond", offerId: pending.id, accept: true }; }
        else if (turns < 4 && payable.length && live.some(s => s.owner !== payable[0].owner)) {
          actor = payable[0].owner;
          const target = one(live.filter(s => s.owner !== actor));
          action = random() < .5 ? { type: "offer", payer: actor, quitter: target.owner, slot: target.slot, amount: 100 }
            : { type: "transfer", to: target.owner, amount: 100 };
        } else if (turns < 6 && live.length) {
          const target = one(live); actor = target.owner; action = { type: "withdraw", slot: target.slot };
        } else { actor = g.leader; action = { type: "callVote" }; }
      }
      E.act(g, actor, action, random);
    }
    assert.equal(g.phase, "over", `${count} seats, seed ${seed}`);
  }
});

test("lone Tech and fully withdrawn heists remain importable", () => {
  for (const keepTech of [false, true]) {
    const r = phaseRoom("negotiation"), g = r.game;
    for (let owner = 0; owner < 3; owner++) for (let slot = 0; slot < 2; slot++) {
      if (keepTech && g.players[owner].slots[slot].role === "tech") continue;
      E.act(g, owner, { type: "withdraw", slot });
    }
    while (!["results", "over"].includes(g.phase)) advance(g);
    assert.equal(g.result.splitting.length, 0);
    assert.equal(g.result.penalty, keepTech ? 500 : 0);
    assert.deepEqual(decode(encode("million", r), ["million"]).room.game, encode("million", r).progress);
  }
});

test("negotiation exports and raw imports clear participant consent, not claims or completed transfers", () => {
  const r = phaseRoom("negotiation", 9), g = r.game;
  E.act(g, 0, { type: "transfer", to: 1, amount: 100 });
  E.act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  E.act(g, g.leader, { type: "callVote" });
  E.act(g, E.requiredActors(g)[0], { type: "vote", yes: false });
  g.players[0].ready = true;
  const original = clone(g), archive = encode("million", r);
  assert.deepEqual(g, original);
  for (const a of [archive, { ...clone(archive), progress: clone(original) }]) {
    const untouched = clone(a), restored = decode(a, ["million"]).room.game;
    assert.deepEqual(a, untouched);
    assert.equal(restored.vote.open, false);
    assert.deepEqual(restored.vote.votes, Array(9).fill(null));
    assert.equal(restored.vote.attempt, original.vote.attempt);
    assert.deepEqual(restored.claims, original.claims);
    assert.deepEqual(restored.players.map(p => p.cash), original.players.map(p => p.cash));
    assert.ok(restored.players.every(p => !p.ready));
    assert.equal(restored.offers[0].status, "stale");
    assert.equal(restored.revision, original.revision);
    assert.throws(() => E.act(restored, 1, { type: "respond", offerId: restored.offers[0].id, accept: true }), /stale/);
    assert.throws(() => E.act(restored, 1, { type: "vote", yes: true }), /unavailable/);
    E.act(restored, restored.leader, { type: "callVote" });
    assert.equal(restored.vote.attempt, original.vote.attempt + 1);
  }
  assert.equal(archive.progress.vote.open, false);
  assert.deepEqual(archive.progress.vote.votes, Array(9).fill(null));
  assert.deepEqual(archive.progress.claims, g.claims);
});

test("edition is derived from game data; only version 2 may omit game.edition", () => {
  for (const edition of ["2016", "2024"]) {
    const a = encode("million", fixture(3, edition)); delete a.config.edition;
    assert.equal(decode(a, ["million"]).room.edition, edition);
    delete a.progress.edition;
    if (edition === "2016") assert.equal(decode(a, ["million"]).room.edition, "2016");
    else assert.throws(() => decode(a, ["million"]), /unsupported/);
  }
  for (const count of [3, 8]) {
    const r = fixture(count, "2016"); delete r.edition; delete r.game.edition;
    for (let step = 0; step < 300; step++) {
      const a = encode("million", r), restored = decode(a, ["million"]).room;
      assert.equal(restored.edition, "2016"); assert.equal(restored.game.version, 2);
      assert.deepEqual(encode("million", restored).progress, a.progress);
      for (let i = 0; i < count; i++) E.publicGame(restored.game, i);
      if (r.game.phase === "over") break;
      const actor = E.requiredActors(r.game)[0]; E.act(r.game, actor, E.chooseBotAction(r.game, actor, rng), rng);
    }
    assert.equal(r.game.phase, "over");
  }
});

const malformed = [
  ["unknown edition", "planning", a => { a.config.edition = "2025"; }],
  ["edition mismatch", "planning", a => { a.config.edition = "2016"; }],
  ["game edition mismatch", "planning", a => { a.progress.edition = "2016"; }],
  ["missing modern edition", "planning", a => { delete a.progress.edition; }],
  ["version mismatch", "planning", a => { a.progress.version = 2; }],
  ["future version", "planning", a => { a.progress.version = 4; }],
  ["capacity mismatch", "planning", a => { a.config.capacity = 4; }],
  ["capacity too large", "planning", a => { a.config.capacity = 10; }],
  ["invalid position", "planning", a => { a.positions[2] = 3; }],
  ["player count", "planning", a => { a.progress.players.pop(); }],
  ["unknown phase", "planning", a => { a.progress.phase = "revealing"; }],
  ["zero round", "planning", a => { a.progress.round = 0; }],
  ["too many rounds", "planning", a => { a.progress.round = 6; }],
  ["fractional round", "planning", a => { a.progress.round = 1.5; }],
  ["wrong max rounds", "planning", a => { a.progress.maxRounds = 8; }],
  ["missing max rounds", "planning", a => { delete a.progress.maxRounds; }],
  ["leader", "planning", a => { a.progress.leader = 3; }],
  ["slots per player", "planning", a => { a.progress.slotsPerPlayer = 1; }],
  ["slot count", "planning", a => { a.progress.players[0].slots.pop(); }],
  ["slot index", "planning", a => { a.progress.players[0].slots[0].slot = 2; }],
  ["role pool", "planning", a => { a.progress.availableRoles.push("brain"); }],
  ["duplicate role pool", "planning", a => { a.progress.availableRoles[0] = a.progress.availableRoles[1]; }],
  ["legacy settings", "planning", a => { a.progress.settings.noRepeat = true; }],
  ["room settings", "planning", a => { a.config.settings.bruteShares = false; }],
  ["negative cash", "planning", a => { a.progress.players[0].cash = -1; }],
  ["negative pool", "planning", a => { a.progress.lootPool = -100; }],
  ["huge pool", "planning", a => { a.progress.lootPool = Number.MAX_SAFE_INTEGER; }],
  ["fractional pool", "planning", a => { a.progress.lootPool = 0.5; }],
  ["missing pool", "planning", a => { delete a.progress.lootPool; }],
  ["claims count", "claims", a => { a.progress.claims.pop(); }],
  ["claim actor", "claims", a => { a.progress.claimActor = 3; }],
  ["claim turn", "claims", a => { a.progress.claimActor = (a.progress.leader + 1) % 3; }],
  ["claim shape", "claims", a => { a.progress.claims[0] = "tech"; }],
  ["claim slots", "negotiation", a => { a.progress.claims[0] = ["tech"]; }],
  ["claim role", "negotiation", a => { a.progress.claims[0][0] = "snitch"; }],
  ["missing claim", "negotiation", a => { a.progress.claims[0] = null; }],
  ["stale claim actor", "negotiation", a => { a.progress.claimActor = 0; }],
  ["missing vote", "negotiation", a => { a.progress.vote = null; }],
  ["vote open type", "negotiation", a => { a.progress.vote.open = 1; }],
  ["vote count", "negotiation", a => { a.progress.vote.votes.push(null); }],
  ["vote value", "negotiation", a => { a.progress.vote.votes[0] = "yes"; }],
  ["negative attempt", "negotiation", a => { a.progress.vote.attempt = -1; }],
  ["huge attempt", "negotiation", a => { a.progress.vote.attempt = Number.MAX_SAFE_INTEGER; }],
  ["open vote before claims", "claims", a => { a.progress.vote.open = true; }],
  ["missing heist", "snitch", a => { a.progress.heist = null; }],
  ["negative cursor", "snitch", a => { a.progress.heist.cursor = -1; }],
  ["huge cursor", "snitch", a => { a.progress.heist.cursor = 7; }],
  ["fractional cursor", "snitch", a => { a.progress.heist.cursor = 1.5; }],
  ["cursor phase", "snitch", a => { a.progress.heist = { cursor: 2, revealed: ["tech", "acrobat"] }; }],
  ["revealed order", "mentalist", a => { a.progress.heist.revealed.reverse(); }],
  ["revealed extra role", "snitch", a => { a.progress.heist.revealed.push("driver"); }],
  ["heist before vote", "negotiation", a => { a.progress.heist = { cursor: 1, revealed: ["tech"] }; }],
  ["snitch actor", "snitch", a => { a.progress.snitch.actor = 3; }],
  ["snitch slot", "snitch", a => { a.progress.snitch.slot = 2; }],
  ["snitch options", "snitch", a => { a.progress.snitch.options = ["tech"]; }],
  ["missing snitch", "snitch", a => { a.progress.snitch = null; }],
  ["mentalist actor", "mentalist", a => { a.progress.mentalist.actor = 3; }],
  ["mentalist wrong role", "mentalist", a => { a.progress.mentalist.actor = 0; }],
  ["mentalist slot", "mentalist", a => { a.progress.mentalist.slot = 2; }],
  ["missing mentalist", "mentalist", a => { a.progress.mentalist = null; }],
  ["empty targets", "mentalist", a => { a.progress.mentalist.targets = []; }],
  ["target owner", "mentalist", a => { a.progress.mentalist.targets[0].owner = 3; }],
  ["target slot", "mentalist", a => { a.progress.mentalist.targets[0].slot = 2; }],
  ["target role", "mentalist", a => { a.progress.mentalist.targets[0].role = "driver"; }],
  ["target duplicates", "mentalist", a => { a.progress.mentalist.targets[1] = clone(a.progress.mentalist.targets[0]); }],
  ["missing next leader", "results", a => { a.progress.nextLeader = null; }],
  ["next leader bounds", "results", a => { a.progress.nextLeader = 3; }],
  ["early next leader", "planning", a => { a.progress.nextLeader = 0; }],
  ["hidden card", "claims", a => { a.progress.hiddenCard = "snitch"; }],
  ["slot role", "claims", a => { a.progress.players[0].slots[0].role = "brain"; }],
  ["forged intel", "claims", a => { a.progress.intel[0]["100:2"] = "tech"; }],
  ["winner bounds", "over", a => { a.progress.winners = [3]; }],
  ["history size", "results", a => { a.progress.history = []; }],
  ["history actor", "results", a => { a.progress.history[0].leader = 3; }],
  ["result participant", "results", a => { a.progress.result.participants[0].owner = 3; }],
  ["result slot", "results", a => { a.progress.result.players[0].slots[0].slot = 2; }],
  ["offer actor", "negotiation", a => { a.progress.offers = [{ id: "1:1", round: 1, payer: 0, quitter: 3, proposer: 0, responder: 3, slot: 0, amount: 100, status: "pending" }]; }],
  ["identity key", "planning", a => { a.progress.players[0].token = "old-token"; }],
  ["prototype key", "planning", a => { a.progress.vote = JSON.parse('{"__proto__":{}}'); }]
];
for (const [label, phase, mutate] of malformed) test(`reject malformed modern archive: ${label}`, () => {
  const a = saved(phase); mutate(a);
  assert.throws(() => decode(a, ["million"]), /Invalid or unsupported save/);
});

test("nine seats cannot be disguised as a legacy archive", () => {
  const a = saved("planning", 9);
  a.config.edition = "2016"; a.progress.edition = "2016"; a.progress.version = 2;
  assert.throws(() => decode(a, ["million"]), /unsupported/);
  const tooMany = saved("planning", 9); tooMany.positions.push(9);
  assert.throws(() => decode(tooMany, ["million"]), /unsupported/);
});

test("modern saves survive a fresh Node process without connected identities", () => {
  const archive = saved("mentalist", 9);
  const child = spawnSync(process.execPath, ["-e", 'const fs = require("node:fs"), A = require("./room-archive"); const r = A.decode(JSON.parse(fs.readFileSync(0, "utf8")), ["million"]).room; process.stdout.write(JSON.stringify(A.encode("million", r)));'],
    { cwd: __dirname, input: JSON.stringify(archive), encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
  const restored = JSON.parse(child.stdout);
  assert.deepEqual(restored.progress, archive.progress); assert.deepEqual(restored.config, archive.config);
});

for (const count of [3, 9]) test(`${count} seats: preview is private, claims are exclusive and host must confirm resumption`, () => {
  const rooms = new Map(), sessions = new Map(), messages = new Map();
  const send = (ws, data) => { if (ws) messages.get(ws).push(clone(data)); };
  const control = createRoomControl({ rooms, active: r => r.game.phase !== "over", started: () => true,
    actors: r => E.requiredActors(r.game), turnKey: r => r.game.revision, stop() {}, changed() {} });
  const archives = createRoomArchive({ kind: "million", rooms, sessions, control, send, stop() {},
    validate: r => { for (let i = -1; i < count; i++) E.publicGame(r.game, i); },
    broadcast: r => { for (let i = 0; i < count; i++) if (!r.seats[i].vacant) send(r.seats[i].ws, { type: "state", game: E.publicGame(r.game, i) }); } });
  function client(i) {
    const s = { token: `new-person-${i}`, room: "", ws: { readyState: 1 } };
    sessions.set(s.token, s); messages.set(s.ws, []); return s;
  }
  const call = (s, data) => archives.handle(s, s.ws, data);
  try {
    const a = client(0), b = client(1), archive = saved("negotiation", count);
    call(a, { type: "archiveImport", archive, name: "New host" });
    const preview = messages.get(a.ws).at(-1), r = rooms.get(preview.code);
    assert.deepEqual(Object.keys(preview).sort(), ["type", "code", "game", "seats"].sort());
    assert.equal(preview.game, "million");
    assert.ok(preview.seats.every(s => s.vacant && Object.keys(s).sort().join() === "index,name,position,vacant"));
    assert.doesNotMatch(JSON.stringify(preview), /tech|mentalist|hiddenCard|claims|Original-person-|secret-token-/);
    call(b, { type: "join", code: r.code, name: "New guest" });
    call(a, { type: "archiveClaim", seat: 0 });
    assert.throws(() => call(b, { type: "archiveClaim", seat: 0 }), /already filled/);
    assert.equal(messages.get(b.ws).filter(m => m.type === "state").length, 0);
    assert.equal(r.host, a.token); assert.ok(control.paused(r));
    const view = messages.get(a.ws).at(-1).game;
    assert.deepEqual(view.players[0].slots.map(s => s.role), archive.progress.players[0].slots.map(s => s.role));
    assert.ok(view.players.slice(1).every(p => p.slots.every(s => s.role === null)));
    assert.throws(() => call(a, { type: "archiveClaim", seat: 1 }), /Rejoin|already/);
    assert.throws(() => call(a, { type: "archiveContinue" }), /Fill all seats/);
    call(b, { type: "archiveClaim", seat: 1 });
    assert.throws(() => call(b, { type: "archiveContinue" }), /host only/i);
    for (let i = 2; i < count; i++) {
      const c = client(i); call(c, { type: "join", code: r.code, name: `Replacement ${i}` }); call(c, { type: "archiveClaim", seat: i });
    }
    assert.ok(control.paused(r));
    assert.deepEqual(encode("million", r).progress, archive.progress);
    call(a, { type: "archiveContinue" });
    assert.equal(control.paused(r), false); assert.equal(r.archiveRestoring, false);
    assert.deepEqual(r.game.claims, archive.progress.claims);
  } finally { archives.close(); control.close(); }
});
