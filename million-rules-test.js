"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rules = require("./game-rules-data").million;
const D = require("./million-data");
const E = require("./million-engine");

const sectionIds = ["goal","setup","flow","planning","negotiation","refunds","roles","role-snitch","role-brute","role-driver","role-crook","role-mastermind","heist","split","example","three-player","variants","club","ready","room"];
const roles = [
  ["driver", "司机", "Driver", "green", "绿色", "#5ccf7f"],
  ["brute", "暴徒", "Brute", "red", "红色", "#ef6b6b"],
  ["crook", "恶棍", "Crook", "blue", "蓝色", "#4fb3e8"],
  ["snitch", "告密者", "Snitch", "purple", "紫色", "#b48ef2"],
  ["mastermind", "谋士", "Mastermind", "gold", "金色", "#e6b450"]
];
function section(id) {
  const value = rules.sections.find(item => item.id === id);
  assert.ok(value, `Missing rules section: ${id}`);
  return value;
}
function text(id, language) {
  const value = section(id);
  return [...value.paragraphs || [], ...value.items || []].map(pair => pair[language]).join("\n");
}
function covers(id, pairs) {
  for (const [zh, en] of pairs) {
    assert.match(text(id, 0), zh, `${id}: Chinese ${zh}`);
    assert.match(text(id, 1), en, `${id}: English ${en}`);
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
  covers("club", [[/暴徒不分赃.*不是旧版官方规则/, /Brute does not share.*not the 2016 rulebook/],
    [/默认暴徒参与分赃/, /By default Brute shares/], [/只退保证金、拿威胁卡/, /only recovers the ante and earns a threat/],
    [/只剩告密者.*独存罚款/, /Snitch left alone.*penalty/], [/房主在开局前更改/, /host.*before starting/]]);
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
