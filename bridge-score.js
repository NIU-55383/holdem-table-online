"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BridgeScore = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  function explain(contract, vulnerability, tricksTaken) {
    if (contract === "Passout") return { passedOut: true, rows: [], total: 0, nsScore: 0, winner: null };
    if (!contract || !["N", "E", "S", "W"].includes(contract.declarer) || !["C", "D", "H", "S", "NT"].includes(contract.strain)
      || !Number.isInteger(contract.level) || contract.level < 1 || contract.level > 7 || contract.doubled && contract.redoubled
      || !["NvNv", "VNv", "NvV", "VV"].includes(vulnerability) || !Number.isInteger(tricksTaken) || tricksTaken < 0 || tricksTaken > 13) return null;
    const declaring = ["N", "S"].includes(contract.declarer) ? 0 : 1;
    const vulnerable = vulnerability === "VV" || vulnerability === (declaring === 0 ? "VNv" : "NvV");
    const target = 6 + contract.level, difference = tricksTaken - target;
    const multiplier = contract.redoubled ? 4 : contract.doubled ? 2 : 1;
    const rows = [];
    const add = (id, zh, en, formula, points, noteZh = "", noteEn = "") => rows.push({ id, zh, en, formula, points, noteZh, noteEn });
    if (difference < 0) {
      const down = -difference, redouble = contract.redoubled ? 2 : 1;
      const penalty = (id, zh, en, count, rate) => {
        if (count) add(id, zh, en, `${count} × ${rate}${redouble === 2 ? " × 2" : ""}`, count * rate * redouble);
      };
      if (multiplier === 1) penalty("undertricks", `宕 ${down} 墩`, `Down ${down}`, down, vulnerable ? 100 : 50);
      else {
        penalty("undertrick-first", "第 1 墩罚分", "First undertrick", 1, vulnerable ? 200 : 100);
        if (vulnerable) penalty("undertrick-later", "其余各墩罚分", "Remaining undertricks", down - 1, 300);
        else {
          penalty("undertrick-2-3", "第 2–3 墩罚分", "Second and third undertricks", Math.min(2, down - 1), 200);
          penalty("undertrick-4-plus", "第 4 墩起罚分", "Fourth and later undertricks", Math.max(0, down - 3), 300);
        }
      }
    } else {
      const minor = ["C", "D"].includes(contract.strain);
      const base = contract.strain === "NT" ? 40 + (contract.level - 1) * 30 : contract.level * (minor ? 20 : 30);
      const baseFormula = contract.strain === "NT" ? contract.level === 1 ? "40" : `40 + ${contract.level - 1} × 30` : `${contract.level} × ${minor ? 20 : 30}`;
      const contractPoints = base * multiplier;
      add("contract", "定约墩分", "Contract trick points", multiplier === 1 ? baseFormula : `(${baseFormula}) × ${multiplier}`, contractPoints,
        `前 6 墩不计分；只计算定约要求的额外 ${contract.level} 墩。`, `The first 6 tricks score no points; count the ${contract.level} extra tricks promised.`);
      const game = contractPoints >= 100, bonus = game ? vulnerable ? 500 : 300 : 50;
      add("bonus", game ? "成局奖励" : "部分定约奖励", game ? "Game bonus" : "Partscore bonus", `${bonus}`, bonus,
        game ? `定约墩分 ${contractPoints} ≥ 100；${vulnerable ? "有局" : "无局"}。` : `定约墩分 ${contractPoints} < 100；超墩分不计入成局门槛。`,
        game ? `Contract points ${contractPoints} ≥ 100; ${vulnerable ? "vulnerable" : "not vulnerable"}.` : `Contract points ${contractPoints} < 100; overtricks do not count toward game.`);
      if (contract.level >= 6) {
        const grand = contract.level === 7, slam = (vulnerable ? 750 : 500) * (grand ? 2 : 1);
        add("slam", grand ? "大满贯奖励" : "小满贯奖励", grand ? "Grand slam bonus" : "Small slam bonus", `${slam}`, slam,
          `叫到并完成 ${contract.level} 阶定约。`, `Bid and made a level-${contract.level} contract.`);
      }
      if (multiplier > 1) {
        const bonus = contract.redoubled ? 100 : 50;
        add("double-bonus", contract.redoubled ? "完成再加倍奖励" : "完成加倍奖励", contract.redoubled ? "Redoubled contract bonus" : "Doubled contract bonus", `${bonus}`, bonus);
      }
      if (difference > 0) {
        const rate = multiplier === 1 ? minor ? 20 : 30 : (vulnerable ? 200 : 100) * (contract.redoubled ? 2 : 1);
        add("overtricks", `超 ${difference} 墩`, `${difference} overtrick${difference === 1 ? "" : "s"}`, `${difference} × ${rate}`, difference * rate,
          `实际 ${tricksTaken} 墩 − 目标 ${target} 墩 = ${difference} 墩。`, `${tricksTaken} taken − ${target} required = ${difference} extra.`);
      }
    }
    const total = rows.reduce((sum, row) => sum + row.points, 0), winner = difference < 0 ? 1 - declaring : declaring;
    return { passedOut: false, declaring, winner, vulnerable, multiplier, target, tricksTaken, difference, rows, total, nsScore: winner === 0 ? total : -total };
  }
  return { explain };
});
