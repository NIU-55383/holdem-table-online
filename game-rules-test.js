"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const data = require("./game-rules-data");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
test("all game entries load the same rules reader and styling", () => {
  const home = read("index.html"), pages = new Set(["index.html", ...[...home.matchAll(/<a class="club-game [^"]+" href="([^"?]+)/g)].map((m) => m[1])]);
  for (const name of pages) {
    const html = read(name);
    assert.match(html, /href="game-rules.css"/, name);
    assert.match(html, /src="game-rules.js"/, name);
    assert.match(html, /data-lucide="book-open"/, name);
    assert(html.indexOf('src="game-ui.js"') < html.indexOf('src="game-rules.js"'), name);
  }
  for (const name of ["bridge.html", "catan.html"]) {
    const dialogs = [...read(name).matchAll(/<dialog[^>]*data-rules-dialog[^>]*>([\s\S]*?)<\/dialog>/g)];
    assert(dialogs.length > 0);
    for (const [, content] of dialogs) { assert.match(content, /class="dialog-heading"/); assert.match(content, /data-rules-body/); }
  }
  assert.match(read("AGENTS.md"), /Every existing and future game must provide complete Chinese and English rules/);
});
test("Bridge keeps complete bilingual rules but no teaching UI, modules or test scripts", () => {
  const html = read("bridge.html"), rules = html.match(/<dialog id="rulesDialog"[\s\S]*?<\/dialog>/)[0];
  assert.equal([...html.matchAll(/<dialog[^>]*data-rules-dialog/g)].length, 1);
  for (const title of ["Partners & goal", "The auction", "Lead, dummy & play", "Scoring & vulnerability", "Bots & room"]) assert(rules.includes(title), title);
  assert.equal([...rules.matchAll(/<section>/g)].length, 5);
  assert.equal([...rules.matchAll(/<p lang="en">/g)].length, 11);
  for (const file of ["bridge.html", "bridge.js", "bridge-server.js", "package.json"]) assert.doesNotMatch(read(file), /lesson|tutorial|教学|教程/i, file);
  const retired = JSON.parse(read("retired-files.json"));
  for (const file of ["bridge-lesson.js", "bridge-lesson-ui.js", "bridge-lesson.css", "bridge-lesson-test.js", "bridge-lesson-ui-test.js"]) {
    assert(retired.includes(file)); assert.equal(fs.existsSync(path.join(__dirname, file)), false, file);
  }
});

test("every new rule section has equivalent bilingual content and unique navigation IDs", () => {
  function pair(p) { assert.equal(p.length, 2); assert.match(p[0], /[\u4e00-\u9fff]/); assert.match(p[1], /[A-Za-z]/); assert(p.every((s) => typeof s === "string" && s.length)); }
  for (const rules of Object.values(data)) {
    pair(rules.title); const ids = new Set();
    for (const section of rules.sections) {
      pair(section.title); assert(!ids.has(section.id)); ids.add(section.id);
      const paragraphs = [...section.paragraphs || [], ...section.items || []]; assert(paragraphs.length);
      paragraphs.forEach(pair);
    }
    assert(ids.has("goal") && ids.has("room"));
    for (const [, url] of rules.sources) assert.equal(new URL(url).protocol, "https:");
  }
});
test("rules retain the implemented variants, all ten poker ranks and all seven Xiangqi pieces", () => {
  assert.equal(data.poker.sections.find((s) => s.id === "rankings").items.length, 10);
  assert.equal(data.xiangqi.sections.find((s) => s.id === "pieces").items.length, 7);
  assert.match(JSON.stringify(data.poker), /short all-in raise also reopens/);
  assert.match(JSON.stringify(data.poker), /side pots/);
  assert.match(JSON.stringify(data.gomoku), /Six or more in a row also wins/);
  assert.match(JSON.stringify(data.xiangqi), /stalemate is a loss/);
  assert.match(JSON.stringify(data.xiangqi), /120 consecutive plies/);
  assert.match(read("app.js"), /BoardGameRules.open\("poker", "rankings"\)/);
  assert.doesNotMatch(read("index.html"), /id="handRankModal"/);
});

test("Millions editions keep separate rule entries and six modern role anchors in the shared UI", () => {
  assert.notStrictEqual(data.million2024, data.million);
  assert.deepEqual(data.million2024.title, ["百万美金 2024 规则", "Millions of Dollars 2024 Rules"]);
  assert.deepEqual(data.million.title, ["百万美金规则", "Millions of Dollars Rules"]);
  const modernIds = data.million2024.sections.map(s => s.id);
  assert.deepEqual(modernIds.filter(id => id.startsWith("role-")),
    ["role-tech", "role-acrobat", "role-brute", "role-mentalist", "role-brain", "role-driver"]);
  for (const id of ["goal", "setup", "flow", "planning", "negotiation", "ready", "roles", "split", "three-player", "club", "room"]) assert(modernIds.includes(id), id);
  for (const id of ["role-snitch", "role-crook", "role-mastermind", "variants", "brute-sharing"]) {
    assert(data.million.sections.some(s => s.id === id), `2016 retains ${id}`);
    assert(!modernIds.includes(id), `2024 excludes ${id}`);
  }
  assert.deepEqual(data.million2024.sources.map(([, url]) => url), [
    "https://www.grailgames.games/our-games/millions-of-dollars",
    "https://www.grailgames.games/s/RulesRole-S_MoD_EN.pdf"
  ]);
  const html = read("million.html"), client = read("million.js");
  assert.match(html, /id="edition"/);
  for (const edition of ["2016", "2024"]) assert(html.includes(`value="${edition}"`));
  assert.match(client, /modern\(\)\s*\?\s*"million2024"\s*:\s*"million"/);
  assert.match(client, /dataset\.rulesGame\s*=\s*rulesGame\(\)/);
  assert(client.includes('data-rules-section="role-${id}"'));
});

test("truth or dare rules cover direct pairs, together, allowances and consent", () => {
  assert.deepEqual(data.truth.title, ["真心话大冒险规则", "Truth or Dare Rules"]);
  const rules = JSON.stringify(data.truth);
  for (const text of ["2–8", "Pass & play", "Online", "Truth only", "Dare only", "Mixed", "no intensity levels", "tracked per respondent", "including replaced or skipped prompts", "bank is not recycled", "200 Truth and 100 Dare prompts", "no question limit", "no fixed endpoint", "Random pairs", "Respondent asks next", "Answer together", "two replacements per round", "240 characters", "without using anyone's skips", "consent", "no alcohol", "only skip", "five minutes", "final 20 seconds", "skips for the entire game"]) assert(rules.includes(text), text);
  assert(!rules.includes("highest score wins"));assert(!rules.includes("3, 5 or 8 total rounds"));
  assert(!rules.includes("1–2 means Truth"), "dice no longer choose prompt category");
  assert.equal(data.truth.sources.length, 0, "original club variant has no external official ruleset");
  assert.match(read("truth.html"), /data-rules-game="truth"/);
  assert.match(read("index.html"), /class="club-game truth-game" href="truth.html"/);
});

test("Cities & Knights uses the shared bilingual reader and all 54 official progress cards", () => {
  const cities = require('./catan-cities-data');
  assert.equal(Object.keys(cities.cards).length,25);
  assert.equal(Object.values(cities.cards).reduce((n,c)=>n+c[1],0),54);
  for(const [title,zh,en] of cities.rules) { assert(title.includes('/')); assert(zh.length>20); assert(en.length>20); }
  for(const card of Object.values(cities.cards)) { assert(card[2]);assert(card[3]);assert(card[4]);assert(card[5]); }
  assert.match(cities.source,/www\.catan\.com.*2025/);
  assert.match(read('catan-cities-ui.js'),/BoardGameRules.prepare/);
  assert.match(read('catan.html'),/catan-cities-data\.js/);
  assert.match(read('game-rules.js'),/play continues without pausing/);
});

test("metropolis rules explain the marker, bonus points and retained city in both languages", () => {
  const rules = require('./catan-cities-data').rules.find(([title])=>title.startsWith('城市改良与都会'));
  for (const text of [rules.slice(1).join(' '), read('catan-cities-ui.js')]) {
    for (const detail of ['同一项改良升到五级', '都会标记和额外 2 分', '你的城市仍归你', '之后升到五级也抢不走', 'same branch before you', '2 bonus VP from you', 'Your city remains yours', 'even when others later reach level 5']) assert(text.includes(detail),detail);
    assert(!text.includes('别人先到五级可夺走并保有'));
  }
});

test("knight help and rules explain blocked roads and exclusive building sites", () => {
  const cities = require('./catan-cities-data');
  const rules = cities.rules.find(([title])=>title==='骑士 / Knights');
  assert.equal(cities.knightPlacement.length,2);
  for (const [zh,en] of cities.knightPlacement) { assert(rules[1].includes(zh)); assert(rules[2].includes(en)); }
  const text = cities.knightPlacement.flat().join(' ');
  for (const detail of ['骑士未激活也一样', '另一端已经连着', '不能跳过骑士凭空新起一段路', '即使都是自己的也不行', '下一个自己的回合', 'even if the knight is inactive', 'already connects', 'cannot share an intersection', 'wait until your next turn']) assert(text.includes(detail),detail);
  assert.match(read('catan-cities-ui.js'), /if\(name==="knight"\)paragraphs\.push\(\.\.\.D\.knightPlacement\)/);
});
