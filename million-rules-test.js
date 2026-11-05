"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rules = require("./game-rules-data").million;
const modernRules = require("./game-rules-data").million2024;
const D = require("./million-data");
const E = require("./million-engine");

const sectionIds = ["goal","setup","flow","planning","negotiation","refunds","roles","role-snitch","role-brute","role-driver","role-crook","role-mastermind","heist","split","example","three-player","variants","brute-sharing","club","ready","room"];
const roles = [
  ["driver", "司机", "Driver", "green", "绿色", "#5ccf7f"],
  ["brute", "暴徒", "Brute", "red", "红色", "#ef6b6b"],
  ["crook", "恶棍", "Crook", "blue", "蓝色", "#4fb3e8"],
  ["snitch", "告密者", "Snitch", "purple", "紫色", "#b48ef2"],
  ["mastermind", "谋士", "Mastermind", "gold", "金色", "#e6b450"]
];
function section(id, source = rules) {
  const value = source.sections.find(item => item.id === id);
  assert.ok(value, `Missing rules section: ${id}`);
  return value;
}
function text(id, language, source = rules) {
  const value = section(id, source);
  return [...value.paragraphs || [], ...value.items || []].map(pair => pair[language]).join("\n");
}
function covers(id, pairs, source = rules) {
  for (const [zh, en] of pairs) {
    assert.match(text(id, 0, source), zh, `${id}: Chinese ${zh}`);
    assert.match(text(id, 1, source), en, `${id}: English ${en}`);
  }
}
const names = count => Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
const fixed = () => 0;
function choose(game, choices) {
  choices.forEach((choice, actor) => E.act(game, actor, { type: "choose", roles: [].concat(choice) }, fixed));
  assert.equal(game.phase, "negotiation");
}
function ready(game) {
  for (const actor of E.requiredActors(game)) E.act(game, actor, { type: "ready", ready: true }, fixed);
}


test("2016 rules use bilingual sections and stable per-character navigation", () => {
  assert.deepEqual(rules.title, ["百万美金规则", "Millions of Dollars Rules"]);
  assert.deepEqual(rules.sections.map(s => s.id), sectionIds);
  assert.equal(new Set(sectionIds).size, sectionIds.length);
  for (const s of rules.sections) {
    const pairs = [s.title, ...s.paragraphs || [], ...s.items || []];
    assert(pairs.length > 1);
    for (const pair of pairs) {
      assert.equal(pair.length, 2);
      assert.match(pair[0], /[\u4e00-\u9fff]/);
      assert.match(pair[1], /[A-Za-z]/);
      assert(pair.every(t => t.trim() === t));
    }
  }
});
test("rules work in Browser and Node without a room and retain official source links", () => {
  const source = fs.readFileSync(path.join(__dirname, "game-rules-data.js"), "utf8");
  const browser = { window: {} }; vm.runInNewContext(source, browser);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.BoardGameRuleData.million)), rules);
  assert(rules.sources.some(([, url]) => url.endsWith("e3-millions-of-dollars-rulebook.pdf")));
  assert(rules.sources.some(([, url]) => url.endsWith("ba-millions-of-dollars-regle.pdf")));
});
test("all five colors stay unchanged and each role has a direct detail section", () => {
  assert.deepEqual(D.ROLE_IDS, roles.map(([id]) => id));
  for (const [id, zh, en, colorEn, colorZh, color] of roles) {
    assert.equal(D.ROLES[id].color, color);
    assert.equal(D.ROLES[id].zh, zh);
    assert.equal(D.ROLES[id].en, en);
    assert(text("roles", 0).includes(colorZh));
    assert(text("roles", 1).includes(colorEn));
    assert(section("role-" + id));
    assert.match(D.ROLES[id].description.zh, /保证金/);
    assert.match(D.ROLES[id].description.en, /ante/);
  }
});
test("2016 player counts, starting cash, targets and defaults match the engine", () => {
  assert.equal(D.INITIAL_CASH, 500); assert.equal(D.WIN_CASH, 2000); assert.equal(D.MAX_ROUNDS, 8);
  for (let count = 3; count <= 8; count++) {
    const g = E.createGame(names(count), {}, fixed);
    assert.deepEqual(g.availableRoles, D.ROLE_IDS.slice(0, count === 3 || count >= 7 ? 5 : count >= 5 ? 4 : 3));
    assert.equal(g.slotsPerPlayer, count === 3 ? 2 : 1);
    assert.deepEqual(g.settings, { bruteShares: true, noRepeat: false });
  }
  covers("goal", [[/2016/, /2016/], [/500 万/, /\$5M/], [/2000 万/, /\$20M/], [/8 轮/, /8 rounds/],
    [/本轮参与分赃/, /shared that round/], [/同分共同获胜/, /Ties share victory/]]);
  covers("setup", [[/4 人使用司机、暴徒、恶棍/, /Driver, Brute and Crook with 4/], [/5-6 人加入告密者/, /Snitch with 5-6/], [/7-8 人再加入谋士/, /Mastermind with 7-8/]]);
});
test("random loot is explicitly not passed off as the original fixed deck", () => {
  covers("setup", [[/10 张.*8 张/, /8 of its 10/], [/用过即弃置/, /discard one each round/]]);
  covers("club", [[/尚未完全校对/, /not fully verified/], [/800、900、1000、1100 或 1200/, /\$8M, \$9M, \$10M, \$11M or \$12M/],
    [/不能.*当作官方牌组/, /not the official deck/], [/随机首位带头人/, /random first leader/]]);
  covers("goal", [[/不混用 2024/, /not the 2024/]]);
});
test("public role clues stay anonymous, choices lock and withdrawal does not redraw clues", () => {
  covers("planning", [[/藏起一张.*其余公开/, /hide one.*reveal the rest/],
    [/不告诉你是谁/, /not owners/], [/退出不会移除公开牌/, /Withdrawals do not remove/],
    [/不能改选/, /cannot change/], [/破产仍能参加/, /does not prevent participation/]]);
});
test("full-ante refunds include reserve subsidies and never double-refund", () => {
  covers("refunds", [[/缺额由储备补足/, /shortfall funding/], [/整笔 200 万/, /full \$2M/],
    [/同一角色不会退两次/, /Never refund.*twice/], [/现金不会扣成负数/, /do not go below zero/]]);
  const g = E.createGame(names(4), {}, fixed); g.ante = 200; g.players[0].cash = 100;
  choose(g, ["driver", "brute", "crook", "brute"]);
  assert.equal(g.players[0].slots[0].paidAnte, 100);
  E.act(g, 0, { type: "withdraw", slot: 0 });
  assert.equal(g.players[0].cash, 200);
  assert.throws(() => E.act(g, 0, { type: "withdraw", slot: 0 }));
});
test("negotiation states binding deals, million-denomination payments and round-end secrecy", () => {
  covers("negotiation", [[/先付款，再撤回角色/, /pay first, then withdraw/], [/不能超过现有现金/, /within your current cash/],
    [/100 万.*整数倍/, /whole \$1M/], [/退出不可反悔/, /Withdrawal is final/],
    [/保持沉默/, /stays silent/], [/保密到本轮结束/, /secret until round end/]]);
});
test("Snitch role description itself covers mandatory naming and conditional lone penalty", () => {
  assert.match(D.ROLES.snitch.description.zh, /必须.*不能跳过/);
  assert.match(D.ROLES.snitch.description.en, /MUST.*cannot pass/);
  assert.match(D.ROLES.snitch.description.zh, /只剩告密者.*300万.*不分赃/);
  assert.match(D.ROLES.snitch.description.en, /only the Snitch remains.*\$3M.*no loot/);
  covers("role-snitch", [[/两名或更多.*没收保证金/, /Two or more.*forfeit their antes/],
    [/必须.*不能选择不点名/, /MUST.*No passing/], [/角色种类，不是某位玩家/, /role type, not a player/],
    [/全在谈判中退出.*不会淘汰/, /already withdrew.*eliminates nobody/],
    [/不是只要告密者.*在车上.*就扣钱/, /Merely staying.*does not cause a penalty/],
    [/还有其他角色留下.*正常分一份/, /With another survivor.*shares normally/]]);
});
test("Brute threats inspect one character from a later round, never both slots", () => {
  covers("role-brute", [[/以后轮次使用/, /later rounds/], [/一张角色牌/, /single card/],
    [/不能一次看两个/, /not both/], [/刚拿到的/, /newly earned/], [/不让全桌看到/, /nor reveals the answer to the table/]]);
});
test("role abilities and payout order match the official worked example", () => {
  covers("role-driver", [[/每个其他分赃角色/, /every other sharing character/]]);
  covers("role-crook", [[/原有现金/, /older cash/]]);
  covers("role-mastermind", [[/不是谋士自己额外拿/, /not a personal/]]);
  covers("split", [[/余款回储备/, /remainder to the reserve/], [/再从储备拿 100 万/, /\$1M from the reserve/]]);
  assert.equal(section("split").items.length, 6);
  const g = E.createGame(names(7), {}, fixed);
  g.loot = 800; g.ante = 100; g.bonusRole = "brute";
  choose(g, ["mastermind", "crook", "brute", "driver", "driver", "snitch", "crook"]);
  for (const i of [3, 4, 5, 6]) E.act(g, i, { type: "withdraw", slot: 0 });
  ready(g);
  assert.deepEqual(g.players.slice(0, 3).map(p => p.cash - 500), [300, 500, 200]);
  assert.equal(g.result.remainder, 100);
  assert.equal(g.publicFund, 0);
  covers("example", [[/谋士 300 万、恶棍 500 万、暴徒 200 万/, /Mastermind \$3M, Crook \$5M, Brute \$2M/]]);
});
test("three-player rules keep separate roles and cancel same-owner transfers", () => {
  covers("three-player", [[/两个不同角色.*分别交保证金/, /two different characters.*ante for each/],
    [/藏一张、公开五张/, /hide one and reveal five/], [/两份/, /two shares/],
    [/内部抵消/, /cancels internally/], [/玩家总现金/, /player's total cash/]]);
});
test("official no-repeat and nonofficial Brute option are unambiguously distinguished", () => {
  covers("variants", [[/默认关闭/, /Off by default/], [/不能连续两轮/, /not use the same role in consecutive/],
    [/包括.*退出或被淘汰/, /even if it withdrew or was eliminated/], [/4-8 人/, /4-8 players/],
    [/三人组合用法是本馆扩展/, /three-player combination is a club extension/]]);
  covers("brute-sharing", [[/暴徒不分赃.*不是旧版官方规则/, /Brute does not share.*rather than the 2016 rulebook/],
    [/勾选（默认，旧版规则）/, /Checked \(default, 2016 rules\)/], [/参与平分赃款/, /shares the loot/],
    [/取消勾选/, /Unchecked/], [/只退保证金、拿威胁卡/, /only recovers the ante and earns a threat/],
    [/不付司机钱、不被恶棍拿钱.*不领赃款牌奖励/, /no loot share, Driver fare, Crook payment or loot-card bonus/],
    [/只剩告密者.*独存罚款/, /Snitch left alone.*penalty/], [/房主在开局前.*更改/, /host.*before starting/]]);
});
test("online confirmation and results do not give the host power over human choices", () => {
  covers("ready", [[/每人确认一次/, /confirms once/], [/未成交提议失效/, /expires pending offers/],
    [/掉线不算自动同意/, /Disconnection is not consent/], [/不能由房主代选/, /no right to choose for them/],
    [/保证金、谈判款、分赃、费用、奖励及罚款/, /antes, deals, shares, fees, bonuses and penalties/]]);
});
test("Shared room rules cover consent, five-minute grace, vacancies and opt-in 120-second idle", () => {
  covers("room", [[/转让房主须接任者同意.*申请.*现任房主同意/, /transfer needs the recipient's approval.*request.*current host's approval/],
    [/五分钟.*重连取消交接/, /five minutes; returning cancels succession/], [/顺时针.*下一位在线真人.*跳过机器人和离线者/, /clockwise.*next online human, skipping bots and offline/],
    [/主动离开立即交接/, /Explicitly leaving transfers it immediately/], [/不会自动夺回房主/, /does not reclaim hosting/],
    [/两次.*目标名字.*独立确认/, /two separate confirmations naming the target/], [/任一步都能取消/, /cancellation at either step/],
    [/旧确认失效/, /invalidates old confirmations/], [/保留.*座位、现金和游戏资产/, /preserves the seat, cash and game assets/],
    [/暂停游戏、机器人和倒计时/, /pauses gameplay, bots and timers/], [/聊天、表情和房间管理仍可/, /chat, reactions and room management remain available/],
    [/真人填第一个空位/, /human fills the first vacancy/], [/指定空位补机器人/, /bot in a specific vacancy/],
    [/所有空位填齐才.*继续/, /only when all vacancies are filled/], [/不能再占第二个座位/, /cannot take a second seat/],
    [/移除不是封禁/, /Removal is not a ban/], [/不会自动重入/, /not automatically reseated/], [/不会继承.*个人托管状态/, /do not inherit.*personal auto-play state/],
    [/掉线或重连不会自动开启托管/, /Disconnecting or reconnecting never automatically enables auto-play/],
    [/主动开始或停止自己的托管/, /voluntarily start or stop personal auto-play/], [/托管玩家仍显示在线/, /auto-playing humans remain online/],
    [/120 秒.*默认关闭.*只有现任房主能更改/, /120-second.*off by default.*only the current host can change/],
    [/最后 20 秒提醒/, /final 20 seconds/], [/有效行动或「我还在」重置/, /valid action or Stay acknowledgement resets/],
    [/聊天、头像或表情不会/, /chat, profiles and reactions do not/], [/空位暂停倒计时/, /Vacancies suspend deadlines/],
    [/关闭此策略清除计时.*保留个人主动/, /Disabling the policy clears timers.*preserving manually enabled/],
    [/房主交接和补位后继续适用/, /survives host succession and replacements/]]);
});

const covers2024 = (id, pairs) => covers(id, pairs, modernRules);
function choose2024(game, choices) {
  choices.forEach((choice, actor) => E.act(game, actor, { type: "choose", roles: [].concat(choice) }, fixed));
  assert.equal(game.phase, "claims");
}
function declare2024(game) {
  while (game.phase === "claims") E.act(game, game.claimActor,
    { type: "claim", roles: game.players[game.claimActor].slots.map(s => s.role) }, fixed);
  assert.equal(game.phase, "negotiation");
}
function negotiating2024(choices) {
  const game = E.createGame(names(choices.length), { edition: "2024" }, fixed);
  choose2024(game, choices); declare2024(game);
  return game;
}
function heist2024(game) {
  E.act(game, game.leader, { type: "callVote" });
  for (const actor of E.requiredActors(game)) {
    if (game.phase !== "negotiation") break;
    E.act(game, actor, { type: "vote", yes: true });
  }
}

test("2024 rules load in the browser and match player-count setup without changing 2016", () => {
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "game-rules-data.js"), "utf8"), browser);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.BoardGameRuleData.million2024)), modernRules);
  const pools = {
    3: ["tech", "acrobat", "brute", "mentalist", "driver"],
    4: ["acrobat", "brute", "driver"],
    5: ["acrobat", "brute", "mentalist", "driver"],
    6: ["tech", "acrobat", "brute", "mentalist", "driver"],
    7: ["tech", "acrobat", "brute", "mentalist", "brain", "driver"]
  };
  for (let count = 3; count <= 9; count++) {
    const g = E.createGame(names(count), { edition: "2024" }, fixed);
    assert.equal(g.edition, "2024"); assert.equal(g.maxRounds, 5); assert.equal(g.ante, 200);
    assert(g.players.every(p => p.cash === 1000));
    assert.equal(g.slotsPerPlayer, count === 3 ? 2 : 1);
    assert.deepEqual(g.availableRoles, pools[Math.min(count, 7)]);
  }
  for (const count of [2, 10]) assert.throws(() => E.createGame(names(count), { edition: "2024" }, fixed));
  assert.equal(E.createGame(names(4), {}, fixed).edition, "2016");
  covers2024("goal", [[/2024.*3-9 人/, /2024.*3-9 players/], [/起始 1000 万/, /starting with \$10M each/], [/最多 5 轮/, /up to 5 rounds/]]);
  covers2024("setup", [[/4 人：飞贼、暴徒、司机/, /4 players: Acrobat, Brute and Driver/],
    [/5 人.*加入读心者/, /5 players: add Mentalist/], [/3 人或 6 人.*加入技术员/, /3 or 6 players: also add Tech/],
    [/7-9 人.*加入谋士/, /7-9 players: also add Brain/], [/首轮带头人.*随机|随机.*首轮带头人/, /first leader randomly/]]);
});

test("2024 rules retain the actual legacy loot and mapped bonus configuration", () => {
  covers2024("club", [[/本馆沿用2016模式的赃款数值与奖励配置/, /retains the 2016 mode's loot values and bonus configuration/],
    [/800、900、1000、1100 或 1200/, /\$8M, \$9M, \$10M, \$11M or \$12M/],
    [/旧版对应人数.*或无奖励/, /old player-count-based role pool or none/],
    [/告密者.*技术员.*恶棍.*读心者.*谋士.*新版谋士/, /Snitch to Tech, Crook to Mentalist and Mastermind to Brain/],
    [/不另加飞贼奖励/, /no added Acrobat bonus/], [/没有对应存活角色就不加奖励/, /No surviving match means no bonus/],
    [/始终每角 200 万/, /always \$2M per role/]]);
  assert.doesNotMatch(JSON.stringify(modernRules), /尚未.*核实|尚未.*校对|not (?:fully )?verified|placeholder/i);
  const mapped = { snitch: "tech", crook: "mentalist", mastermind: "brain" };
  for (let count = 3; count <= 9; count++) {
    const pool = [null, ...D.rolesForCount(Math.min(count, 8)).map(r => mapped[r] || r)];
    const seenLoot = new Set(), seenBonuses = new Set();
    for (let sample = 0; sample < 60; sample++) {
      const value = (sample + 0.5) / 60, g = E.createGame(names(count), { edition: "2024" }, () => value);
      assert.equal(g.loot, 800 + Math.floor(value * 5) * 100);
      assert.equal(g.bonusRole, pool[Math.floor(value * pool.length)]);
      assert.equal(g.ante, 200);
      seenLoot.add(g.loot); seenBonuses.add(g.bonusRole);
    }
    assert.deepEqual([...seenLoot], [800, 900, 1000, 1100, 1200]);
    assert.deepEqual([...seenBonuses], pool);
  }
});

test("2024 public clues and clockwise bluff declarations never confirm private identities", () => {
  covers2024("planning", [[/锁定后不能改选/, /Locked choices cannot change/], [/混洗.*藏一张.*其余公开/, /Shuffle.*hide one.*reveal the rest/],
    [/不揭示归属/, /not owners/], [/退出也不会撤走/, /remain visible even after withdrawals/]]);
  covers2024("negotiation", [[/带头人.*顺时针.*必须声明/, /Starting with the leader.*clockwise.*must claim/],
    [/说真话.*撒谎/, /truthfully or as a bluff/], [/声明不是已证实的身份/, /Claims are not confirmed identities/],
    [/机器人也可能虚报/, /Bots can bluff too/]]);
  const g = E.createGame(names(4), { edition: "2024" }, fixed);
  choose2024(g, ["acrobat", "brute", "driver", "brute"]);
  assert.equal(g.revealedCards.length, 3);
  assert.deepEqual([...g.revealedCards, g.hiddenCard].sort(), ["acrobat", "brute", "brute", "driver"]);
  assert.throws(() => E.act(g, 1, { type: "claim", roles: ["driver"] }));
  const bluff = E.chooseBotAction(g, 0, fixed);
  assert.equal(bluff.type, "claim"); assert.notEqual(bluff.roles[0], "acrobat");
  E.act(g, 0, bluff); assert.equal(g.claimActor, 1);
  const view = E.publicGame(g, 1), observer = E.publicGame(g);
  assert.deepEqual(view.claims[0], bluff.roles);
  assert.equal(view.players[0].slots[0].role, null);
  assert.equal(view.players[1].slots[0].role, "brute");
  assert(observer.players.every(p => p.slots.every(s => s.role === null)));
  assert.equal(observer.hiddenCard, undefined); assert.equal(observer.hiddenCount, 1);
  declare2024(g);
  const cards = g.revealedCards.slice();
  E.act(g, 0, { type: "withdraw", slot: 0 });
  assert.deepEqual(g.revealedCards, cards);
  assert.equal(E.publicGame(g, 1).players[0].slots[0].role, null);
});

test("2024 antes are subsidized and fully refunded only on withdrawal, with binding deals", () => {
  covers2024("planning", [[/缺额由储备补足/, /reserve cover the shortfall/], [/完整的 200 万.*包括储备/, /full \$2M.*including reserve funding/],
    [/留下的保证金.*并入中央奖池.*不再.*退还.*被淘汰/, /Antes of roles that stay join the central pot.*not refunded.*eliminated/]]);
  covers2024("negotiation", [[/退出不可反悔/, /Withdrawal is final/], [/接受后同时付款并退出/, /accepting.*executes payment and withdrawal together/],
    [/直接转账不会自动.*退出/, /Direct transfers do not force withdrawal/], [/100 万.*不能超过现金/, /whole \$1M.*cannot exceed cash/],
    [/全部角色退出后不能继续交易.*仍有投票权/, /Fully withdrawn players cannot trade but still vote/]]);
  const g = E.createGame(names(4), { edition: "2024" }, fixed);
  g.players[0].cash = 100;
  choose2024(g, ["acrobat", "brute", "driver", "driver"]); declare2024(g);
  assert.equal(g.players[0].cash, 0); assert.equal(g.players[0].slots[0].paidAnte, 100);
  E.act(g, 0, { type: "withdraw", slot: 0 }); assert.equal(g.players[0].cash, 200);
  assert.throws(() => E.act(g, 0, { type: "withdraw", slot: 0 }));
  assert.throws(() => E.act(g, 0, { type: "transfer", to: 1, amount: 100 }));
  E.act(g, 1, { type: "offer", payer: 1, quitter: 2, slot: 0, amount: 100 });
  const offerId = g.offers[0].id;
  E.act(g, 2, { type: "respond", offerId, accept: true });
  assert.equal(g.players[2].cash, 1100); assert(g.players[2].slots[0].withdrawn);
  assert.throws(() => E.act(g, 2, { type: "respond", offerId, accept: true }));
  assert.equal(g.publicFund, 400);
  heist2024(g);
  assert.equal(g.publicFund, 0);
  assert(g.players[1].slots[0].status === "sharing" && !g.players[1].slots[0].refunded);
});

test("2024 votes use half of ALL players, include withdrawn seats and start immediately", () => {
  covers2024("ready", [[/只有带头人.*发起公开投票/, /Only the leader can call a public vote/],
    [/全体玩家每人一票.*完全退出者/, /Every player has one vote, including fully withdrawn players/],
    [/全体人数的一半.*向上取整/, /At least half of ALL players.*rounded up/], [/5 人需 3 票、6 人需 3 票/, /3 yes votes with either 5 or 6 players/],
    [/立即.*不必等待剩余玩家/, /immediately.*without waiting for remaining votes/],
    [/记带头人一张赞成票/, /records the leader's yes/], [/继续谈判.*再发起投票/, /negotiations continue.*another ballot/],
    [/掉线不算赞成/, /Disconnection is not a yes/], [/未成交提议失效/, /pending offers expire/]]);
  for (const count of [5, 6]) {
    const g = negotiating2024(Array(count).fill("brute"));
    for (let i = 1; i < count; i++) E.act(g, i, { type: "withdraw", slot: 0 });
    assert.throws(() => E.act(g, 1, { type: "callVote" }));
    E.act(g, 0, { type: "callVote" });
    assert.equal(g.vote.votes[0], true);
    for (let i = 1; i < count; i++) E.act(g, i, { type: "vote", yes: false });
    assert.equal(g.phase, "negotiation"); assert.equal(g.vote.open, false);
    E.act(g, 0, { type: "callVote" });
    E.act(g, count - 1, { type: "vote", yes: true });
    assert.equal(g.phase, "negotiation", "two of five or six is insufficient even with one active player");
    assert.throws(() => E.act(g, count - 1, { type: "vote", yes: true }));
    E.act(g, count - 2, { type: "vote", yes: true });
    assert.equal(g.phase, "results"); assert(g.vote.votes.some(v => v === null));
  }
});

test("2024 six-role rules match the ordered engine payouts and shared upward-rounded bonus", () => {
  covers2024("roles", [[/技术员.*飞贼.*暴徒.*读心者.*谋士.*司机/, /Tech, Acrobat, Brute, Mentalist, Brain, Driver/],
    [/被叫到时.*两个或更多.*全部淘汰/, /When a role is called, two or more.*all eliminated/]]);
  covers2024("role-tech", [[/必须.*已公开.*其他角色/, /MUST name another role.*public cards/], [/不能跳过/, /No passing/],
    [/不能.*暗牌/, /No passing, naming Tech or choosing a role found only on the hidden card/],
    [/全部退出.*无人因此出局/, /all withdrew eliminates nobody/], [/没有其他公开角色可选.*自动继续/, /no other public role available.*automatically/]]);
  covers2024("role-acrobat", [[/从中央奖池拿 500 万/, /takes \$5M from the central pot/], [/随后.*平分/, /then still shares/]]);
  covers2024("role-brute", [[/每个未主动退出.*200 万/, /EVERY non-withdrawn Brute takes \$2M/],
    [/重复撞车或被技术员淘汰/, /duplicated or eliminated by Tech/], [/不是另退.*保证金/, /not a separate ante refund/],
    [/只有唯一且未被淘汰.*平分/, /Only a unique, surviving Brute shares/], [/退出.*不再取款/, /withdrawn Brute.*no ability payout/]]);
  covers2024("role-mentalist", [[/仍在场的暴徒、技术员或飞贼.*一个角色/, /ONE participating Brute, Tech or Acrobat/],
    [/偷取 200 万/, /steals \$2M/], [/退出或被淘汰者不能选/, /Withdrawn and eliminated roles are ineligible/],
    [/没有合法目标就不偷/, /With no legal target, there is no theft/]]);
  covers2024("role-brain", [[/储备.*再加入.*牌上标明的金额/, /adds the loot card's printed value from the reserve.*again/],
    [/不是翻倍当前奖池/, /does not double the current pot/]]);
  covers2024("role-driver", [[/每个角色从中央拿 100 万.*包括司机自己/, /\$1M from the central pot for EVERY role.*including the Driver itself/],
    [/角色而非玩家/, /roles, not players/], [/不是向其他玩家收费/, /Other players do not pay fares/]]);
  covers2024("split", [[/每个存活.*奖励.*中央增加 100 万/, /each surviving role matching.*adds \$1M.*CENTRAL pot/],
    [/不是该角色的个人奖金/, /not to its owner's pocket/], [/所有存活角色.*向上取整.*储备补足/, /ALL surviving roles.*UP.*reserve covers/],
    [/暴徒只要存活也占一份/, /surviving Brute gets a share/], [/无人存活.*回储备/, /nobody survives.*reserve/],
    [/1000 万.*三个角色.*400 万.*200 万/, /\$10M.*three survivors.*\$4M.*\$2M/]]);
  assert.deepEqual(D.MODERN_ROLE_IDS, ["tech", "acrobat", "brute", "mentalist", "brain", "driver"]);
  const g = negotiating2024(["tech", "acrobat", "brute", "mentalist", "brain", "driver", "brute"]);
  g.bonusRole = "driver";
  E.act(g, 6, { type: "withdraw", slot: 0 }); heist2024(g);
  assert.equal(g.phase, "snitch");
  for (const role of [null, "tech", "pass"]) assert.throws(() => E.act(g, 0, { type: "snitch", role }));
  E.act(g, 0, { type: "snitch", role: "brute" });
  assert.equal(g.phase, "mentalist");
  assert.deepEqual(g.mentalist.targets.map(t => t.role), ["tech", "acrobat"]);
  assert.throws(() => E.act(g, 3, { type: "steal", target: 2, slot: 0 }));
  E.act(g, 3, { type: "steal", target: 1, slot: 0 });
  const payoutTypes = ["snitch", "acrobat-take", "brute-take", "mentalist-steal", "brain-add", "driver-take", "pool-bonus"];
  const payouts = g.logs.filter(l => payoutTypes.includes(l.type));
  assert.deepEqual(payouts.map(l => l.type), payoutTypes);
  assert.deepEqual(payouts.slice(1).map(l => l.amount), [500, 200, 200, 800, 500, 100]);
  assert.equal(g.result.totalLoot, 1700); assert.equal(g.result.share, 400); assert.equal(g.result.topUp, 300);
  assert.deepEqual(g.players.map(p => p.cash), [1200, 1500, 1000, 1400, 1200, 1700, 1000]);
  assert.equal(g.lootPool, 0); assert.equal(g.publicFund, 0);
});

test("2024 lone-Tech and limited-cash rules do not grant a bonus or a negative balance", () => {
  covers2024("role-tech", [[/只剩技术员.*损失 500 万.*不足则扣到 0/, /Tech is the only survivor, lose \$5M, capped at available cash/],
    [/不拿奖励或分赃/, /no bonus or loot/], [/还有其他角色存活.*正常.*平分/, /With another surviving role, Tech shares normally/]]);
  covers2024("club", [[/现金始终不为负/, /Cash never goes negative/], [/偷钱或罚款最多扣现有现金/, /thefts and fines are capped at available cash/],
    [/中央取款最多拿当前剩余奖池/, /ability payouts.*capped at the remaining pot/]]);
  for (const cash of [300, 1000]) {
    const g = E.createGame(names(6), { edition: "2024" }, fixed);
    g.players[0].cash = cash; g.bonusRole = "tech";
    choose2024(g, ["tech", "brute", "brute", "driver", "driver", "acrobat"]); declare2024(g);
    for (let i = 1; i < 6; i++) E.act(g, i, { type: "withdraw", slot: 0 });
    heist2024(g); E.act(g, 0, { type: "snitch", role: "brute" });
    assert.equal(g.result.penalty, Math.min(500, cash - 200));
    assert.equal(g.players[0].cash, Math.max(0, cash - 700));
    assert.equal(g.result.share, 0); assert.equal(g.lootPool, 0);
    assert(!g.logs.some(l => l.type === "pool-bonus" || l.type === "payout"));
  }
});

test("2024 three-player rules keep distinct roles, per-role withdrawals, shares and self-theft", () => {
  covers2024("three-player", [[/两个不同角色.*各缴 200 万/, /two different roles each.*\$2M per role/],
    [/公开五张、藏一张/, /reveal five and hide one/], [/退一个、两个都退或都留下/, /withdraw one, both or neither/],
    [/投票仍每人一票/, /one vote per player/], [/两角都存活就拿两份/, /keeping both roles earns two shares/],
    [/内部抵消.*现金不变/, /cancels internally without changing your cash/], [/玩家总现金/, /player's total cash/]]);
  const g = E.createGame(names(3), { edition: "2024" }, fixed);
  assert.throws(() => E.act(g, 0, { type: "choose", roles: ["acrobat", "acrobat"] }, fixed));
  choose2024(g, [["mentalist", "acrobat"], ["brute", "driver"], ["tech", "brute"]]); declare2024(g);
  assert.equal(g.revealedCards.length, 5);
  E.act(g, 1, { type: "withdraw", slot: 0 }); E.act(g, 2, { type: "withdraw", slot: 1 });
  assert.equal(g.players[1].cash, 800); assert.equal(g.players[1].slots[1].withdrawn, false);
  heist2024(g); E.act(g, 2, { type: "snitch", role: "brute" });
  const cash = g.players[0].cash;
  E.act(g, 0, { type: "steal", target: 0, slot: 1 });
  assert.equal(g.logs.find(l => l.type === "mentalist-steal").amount, 0);
  assert.equal(g.players[0].cash, cash + 2 * g.result.share);
});

test("2024 settlement selects one richest winner and the poorest next leader with clockwise ties", () => {
  covers2024("goal", [[/每轮全部结算后.*任何玩家.*5000 万/, /After a round is fully settled, anyone reaching \$50M/],
    [/全场现金最多者单独获胜.*不要求.*分赃/, /richest player overall is the sole winner, whether or not they shared/],
    [/第 5 轮结算后比较现金/, /compare cash after round 5/],
    [/带头人的下一座起顺时针.*不共同获胜/, /clockwise starting AFTER the current leader; victory is not shared/]]);
  covers2024("setup", [[/轮末现金最少者/, /poorest player after settlement/],
    [/最穷者并列.*带头人的下一座起顺时针/, /poorest-player ties clockwise starting after the current leader/]]);
  for (const mode of ["poorest", "target", "round-limit"]) {
    const g = negotiating2024(Array(4).fill("brute"));
    if (mode === "target") g.players[0].cash = g.players[2].cash = 4800;
    if (mode === "round-limit") g.round = 5;
    for (let i = 0; i < 4; i++) E.act(g, i, { type: "withdraw", slot: 0 });
    assert.equal(g.phase, "negotiation", "even $50M is checked only at settlement");
    heist2024(g); assert.equal(g.result.splitting.length, 0);
    if (mode === "poorest") {
      assert.equal(g.phase, "results"); assert.equal(g.nextLeader, 1);
      E.act(g, g.leader, { type: "next" }, fixed); assert.equal(g.leader, 1);
      E.act(g, 1, { type: "choose", roles: ["brute"] }, fixed);
    } else {
      assert.equal(g.phase, "over"); assert.equal(g.winReason, mode);
      assert.deepEqual(g.winners, [mode === "target" ? 2 : 1]);
    }
  }
});

test("2024 rules exclude intimidation and both old variants without removing 2016 help", () => {
  covers2024("club", [[/没有威胁卡/, /no intimidation cards/], [/不使用「角色不能连选」或「暴徒不分赃」/, /no no-repeat variant and no Brute-does-not-share option/],
    [/下一轮可以再次选择相同角色/, /Roles may be chosen again next round/], [/存活暴徒正常参与平分/, /surviving Brute shares normally/],
    [/不改变独立的 2016 模式/, /do not change the separate 2016 mode/]]);
  for (const options of [{ noRepeat: true }, { bruteShares: false }]) {
    assert.throws(() => E.createGame(names(4), { edition: "2024", ...options }, fixed));
    assert.doesNotThrow(() => E.createGame(names(4), options, fixed));
  }
  const g = negotiating2024(Array(4).fill("brute"));
  assert.throws(() => E.act(g, 0, { type: "threat", target: 1, slot: 0 }));
  assert.throws(() => E.act(g, 0, { type: "ready", ready: true }));
  heist2024(g);
  assert(g.players.every(p => p.threats === 0 && p.pendingThreats === 0));
  assert.equal(g.result.splitting.length, 0, "duplicated Brutes take $2M but never share");
  assert.equal(g.logs.filter(l => l.type === "brute-take" && l.amount === 200).length, 4);
  assert(section("brute-sharing")); assert(section("variants"));
});
