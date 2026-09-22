"use strict";
(function (root) {
  const resourceNames = ["木材 / Lumber", "砖块 / Brick", "羊毛 / Wool", "麦子 / Grain", "矿石 / Ore"];
  const phases = { scenarioChoice: ["剧本选择", "Scenario choice"], piratePayment: ["海盗掠夺：交出资源", "Pirate raid: lose resources"], pirateReward: ["击退海盗：领取资源", "Pirate defense: claim a resource"] };
  const kind = g => g?.scenario?.kind || g?.board?.mapId || "";
  const esc = value => root.CatanBoard.escape(String(value ?? ""));
  const harborPlacement = ["领取后，立即把海港放到自己沿海村庄或城市旁的合法海岸边。不能与现有港口重合或共用交叉点。没有合法位置才暂存；以后出现合法位置时必须放置，放好当回合即可交易。", "After collection, immediately place the harbor beside your own coastal settlement or city. It cannot overlap or share an intersection with another harbor. Keep it only while no legal site exists, then place it as soon as possible. It can be used on the turn placed."];
  function tribeInfo(type, resource = -1) {
    const arrival = ["按通常连接规则，把自己的船建造或移动到这个标记连线所指的那一条海岸边，自动领取这一份礼物。不必建村；停在附近或相邻边不算。最先到达者领取一次，之后不补充。", "Legally build or move your ship onto the exact coast edge linked to this marker to collect this one gift automatically. No settlement is needed. A nearby or neighboring edge does not count. The first arrival takes it; it is not replenished."];
    const inspect = ["此窗口只解释规则，不会领取礼物、放船或消耗回合。", "This description does not claim a gift, place a ship or use a turn."];
    if (type === "foreign") return { title: ["外岛：不产资源", "Foreign island: no production"], icon: "", paragraphs: [
      ["这里不是可开发的资源岛。没有数字圆片，不生产木材、砖块、羊毛、麦子、矿石或黄金；不能在外岛建村庄或城市。地形颜色只表示地貌，不决定礼物种类。", "This island is not a resource source. It has no number tokens, produces nothing (including gold), and cannot hold your settlements or cities. Terrain colors only represent the landscape and do not determine the gifts."],
      ["你来这里是为了海岸边的礼物：+1 是胜利点，卡牌是免费发展卡，带 2:1 或 3:1 的标牌是海港。外岛中央和地形颜色本身不提供任何奖励。", "Visit for the coastal gifts: +1 is a victory point, a card is a free development card, and a 2:1 or 3:1 badge is a harbor. The island center and terrain colors give no reward."], arrival, inspect] };
    if (type === "pirate") return { title: ["海盗：不是可领取的船", "Pirate: not a ship gift"], icon: "pirate", paragraphs: [
      ["海面上的黑旗船是海盗棋子，不属于任何玩家，也不是礼物、港口或可领取的船。玩家的船使用各自玩家颜色。", "The black-flag boat is the pirate, not a player's ship, a gift or a harbor. Player ships use their owner's color."],
      ["掷出 7 或使用骑士时可按规则选择移动海盗。海盗所在海洋格边缘不能新建船，已有船也不能移动；它可能让通往礼物的航线暂时受阻。", "On a 7 or a Knight, you may choose to move the pirate under the usual rules. Ships cannot be built or moved on the edges of its sea hex, so it can block access to gifts."], inspect] };
    if (type === "harbor" && Number.isInteger(resource) && resource >= -1 && resource < 5) {
      const [zh, en] = resource >= 0 ? resourceNames[resource].split(" / ") : ["通用", "Generic"], rate = resource >= 0 ? "2:1" : "3:1";
      return { title: [`${zh}海港 · ${rate}`, `${en} harbor · ${rate}`], icon: resource >= 0 ? root.CatanBoard.RES[resource] : "trade", paragraphs: [
        ["这是一份可搬回主岛的海港礼物，不是资源卡，也不会赠送一艘船。领取前不能用外岛海港交易。", "This gift is a harbor to relocate to the mainland, not resource cards or a free ship. It cannot be used for trade while still on the foreign island."], arrival, harborPlacement,
        [resource >= 0 ? `标牌上的${zh}表示兑换种类：放好后，2 张${zh}换银行 1 张自选资源，不是免费领取 2 张${zh}。` : "放好后，3 张同种资源换银行 1 张自选资源，不是免费领取 3 张资源。", resource >= 0 ? `After placement, exchange 2 ${en.toLowerCase()} for any 1 bank resource. The icon specifies the trade type, not a gift of 2 resource cards.` : "After placement, exchange 3 identical resources for any 1 bank resource. This is not a gift of 3 resources."], inspect] };
    }
    if (type === "vp") return { title: ["礼物：1 胜利点", "Gift: 1 victory point"], icon: "dev-vp", paragraphs: [arrival, ["领取后立即增加 1 分，计入玩家表的剧本奖励。不是资源卡，也无需在外岛建村。", "Adds 1 VP immediately, shown as Scenario VP in the player table. It is not a resource card and requires no settlement on this island."], inspect] };
    if (type === "development") return { title: ["礼物：免费发展卡", "Gift: free development card"], icon: "development", paragraphs: [arrival, ["免费获得事先背面朝下放置的 1 张发展卡，领取前不公开卡面。行动卡从下一个自己的回合起才能使用，每回合最多一张；胜利点卡立即计分。", "Receive one pre-dealt face-down development card for free. Its identity is private until collected. Action cards are playable on a later turn of your own, at most one per turn; VP cards count immediately."], inspect] };
    return null;
  }
  function art(id, cls = "scenario-art") {
    const safe = /^[a-z-]+$/.test(id) ? id : "fortress";
    const prefix = root.document?.getElementById("catanScenarioSprite") ? "#catan-scenario-art-" : "catan-scenario-art.svg#";
    return `<svg class="${cls}" viewBox="0 0 ${safe.startsWith("wonder-") ? "160 96" : "48 48"}" aria-hidden="true"><use href="${prefix}${safe}"></use></svg>`;
  }
  function playerRange(map) { return map.minPlayers && map.minPlayers < map.players ? `${map.minPlayers}–${map.players}` : String(map.players); }
  function target(map, game) {
    if ((map?.family || kind(game)) === "wonders") return ["自己的回合：奇观建满 4 阶段，或至少 10 分且奇观阶段数超过所有对手", "On your turn: complete all 4 wonder stages, or reach at least 10 VP with more completed wonder stages than every opponent"];
    if ((map?.family || kind(game)) === "pirates") return [`解放要塞 + ${game?.target || map?.target || 10} 分`, `Liberate your fortress + ${game?.target || map?.target || 10} VP`];
    return [`${game?.target || map?.target || 10} 分`, `${game?.target || map?.target || 10} VP`];
  }
  function devName(type, pirate) { return pirate && type === "knight" ? ["战舰", "Warship"] : null; }
  function choice(g, you, mode) {
    const l = g?.legal?.scenario;
    if (!l || g.phase !== "scenarioChoice" || (g.scenario?.pending?.actor ?? g.scenario?.actor) !== you) return null;
    if (mode === "piratePayment" && l.piratePayment > 0) return { required: l.piratePayment, supply: g.players[you].resources, loss: true };
    if (mode === "pirateReward" && l.pirateReward?.length) return { required: 1, supply: [0, 1, 2, 3, 4].map(r => l.pirateReward.includes(r) ? 1 : 0), loss: false };
    return null;
  }
  function costMarkup(cost, icon) {
    return (cost || []).flatMap((n, r) => n ? [`<span class="wonder-resource" title="${resourceNames[r]}" aria-label="${n} ${resourceNames[r]}">${icon(root.CatanBoard.RES[r])}<b>${n}</b><small>${resourceNames[r].split(" / ").join("<br>")}</small></span>`] : []).join("");
  }
  function render(g, you, options) {
    const s = g.scenario, l = g.legal.scenario || {}, own = g.players[you], { icon, pending, paused, connected, harbor, victim } = options;
    if (!s) return { panel: "", wonders: "" };
    const blocked = pending || paused || !connected;
    let panel = "", wonders = "";
    if (s.kind === "tribes" || (s.kind === "new-world" && s.harborDraft)) {
      const harbors = s.harborDraft ? s.harborDraft.actor === you ? [s.harborDraft] : [] : own.harbors || [];
      panel = `<h2>${s.harborDraft ? "初始海港 <small>Initial Harbors</small>" : "部落馈赠 <small>Tribal Gifts</small>"}${s.harborDraft ? `<span>${s.harborRemaining ?? 0} 待放 / Remaining</span>` : ""}</h2><div class="scenario-harbors">${harbors.map(h => {
        const legal = l.placeHarbors?.find(p => p.harbor === h.id), name = h.resource < 0 ? "通用港 / Generic harbor · 3:1" : `${resourceNames[h.resource]} · 2:1`;
        const status = s.kind === "tribes" && !legal?.edges.length ? g.current !== you ? "已领取，等待自己的回合 / Collected; wait for your turn" : "暂存：暂无合法海岸 / Stored: no legal coast" : "已领取，放置海港 / Collected: place harbor";
        return `<button type="button" class="secondary ${harbor === h.id ? "selected" : ""}" data-harbor="${esc(h.id)}" ${blocked || !legal?.edges.length ? "disabled" : ""} aria-pressed="${harbor === h.id}" title="${name}">${icon(h.resource < 0 ? "trade" : root.CatanBoard.RES[h.resource])}<span>${name}<small>${s.harborDraft ? "放置港口 / Place harbor" : status}</small></span></button>`;
      }).join("") || `<p class="scenario-muted">${s.harborDraft ? "等待当前玩家放置 / Waiting for harbor placement" : "暂无待放港口 / No harbors waiting"}</p>`}</div>`;
    }
    if (s.kind === "cloth") {
      panel = `<h2>${art("cloth")}布匹 <small>Cloth</small><span>${s.clothBank ?? 0} 库存 / Supply</span></h2><div class="scenario-public-counts">${g.players.map(p => `<span style="--player:${root.CatanBoard.COLORS[p.id]}"><i class="player-color"></i><span>${esc(p.name)}</span><b>${p.cloth || 0}</b></span>`).join("")}</div>`;
      if (g.phase === "steal") {
        const choices = (l.steal || []).filter(v => victim == null || v.victim === victim);
        if (choices.length) panel += `<div class="scenario-loot">${choices.map(v => `<div><strong>${esc(g.players[v.victim]?.name)}</strong><div>${v.loot.map(loot => `<button type="button" class="secondary" data-loot="${loot}" data-loot-victim="${v.victim}" ${blocked ? "disabled" : ""}>${loot === "cloth" ? art("cloth") : icon("resource-back")}<span>${loot === "cloth" ? "1 布匹<small>1 Cloth</small>" : "1 资源<small>1 Resource</small>"}</span></button>`).join("")}</div></div>`).join("")}${victim != null ? '<button type="button" class="scenario-back" data-loot-back>其他玩家 / Other players</button>' : ""}</div>`;
      }
    }
    if (s.kind === "pirates") {
      panel = `<h2>${art("fortress")}海盗要塞 <small>Pirate Fortresses</small></h2><div class="scenario-fortresses">${g.players.map(p => {
        const fort = s.pirateSeats?.find(f => f.owner === p.id);
        return `<div style="--player:${root.CatanBoard.COLORS[p.id]}"><span><i class="player-color"></i>${esc(p.name)}</span><span title="战舰 / Warships">${art("warship")}<b>${p.warships || 0}</b></span><span title="要塞兵力 / Fortress strength">${art("fortress")}<b>${fort?.liberated || p.liberated ? "✓" : fort?.strength ?? 3}</b><small>${fort?.liberated || p.liberated ? "已解放 / Free" : "兵力 / Strength"}</small></span></div>`;
      }).join("")}</div><button class="secondary scenario-attack" type="button" data-scenario-action="attackFortress" ${blocked || !l.attackFortress ? "disabled" : ""}>${art("warship")}<span>进攻要塞 · 结束回合<small>Attack fortress · Ends turn</small></span></button>`;
    }
    if (s.kind === "wonders") {
      wonders = `<h2>卡坦奇迹 <small>Wonders of Catan</small></h2><p class="wonder-build-rule">每付一次费用，建成一个阶段；按 1、2、3、4 的顺序建满。资源足够时，同一回合可以连建。下方数字格是建造进度，不是分数或选项。<small>Pay once to complete one stage, in order from 1 to 4. You may build several stages in one turn. The numbered boxes show progress, not points or choices.</small></p><p class="wonder-ship-rule">认领需预留 1 艘库存船。<small>Claiming reserves 1 ship from supply.</small></p><div class="wonder-list">${(s.wonderCards || []).map(card => {
        const owner = g.players.find(p => p.wonder?.id === card.id), stage = owner?.wonder.stage || 0, mine = owner?.id === you;
        const eligible = !owner && l.chooseWonders?.includes(card.id), enabled = !blocked && (mine ? l.buildWonder : eligible);
        const requirement = card.requirementsText || ["满足此奇迹的建造条件", "Meet this wonder's building requirements"];
        const claimBlocked = !owner && !own.wonder ? g.legal.buildBlocked?.chooseWonder : "";
        const markerLabel = owner ? `${owner.name} · 预留船 ${owner.reservedShips || 0} / Reserved ship ${owner.reservedShips || 0}` : "";
        const marker = owner?.reservedShips ? `<span class="wonder-ship-marker" style="color:${root.CatanBoard.COLORS[owner.id]}" role="img" aria-label="${esc(markerLabel)}" title="${esc(markerLabel)}">${icon("ship")}<b>${owner.reservedShips}</b></span>` : "";
        const steps = [1, 2, 3, 4].map(n => {
          const complete = stage >= n, next = Boolean(owner) && n === stage + 1;
          const status = complete ? ["完成", "Complete"] : next ? ["下步", "Next to build"] : ["待建", "Not built"];
          const label = `第 ${n} 阶段：${status[0]} / Stage ${n}: ${status[1]}`;
          return `<li class="${complete ? "complete" : next ? "next-stage" : ""}" ${next ? 'aria-current="step"' : ""} aria-label="${label}" title="${label}"><b>${n}</b><small>${status[0]}</small></li>`;
        }).join("");
        return `<article class="wonder-card ${mine ? "own-wonder" : ""}" data-wonder="${esc(card.id)}">
          <div class="wonder-illustration">${art(`wonder-${card.id}`, "wonder-art")}</div>
          <h3>${esc(card.name)}<small>${esc(card.english)}</small></h3>
          <p class="wonder-requirement">${esc(requirement[0])}<small>${esc(requirement[1])}</small></p>
          <div class="wonder-cost" aria-label="建造一个阶段需支付的资源 / Resources paid for one stage"><p class="wonder-cost-label">建 1 个阶段，支付：<small>Pay to build ONE stage:</small></p>${costMarkup(card.cost, icon)}</div>
          <p class="wonder-cost-repeat">四个阶段费用相同，每次都要支付。<small>Same cost each stage; pay it each time.</small></p>
          <p class="wonder-progress-label">四个建造阶段：已完成 ${stage}/4<small>Construction: ${stage} of 4 stages complete</small></p>
          <ol class="wonder-stages" aria-label="四个建造阶段的完成进度，不是选项 / Four construction stages, progress only">${steps}</ol>
          <p class="wonder-owner">${marker}<span>${owner ? esc(owner.name) : "尚未认领 / Unclaimed"}</span></p>
          <button type="button" class="${mine ? "primary" : "secondary"}" data-scenario-action="${mine ? "buildWonder" : "chooseWonder"}" data-wonder-id="${esc(card.id)}" ${claimBlocked ? `title="${esc(claimBlocked)}"` : ""} ${enabled ? "" : "disabled"}>${mine ? stage >= 4 ? "奇观已建成 / Wonder complete" : `支付资源，建第 ${stage + 1} 阶段<small>Pay &amp; build stage ${stage + 1}</small>` : owner ? "已被认领 / Claimed" : eligible ? "认领奇迹 / Claim wonder" : claimBlocked ? "需要库存船 / Ship required" : "条件未满足 / Not eligible"}</button>
        </article>`;
      }).join("")}</div>`;
    }
    return { panel, wonders };
  }
  root.CatanScenarioUI = { art, phases, playerRange, target, kind, devName, choice, render, tribeInfo };
})(typeof globalThis === "object" ? globalThis : this);
