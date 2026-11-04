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

test("truth or dare rules cover direct pairs, together, allowances and consent", () => {
  assert.deepEqual(data.truth.title, ["真心话大冒险规则", "Truth or Dare Rules"]);
  const rules = JSON.stringify(data.truth);
  for (const text of ["2–8", "Pass & play", "Online", "Truth only", "Dare only", "Mixed", "Chill", "Heat", "Wild", "Unmasked", "Showdown", "30 Truth and 20 Dare prompts", "no question limit", "no fixed endpoint", "Random pairs", "Respondent asks next", "Answer together", "two replacements per round", "240 characters", "without using anyone's skips", "consent", "no alcohol", "only skip", "five minutes", "final 20 seconds", "skips for the entire game"]) assert(rules.includes(text), text);
  assert(!rules.includes("highest score wins"));assert(!rules.includes("3, 5 or 8 total rounds"));
  assert(!rules.includes("1–2 means Truth"), "dice no longer choose prompt category");
  assert.equal(data.truth.sources.length, 0, "original club variant has no external official ruleset");
  assert.match(read("truth.html"), /data-rules-game="truth"/);
  assert.match(read("index.html"), /class="club-game truth-game" href="truth.html"/);
});
