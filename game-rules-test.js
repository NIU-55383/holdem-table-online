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
test("Bridge keeps complete bilingual rules and opt-in bidding hints without retired lesson modules", () => {
  const html = read("bridge.html"), rules = html.match(/<dialog id="rulesDialog"[\s\S]*?<\/dialog>/)[0];
  assert.equal([...html.matchAll(/<dialog[^>]*data-rules-dialog/g)].length, 1);
  for (const title of ["Partners & goal", "The auction", "Lead, dummy & play", "Scoring & vulnerability", "Bots & room"]) assert(rules.includes(title), title);
  assert.equal([...rules.matchAll(/<section>/g)].length, 5);
  assert.equal([...rules.matchAll(/<p lang="en">/g)].length, 11);
  const guide = rules.match(/<section id="biddingGuide"[\s\S]*?<\/section>/)[0];
  assert.match(guide, /A 算 4 点、K 算 3 点、Q 算 2 点、J 算 1 点/);
  assert.match(guide, /15–17 点且均型/);
  assert.match(guide, /你和搭档的合计牌力/);
  assert.match(guide, /public calls/);
  assert.equal([...guide.matchAll(/<li>/g)].length, [...guide.matchAll(/<small lang="en">/g)].length);
  assert.match(html, /id="biddingHintsCreate" type="checkbox"/);
  assert.match(html, /src="bridge-bidding.js"/);
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

function citiesSection(key) {
  const section = require('./catan-cities-data').ruleSections.find(section => section.key === key);
  assert(section, 'Missing Cities & Knights rule section: ' + key);
  return section;
}

function citiesText(key) { return citiesSection(key).items.flat().join(' '); }

test("Cities & Knights introductions and every progress card have bilingual bullet content", () => {
  const cities = require('./catan-cities-data'), keys = new Set();
  assert(cities.ruleSections.length >= cities.rules.length);
  function checkItems(items, name) {
    assert(Array.isArray(items) && items.length >= 2, name + ' must have separate rule points');
    for (const item of items) {
      assert(Array.isArray(item) && (item.length === 4 || item.length === 5), name + ' has bilingual labels and bodies');
      assert(item.slice(0, 4).every(text => typeof text === 'string' && text.trim()), name);
      for (const index of [0, 2]) assert.match(item[index], /[\u4e00-\u9fff]/, name);
      for (const index of [1, 3]) assert.match(item[index], /[A-Za-z]/, name);
      if (item.length === 5) assert.equal(typeof item[4], 'boolean', name + ' table flag');
    }
  }
  for (const section of cities.ruleSections) {
    assert.equal(typeof section.key, 'string');
    assert(!keys.has(section.key), 'Duplicate rule section: ' + section.key); keys.add(section.key);
    assert.match(Array.isArray(section.title) ? section.title.join(' ') : section.title, /[\u4e00-\u9fff]/);
    assert.match(Array.isArray(section.title) ? section.title.join(' ') : section.title, /[A-Za-z]/);
    checkItems(section.items, section.key);
  }
  for (const key of ['knight', 'barbarians', 'walls']) assert(keys.has(key), key);
  assert.deepEqual(Object.keys(cities.cardDetails).sort(), Object.keys(cities.cards).sort());
  for (const [key, items] of Object.entries(cities.cardDetails)) checkItems(items, key);
  const ui = read('catan-cities-ui.js');
  assert.match(ui, /D\.ruleSections/);
  assert.match(ui, /D\.cardDetails/);
  for (const [entry, section] of [['knight', 'knight'], ['barbarians', 'barbarians'], ['wall', 'walls']]) {
    assert.match(ui, new RegExp(entry + ':\\s*"' + section + '"'));
  }
});

test("metropolis rules retain marker transfers, bonus points and the original city", () => {
  const cities = require('./catan-cities-data');
  const legacy = cities.rules.find(([title]) => title.startsWith('城市改良与都会'));
  assert(legacy && legacy[1] && legacy[2]);
  const text = cities.ruleSections.filter(section => /improve|metropol/i.test(section.key)).map(section => section.items.flat().join(' ')).join(' ');
  assert(text, 'Improvement or metropolis bullets are present');
  for (const concept of [/都会/, /metropolis/i, /2\s*(分|胜利点)/, /2\s*(bonus\s*)?VP/i, /5\s*级|五级/, /level\s*5/i, /城市.{0,12}(仍|保留|归)/, /city.{0,35}(remain|keep|yours|belongs|stays theirs)/i]) assert.match(text, concept);
  assert.doesNotMatch(text, /别人先到五级可夺走并保有/);
});

test("knight help retains promotion limits, blocked roads and exclusive building sites", () => {
  const cities = require('./catan-cities-data');
  const legacy = cities.rules.find(([title]) => title === '骑士 / Knights');
  assert.equal(cities.knightPlacement.length, 2);
  for (const [zh, en] of cities.knightPlacement) { assert(legacy[1].includes(zh)); assert(legacy[2].includes(en)); }
  const text = citiesText('knight');
  for (const concept of [/政治.{0,16}(3\s*级|三级)/, /Politics.{0,16}(level\s*3|3)/i, /每.{0,8}骑士.{0,8}每回合.{0,12}(一次|1\s*次)/, /once per turn/i, /晋升.{0,20}(不要求|不需要|无需).{0,12}激活/, /inactive/i, /最长道路/, /Longest (Road|Route)/i, /(不能.{0,20}(同一个|同一).{0,12}(交叉点|路口)|一个交叉点只能放一名骑士或一座建筑)/, /cannot share|cannot occupy|may not share/i, /下一个自己的回合|下次自己的回合/, /next (own |your )?turn/i]) assert.match(text, concept);
});

test("barbarian and wall bullets explain strength, ties, losses and whole-hand discards", () => {
  const attack = citiesText('barbarians'), walls = citiesText('walls');
  for (const concept of [/7\s*格/, /普通城市/, /已激活/, /并列/, /1\s*分/, /1\s*(bonus\s*)?VP/i, /城墙/, /metropol/i, /deactivat/i, /起点|归零/]) assert.match(attack, concept);
  for (const threshold of ['7', '9', '11', '13']) assert(walls.includes(threshold), 'Wall threshold ' + threshold);
  for (const concept of [/资源/, /商品/, /一半/, /向下取整/, /resources/i, /commodities/i, /half/i, /round.*down/i]) assert.match(walls, concept);
});


test("combined Catan exposes only the four recommended layouts with bilingual rules and 16 VP", () => {
  const maps=require("./catan-maps"),cities=require("./catan-cities-data");
  assert.equal(maps.maps.length,13);
  assert.deepEqual(maps.combinedMaps.map(m=>m.id),["cities-shores-1","cities-shores-2","cities-desert-1","cities-desert-2"]);
  for(const m of maps.combinedMaps){assert.equal(m.target,16);assert(m.cities);assert(["shores","desert"].includes(m.family));assert.equal(m.players,maps.get(m.baseMapId).players);}
  assert(cities.combinedRules.length>=15);
  for(const [zh,en] of cities.combinedRules){assert.match(zh,/[\u4e00-\u9fff]/);assert.match(en,/[A-Za-z]/);}
  const content=cities.combinedRules.flat().join(" ");
  for(const pattern of [/16 VP/,/gold/,/pirate/,/Diplomacy/,/Taxation/,/ship/,/not.*commodities/])assert.match(content,pattern);
  for(const key of ["roads","diplomacy","merchant","taxation"])assert.equal(cities.combinedCardDetails[key][0].length,4);
  for(const [,url] of cities.combinedSources)assert.equal(new URL(url).hostname,"www.catan.com");
  assert.match(read("catan.html"),/data-edition="combined"/);
});
