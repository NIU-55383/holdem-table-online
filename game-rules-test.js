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

test("truth or dare rules cover highest/lowest contests, categories, ties and consent", () => {
  assert.deepEqual(data.truth.title, ["真心话大冒险规则", "Truth or Dare Rules"]);
  const rules = JSON.stringify(data.truth);
  for (const text of ["2–12", "Pass & play", "Online", "Truth only", "Dare only", "Both", "Chill", "Heat", "Wild", "Unmasked", "Showdown", "30 Truth and 20 Dare prompts", "3, 5 or 8 total rounds", "highest roller", "lowest roller", "only those tied highest reroll", "only those tied lowest reroll", "everyone rerolls", "240 characters", "no score or round cost", "consent", "no alcohol", "only skip for 0", "five minutes", "final 20 seconds"]) assert(rules.includes(text), text);
  assert(!rules.includes("1–2 means Truth"), "dice no longer choose prompt category");
  assert.equal(data.truth.sources.length, 0, "original club variant has no external official ruleset");
  assert.match(read("truth.html"), /data-rules-game="truth"/);
  assert.match(read("index.html"), /class="club-game truth-game" href="truth.html"/);
});
