"use strict";
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CatanScore = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  function breakdown(g, p) {
    const items = [], owned = g.board.vertices.filter(v => v.owner === p.id), ck = g.citiesKnights?.players[p.id];
    const settlements = owned.filter(v => v.level === 1), cities = owned.filter(v => v.level === 2);
    const metropolis = ck ? cities.filter(v => v.metropolis != null).length : 0;
    const fortress = g.scenario?.kind === "pirates" && g.scenario.pirateSeats?.[p.id]?.liberated
      ? g.scenario.pirateSeats[p.id].fortress : null;
    const add = (key, zh, en, points) => { if (points > 0) items.push({ key, zh, en, points }); };
    const units = { settlements:"座", cities:"座", metropolis:"座", merchant:"个", longestRoad:"项", largestArmy:"项", islands:"处", tribes:"枚", wondersSettlements:"次", scenarioRewards:"次", cloth:"组", developmentVP:"张", progressPrinting:"张", progressConstitution:"张", defenders:"次" };
    const count = (key, zh, en, quantity, unit = 1, zhNote = "", enNote = "") => {
      add(key, `${zh}：${quantity} ${units[key]} × ${unit} 分 = ${quantity * unit} 分${zhNote}`, `${en}: ${quantity} × ${unit} VP = ${quantity * unit} VP${enNote}`, quantity * unit);
    };
    // Public piece counts are inventory usage: a fallen city still occupies a city piece,
    // and an unliberated pirate fortress reserves a settlement. Score actual board levels.
    const fallen = settlements.some(v => v.fallen), settlementFort = settlements.some(v => v.id === fortress), cityFort = cities.some(v => v.id === fortress);
    const settlementNotes = [fallen && "降级后的城市按村庄计 1 分", settlementFort && "包含收复的海盗要塞，不额外加分"].filter(Boolean);
    const settlementEnglish = [fallen && "fallen cities count as settlements worth 1 VP", settlementFort && "includes the liberated pirate fortress, with no extra bonus"].filter(Boolean);
    count("settlements", "村庄", "Settlements", settlements.length, 1,
      settlementNotes.length ? `（${settlementNotes.join("；")}）` : "", settlementEnglish.length ? ` (${settlementEnglish.join("; ")})` : "");
    const cityNotes = [metropolis && "包括都会本身的城市分", cityFort && "包含收复后升级的海盗要塞，不额外加分"].filter(Boolean);
    const cityEnglish = [metropolis && "includes the base city points of metropolises", cityFort && "includes the upgraded liberated pirate fortress, with no extra bonus"].filter(Boolean);
    count("cities", "城市", "Cities", cities.length, 2, cityNotes.length ? `（${cityNotes.join("；")}）` : "", cityEnglish.length ? ` (${cityEnglish.join("; ")})` : "");
    count("metropolis", "都会额外加分", "Additional metropolis bonus", metropolis, 2, "（城市本身的 2 分已列在城市项）", " (the city's base 2 VP are listed under Cities)");
    count("merchant", "持有商人", "Merchant held", g.citiesKnights?.merchant?.owner === p.id ? 1 : 0);
    count("longestRoad", g.board.islands ? "最长商路" : "最长道路", g.board.islands ? "Longest Trade Route" : "Longest Road", g.longest === p.id ? 1 : 0, 2);
    count("largestArmy", "最大骑士团", "Largest Army", g.largest === p.id ? 1 : 0, 2);

    const islandUnit = g.scenario?.kind === "new-world" ? 1 : 2;
    count("islands", "登岛奖励", "Foreign-island bonuses", (p.islandPoints || 0) / islandUnit, islandUnit, "（每处非起始地区首次建村仅奖励一次）", " (once per foreign territory when first settled)");
    const tribePoints = g.scenario?.kind === "tribes" ? p.scenarioPoints || 0 : 0;
    count("tribes", "部落胜利点标记", "Tribe victory point tokens", tribePoints);
    if (g.scenario?.kind === "wonders") count("wondersSettlements", "外岛建村奖励", "Foreign-island settlement bonuses", p.scenarioPoints || 0, 1, "（奇迹的建造阶段本身不加分）", " (wonder construction stages do not themselves score VP)");
    else if (g.scenario?.kind !== "tribes") count("scenarioRewards", "剧本奖励", "Scenario rewards", p.scenarioPoints || 0);
    const cloth = p.cloth || 0;
    count("cloth", "布匹得分", "Cloth points", Math.floor(cloth / 2), 1, `（${cloth} 匹布，每 2 匹计 1 分${cloth % 2 ? "；剩下 1 匹暂不计分" : ""}）`, ` (${cloth} cloth, 1 VP per pair${cloth % 2 ? "; the remaining 1 cloth scores no point yet" : ""})`);

    const cardPoints = ck ? ck.revealed.length : Array.isArray(p.development) ? p.development.filter(card => card.type === "vp").length : null;
    if (ck) {
      count("progressPrinting", "印刷术胜利点进步卡", "Printing victory point progress cards", ck.revealed.filter(key => key === "printing").length);
      count("progressConstitution", "宪法胜利点进步卡", "Constitution victory point progress cards", ck.revealed.filter(key => key === "constitution").length);
    }
    // Older accepted saves can carry a base VP card in a Cities game. Count only cards
    // actually included in this public snapshot; keep the historical bonus grouping below.
    const developmentPoints = Array.isArray(p.development) ? p.development.filter(card => card.type === "vp").length : 0;
    count("developmentVP", "胜利点发展卡", "Victory point development cards", developmentPoints);
    const defenderPoints = ck?.defenders || 0;
    count("defenders", "保卫卡坦奖励", "Defender of Catan awards", defenderPoints);
    const bonusPoints = (cardPoints || 0) + tribePoints + defenderPoints;
    // Preserve the summary-table grouping, but never fill an unexplained score gap with "other".
    const otherPoints = items.reduce((total, item) => total + item.points, 0) - bonusPoints;
    return { items, total: p.score, publicOnly: cardPoints === null, cardPoints, tribePoints, defenderPoints, bonusPoints, otherPoints };
  }
  return { breakdown };
});
