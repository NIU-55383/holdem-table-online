"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MillionData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROLES = Object.freeze(Object.fromEntries([
    ["driver", "司机", "Driver", "#5ccf7f",
      "唯一且未被告密淘汰时退回保证金并分赃；每个其他分赃角色付你100万（$1M）车费。同一玩家的角色间付款抵消。",
      "If unique and not named by the Snitch, recover your ante and share. Each other sharing character pays you $1M. Payments between your own characters cancel out."],
    ["brute", "暴徒", "Brute", "#ef6b6b",
      "保证金总会退回，包括撞车或被告密淘汰。唯一且未被点名时参与分赃，并获得一张下轮起可用的威胁卡；每张只查看对手一张角色牌。",
      "Always recover your ante, even when duplicated or named. If unique and not named, share and earn a threat usable from the next round. Each threat inspects one opponent's character card."],
    ["crook", "恶棍", "Crook", "#4fb3e8",
      "唯一且未被点名时退回保证金并分赃；若暴徒也参与分赃，再从暴徒处拿走200万（$2M），可以拿其原有现金。",
      "If unique and not named, recover your ante and share. Take $2M from a Brute who also shares, including their older cash."],
    ["snitch", "告密者", "Snitch", "#b48ef2",
      "优先结算。唯一在场时退回保证金，必须点名一种中央公开的其他角色，不能跳过；该角色仍在场者全部淘汰。最后若只剩告密者，扣300万（$3M）且不分赃；有其他角色一起留下则正常分赃。",
      "Resolve first. If unique, recover your ante and MUST name another publicly shown role; you cannot pass. All active characters of that role are eliminated. If only the Snitch remains, lose $3M and take no loot; otherwise share normally."],
    ["mastermind", "谋士", "Mastermind", "#e6b450",
      "唯一且未被点名时退回保证金并分赃；先把总赃款增加200万（$2M），再由所有留下的角色平分。",
      "If unique and not named, recover your ante and share. Add $2M to the total loot before dividing it among all surviving characters."]
  ].map(([id, zh, en, color, descriptionZh, descriptionEn]) => [id, Object.freeze({
    id, zh, en, name: zh, english: en, color,
    description: Object.freeze({ zh: descriptionZh, en: descriptionEn }),
    desc: Object.freeze({ zh: descriptionZh, en: descriptionEn })
  })])));
  const ROLE_IDS = Object.freeze(Object.keys(ROLES));
  const MODERN_ROLES = Object.freeze(Object.fromEntries([
    ["tech", "技术员", "Tech", "#b48ef2", "snitch", "点名一种已公开角色；独自留下罚500万，不分赃", "Name a revealed role; alone: lose $5M, no share"],
    ["acrobat", "飞贼", "Acrobat", "#e778a4", "acrobat", "先从中央拿500万，再参与分赃", "Take $5M from the center, then share"],
    ["brute", "暴徒", "Brute", "#ef6b6b", "brute", "每个暴徒拿200万，出局也能拿；唯一时分赃", "Each takes $2M even if eliminated; unique Brute shares"],
    ["mentalist", "读心者", "Mentalist", "#4fb3e8", "crook", "从仍在场的暴徒、技术员或飞贼中选一位偷200万", "Steal $2M from one surviving Brute, Tech or Acrobat"],
    ["brain", "谋士", "Brain", "#e6b450", "mastermind", "向中央再加入一份赃款牌金额", "Add the loot card's value to the center again"],
    ["driver", "司机", "Driver", "#5ccf7f", "driver", "每个仍在场的角色让你从中央拿100万", "Take $1M from the center per surviving role"]
  ].map(([id, zh, en, color, art, zhText, enText]) => [id, Object.freeze({
    id, zh, en, color, art, name: zh, english: en,
    description: Object.freeze({ zh: zhText, en: enText }), desc: Object.freeze({ zh: zhText, en: enText })
  })])));
  const MODERN_ROLE_IDS = Object.freeze(Object.keys(MODERN_ROLES));
  const rolesForEdition = edition => edition === "2024" ? MODERN_ROLES : ROLES;
  function rolesForCount(count, edition = "2016") {
    if (!Number.isInteger(count) || count < 3 || count > (edition === "2024" ? 9 : 8)) throw Error("人数不符合所选版本 / Invalid player count for this edition");
    if (edition === "2024") return MODERN_ROLE_IDS.filter(r =>
      (r !== "brain" || count >= 7) && (r !== "tech" || count === 3 || count >= 6) && (r !== "mentalist" || count !== 4));
    return ROLE_IDS.slice(0, count === 3 || count >= 7 ? 5 : count >= 5 ? 4 : 3);
  }
  const ACTION_FIELDS = Object.freeze({
    choose: ["roles"], withdraw: ["slot"], ready: ["ready"], transfer: ["to", "amount"],
    threat: ["target", "slot"], offer: ["payer", "quitter", "slot", "amount"],
    respond: ["offerId", "accept"], cancel: ["offerId"], snitch: ["role"], next: [],
    claim: ["roles"], callVote: [], vote: ["yes"], steal: ["target", "slot"]
  });
  return Object.freeze({ ROLES, ROLE_IDS, MODERN_ROLES, MODERN_ROLE_IDS, rolesForEdition, rolesForCount, ACTION_FIELDS,
    INITIAL_CASH: 500, MAX_ROUNDS: 8, WIN_CASH: 2000, CASH_UNIT: 10000,
    TITLE: Object.freeze({ zh: "百万美金", en: "Millions of Dollars" }) });
});
