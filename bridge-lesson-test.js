"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachBridge } = require("./bridge-server");
const L = require("./bridge-lesson"), E = require("./bridge-engine");
const names = ["Learner", "East", "Partner", "West"];
function playAll(choose = (g) => L.coach(E.publicGame(g, 0)).recommendation) {
  const g = L.create(names); let actions = 0;
  while (g.phase !== "over") {
    assert(++actions < 80);
    const view = E.publicGame(g, 0), c = L.coach(view);
    assert(c.title.zh && c.title.en && c.tip.zh && c.tip.en);
    assert(c.paragraphs.every((p) => p.zh && p.en));
    c.counts.forEach((s) => assert.equal(s.played + s.held + s.unseen, 13));
    if (E.controller(g) === 0) {
      if (g.phase === "play") assert(E.legalCards(g).includes(c.recommendation.card));
      L.act(g, 0, choose(g));
    } else L.next(g);
  }
  return g;
}
test("Lesson deal has 52 unique cards, balanced 16-HCP opener and a real 3NT board", () => {
  const g = L.create(names), hand = g.hands[0];
  assert.deepEqual(g.hands.map((h) => h.length), [13, 13, 13, 13]);
  assert.equal(new Set(g.hands.flat()).size, 52);
  assert.equal(hand.reduce((n, c) => n + Math.max(0, 4 - c % 13), 0), 16);
  const completed = playAll();
  assert.deepEqual(completed.contract, { declarer: "N", level: 3, strain: "NT" });
  assert.equal(completed.tricks.length, 13); assert(completed.won[0] >= 9);
  assert.equal(completed.result.score, 400 + (completed.won[0] - 9) * 30);
});
test("Lesson rejects a different auction without mutation, but accepts every legal card", () => {
  const g = L.create(names), before = JSON.stringify(g);
  assert.throws(() => L.act(g, 0, { type: "call", call: "7NT" }), /16.*1NT/);
  assert.equal(JSON.stringify(g), before);
  L.auction.forEach((call) => L.act(g, E.controller(g), { type: "call", call })); L.next(g);
  for (const card of E.legalCards(g)) {
    const copy = structuredClone(g); L.act(copy, 0, { type: "play", card });
    assert.equal(copy.trick.at(-1).card, card);
  }
  const illegal = g.hands[2].find((c) => Math.floor(c / 13) !== 0);
  assert.throws(() => L.act(g, 0, { type: "play", card: illegal }), /Follow suit/);
  assert.throws(() => L.next(g), /Make your move/);
});
test("Coach uses only public information, deduplicates completed tricks and explains alternate plays", () => {
  const g = L.create(names);
  L.auction.forEach((call) => L.act(g, E.controller(g), { type: "call", call })); L.next(g);
  const a = E.publicGame(g, 0), advice = L.coach(a);
  assert.equal(a.hands[1], null); assert.equal(a.hands[3], null); assert.equal(a.originalHands, null);
  [g.hands[1][0], g.hands[3][0]] = [g.hands[3][0], g.hands[1][0]];
  assert.deepEqual(L.coach(E.publicGame(g, 0)), advice);
  assert.equal(Object.keys(advice.cardNotes).length, a.legalCards.length);
  const full = playAll(); assert(L.coach(E.publicGame(full, 0)).counts.every((s) => s.played === 13 && s.unseen === 0));
});
test("Poor choices still finish and explain actual penalties; practice does not award a scripted victory", () => {
  const g = playAll((game) => game.phase === "auction" ? L.coach(E.publicGame(game, 0)).recommendation : { type: "play", card: E.legalCards(game)[0] });
  assert.equal(g.won[0] + g.won[1], 13);
  const c = L.coach(E.publicGame(g, 0));
  assert(c.paragraphs[0].en.includes(String(Math.abs(g.result.score))));
  if (g.won[0] < 9) { assert.equal(g.result.score, -(9 - g.won[0]) * 50); assert.match(c.title.en, /Down/); }
});

test("Private lesson adapter: manual pacing, no auto-play, stale messages, reconnect, restart and ordinary rooms", { timeout: 20000 }, async (t) => {
  const server = http.createServer(), api = attachBridge(server), clients = [];
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { clients.forEach((c) => c.ws.terminate()); await new Promise((resolve) => server.close(resolve)); });
  async function connect(token) {
    const c = { ws: new WebSocket(`ws://127.0.0.1:${server.address().port}`), events: [] }; clients.push(c);
    c.ws.on("message", (data) => { const d = JSON.parse(data); c.events.push(d); if (d.type === "state") c.state = d; if (d.type === "welcome") c.token = d.token; });
    await once(c.ws, "open");
    c.request = async (d, type = "state") => {
      const count = c.events.length; c.ws.send(JSON.stringify(d));
      for (let n = 0; n < 300; n++) { const event = c.events.slice(count).find((e) => e.type === type); if (event) return event; await new Promise((r) => setTimeout(r, 10)); }
      throw new Error(`No ${type} for ${JSON.stringify(d)}: ${JSON.stringify(c.events.slice(count))}`);
    };
    await c.request({ type: "hello", token }, "welcome"); return c;
  }
  let a = await connect(); await a.request({ type: "createTutorial", name: "Learner", avatar: null });
  const code = a.state.code, room = api.rooms.get(code); assert(a.state.lesson); assert.equal(room.timer, null);
  assert.equal(a.state.control.idleAuto, false); assert(a.state.seats.every((p) => p.connected && p.socialId));
  const b = await connect(); await b.request({ type: "join", name: "Intruder", code }, "error");
  await a.request({ type: "roomControl", action: "auto", enabled: true }, "error");
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true }, "error");
  await a.request({ type: "action", action: { type: "call", call: "1NT", revision: 0 } });
  assert.equal(room.timer, null); await new Promise((r) => setTimeout(r, 1000)); assert.equal(room.game.revision, 1);
  await a.request({ type: "lessonContinue", revision: 0 }, "error"); assert.equal(room.game.revision, 1);
  await a.request({ type: "reaction", kind: "flowers", target: a.state.seats[1].socialId }, "reaction"); assert.equal(room.game.revision, 1);
  await a.request({ type: "profile", avatar: { kind: "emoji", value: "🌸" } }); assert.equal(room.game.revision, 1);
  assert(!JSON.stringify(a.state).includes(a.token)); assert.equal(a.state.game.hands.filter(Boolean).length, 1);
  a.ws.close(); await once(a.ws, "close"); const token = a.token;
  a = await connect(token);
  for (let n = 0; !a.state && n < 100; n++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(a.state.game.revision, 1); assert.equal(a.state.code, code); assert(a.state.lesson);
  while (a.state.game.phase !== "over") {
    const s = a.state;
    if (s.lesson.canContinue) await a.request({ type: "lessonContinue", revision: s.game.revision });
    else await a.request({ type: "action", action: { ...s.lesson.recommendation, revision: s.game.revision } });
  }
  assert.equal(a.state.scores.length, 1); assert.equal(a.state.game.tricks.length, 13);
  const lastRevision = a.state.game.revision;
  await a.request({ type: "lessonRestart", revision: lastRevision });
  assert.equal(a.state.game.revision, lastRevision + 1); assert.equal(a.state.game.phase, "auction"); assert.deepEqual(a.state.scores, []);
  await a.request({ type: "lessonContinue", revision: lastRevision }, "error");
  await a.request({ type: "leave" }, "left"); assert(!api.rooms.has(code));
  await a.request({ type: "create", name: "Learner", boards: 4 }); assert.equal(a.state.lesson, null);
  await a.request({ type: "lessonRestart", revision: 0 }, "error");
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }); assert.equal(a.state.game.phase, "auction");
});
