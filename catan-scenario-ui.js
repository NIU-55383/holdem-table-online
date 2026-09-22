"use strict";
(function (root) {
  const resourceNames = ["木材 / Lumber", "砖块 / Brick", "羊毛 / Wool", "麦子 / Grain", "矿石 / Ore"];
  const phases = { scenarioChoice: ["剧本选择", "Scenario choice"], piratePayment: ["海盗掠夺：交出资源", "Pirate raid: lose resources"], pirateReward: ["击退海盗：领取资源", "Pirate defense: claim a resource"] };
  const kind = g => g?.scenario?.kind || g?.board?.mapId || "";
  const esc = value => root.CatanBoard.escape(String(value ?? ""));
  const harborPlacement = ["领取后，立即把海港放到自己沿海村庄或城市旁的合法海岸边。不能与现有港口重合或共用交叉点。没有合法位置才暂存；以后出现合法位置时必须放置，放好当回合即可交易。", "After collection, immediately place the harbor beside your own coastal settlement or city. It cannot overlap or share an intersection with another harbor. Keep it only while no legal site exists, then place it as soon as possible. It can be used on the turn placed."];
  function tribeInfo(type, resource = -1) {
    const arrival = ["按通常连接规则，将自己的船建造或移动到标记连线所指的海岸边，即可领取礼物。每份礼物由最先到达的玩家领取一次，之后不补充。", "Legally build or move your ship onto the coastal edge linked to the marker to collect the gift. Each gift goes to the first player to arrive and is not replenished."];
    if (type === "foreign") return { title: ["外岛：不产资源", "Foreign island: no production"], icon: "", paragraphs: [
      ["外岛没有数字圆片，不产资源，也不能建造村庄或城市。", "Foreign islands have no number tokens, produce no resources and cannot be settled."],
      ["海岸边的奖杯可领取 1 胜利点，卡牌可领取 1 张免费发展卡，2:1 或 3:1 标牌可领取对应海港。", "Coastal trophies grant 1 VP, cards grant one free development card, and 2:1 or 3:1 markers grant the corresponding harbor."], arrival] };
    if (type === "pirate") return { title: ["海盗", "Pirate"], icon: "pirate", paragraphs: [
      ["黑旗船是海盗棋子。掷出 7 或使用骑士时，可按规则选择移动海盗。", "The black-flag ship is the pirate. On a 7 or a Knight, you may choose to move it under the usual rules."],
      ["海盗所在海洋格边缘不能新建船，已有船也不能移动。", "Ships cannot be built or moved on the edges of the pirate's sea hex."]] };
    if (type === "harbor" && Number.isInteger(resource) && resource >= -1 && resource < 5) {
      const [zh, en] = resource >= 0 ? resourceNames[resource].split(" / ") : ["通用", "Generic"], rate = resource >= 0 ? "2:1" : "3:1";
      return { title: [`${zh}海港 · ${rate}`, `${en} harbor · ${rate}`], icon: resource >= 0 ? root.CatanBoard.RES[resource] : "trade", paragraphs: [
        arrival, harborPlacement,
        [resource >= 0 ? `放好后，2 张${zh}换银行 1 张自选资源。` : "放好后，3 张同种资源换银行 1 张自选资源。", resource >= 0 ? `After placement, exchange 2 ${en.toLowerCase()} for any 1 bank resource.` : "After placement, exchange 3 identical resources for any 1 bank resource."]] };
    }
    if (type === "vp") return { title: ["礼物：1 胜利点", "Gift: 1 victory point"], icon: "dev-vp", paragraphs: [arrival, ["领取后立即增加 1 分，计入玩家表的剧本奖励。", "Adds 1 VP immediately, shown as Scenario VP in the player table."]] };
    if (type === "development") return { title: ["礼物：免费发展卡", "Gift: free development card"], icon: "development", paragraphs: [arrival, ["免费获得事先背面朝下放置的 1 张发展卡，领取前不公开卡面。行动卡从下一个自己的回合起才能使用，每回合最多一张；胜利点卡立即计分。", "Receive one pre-dealt face-down development card for free. Its identity is private until collected. Action cards are playable on a later turn of your own, at most one per turn; VP cards count immediately."]] };
    return null;
  }
  function pirateInfo(type, owner, strength = 3) {
    if (type === "pirate-fleet") return { title: ["海盗舰队", "Pirate fleet"], icon: "pirate", paragraphs: [
      ["每位玩家掷骰后，海盗按两颗骰子中较小的点数顺时针移动。只袭击停下的海洋格旁的村庄或城市；经过的地方和船只不受袭击。", "After each player's roll, move the pirates clockwise by the lower die. They raid settlements or cities beside the final sea hex, not ships or places passed along the way."],
      ["遭袭玩家用自己的全部战舰数，与这次海盗移动的格数比较：战舰更多，任选 1 张银行资源；相等，无事发生；更少，随机失去 1 张资源，再按自己每座城市多失去 1 张，手牌不足就交出现有的。袭击不会击沉船。", "Compare the raided player's total warships with the pirates' movement. More: choose 1 bank resource. Equal: nothing happens. Fewer: lose 1 random resource plus 1 per city you own, limited to your hand. Raids do not sink ships."],
      ["先处理海盗袭击，再按骰子总点数产资源。总点数为 7 时，手牌超过 7 张的玩家弃掉一半（向下取整），掷骰者再从任一有资源的对手随机偷 1 张；海盗不再移动。", "Resolve the raid before production. On a total of 7, players with more than 7 resource cards discard half, rounded down. The roller then steals 1 random resource from any opponent holding one; the pirates do not move again."],
      ["获得战舰：先花 1 羊毛、1 麦子、1 矿石买发展卡。抽到战舰卡后，从下一个自己的回合起打出，将最靠近主岛的一艘普通船免费升级。每艘战舰提供 1 点战力，每回合最多打出 1 张行动发展卡。", "To get warships, buy a development card for 1 wool, 1 grain and 1 ore. If you draw a Warship card, play it on a later turn of your own to upgrade the normal ship nearest the mainland for free. Each warship adds 1 strength; play at most 1 action development card per turn."],
      ["进攻自己的要塞是另一件事：必须先用连续的船只经自己的补给点连到要塞，道路不算。回合末另掷一颗骰子，自己的战舰数大于骰点才打赢并拆掉一层防御。点击要塞可查看完整进攻规则。", "Attacking your fortress is separate: first connect a continuous line of ships through your outpost to the fortress. Roads do not count. At turn end, roll a new die; more warships than the roll wins and removes 1 defense. Click the fortress for the full attack rules."]
    ] };
    if (type === "warship") return { title: ["怎样获得战舰", "How to get warships"], scenarioArt: "warship", paragraphs: [
      ["先用 1 羊毛 + 1 麦子 + 1 矿石购买一张发展卡。随机抽到骑士时，本图会显示为「战舰」卡；并不是每次购买都能抽到。", "Buy a random development card for 1 wool + 1 grain + 1 ore. A Knight appears as a Warship card here; a purchase does not guarantee one."],
      ["从下一个自己的回合起，点击手里的「战舰」卡，将最靠近主岛的一艘普通船升级为战舰，不用再付资源。没有普通船就不能使用。每回合最多使用一张行动发展卡。", "On a later turn of your own, play your Warship card to upgrade the normal ship nearest the mainland, at no extra cost. You need a normal ship. Play at most one action development card per turn."],
      ["每艘战舰提供 1 点战力，普通船不提供战力。防守海盗和进攻要塞，都数自己所有的战舰；升级不移动海盗。", "Each warship adds 1 strength; normal ships add none. Count all your warships when defending against pirates or attacking your fortress. Upgrading does not move the pirates."],
      ["三人局移除全部 5 张胜利点卡；四人局把这 5 张也当作战舰卡，不加分。两种人数都没有直接加分的发展卡。战舰被击沉后不再计入战力。", "With 3 players, remove all 5 VP cards. With 4 players, they also become Warship cards and score no VP. Neither deck has scoring development cards. A sunk warship no longer counts toward your strength."]
    ] };
    if (!["outpost", "fortress"].includes(type) || !Number.isInteger(owner) || owner < 0 || owner > 3) return null;
    const [zh, en] = [["红色", "Red"], ["蓝色", "Blue"], ["黄色", "Yellow"], ["紫色", "Purple"]][owner], seat = owner + 1;
    const color = root.CatanBoard.COLORS[owner];
    if (type === "outpost") return { title: [`${zh}补给点 · ${seat} 号位`, `${en} outpost · Seat ${seat}`], icon: "settlement", color, paragraphs: [
      [`这个彩色圆点是 ${seat} 号位玩家的补给点，只有该玩家能在这里建村。初始村庄不能放在这里。`, `This colored dot is the outpost for the player in seat ${seat}. Only that player may settle here, after initial setup.`],
      ["把自己的航线连到这里后，可按通常费用建村、升级城市，照常获得资源和分数；也会增加遭海盗攻击时的损失。", "Once your shipping route reaches it, pay the usual cost to build a settlement or upgrade it to a city. It earns resources and VP normally, but increases losses if the pirates defeat you."],
      ["航线必须经自己的补给点，通往同色旗帜的要塞；全程不能分叉。建村后，圆点会变为房屋。", "Your shipping route must pass through your own outpost to the fortress with the matching flag. It cannot branch. The dot is replaced by a house when settled."]
    ] };
    const remaining = Number.isInteger(strength) && strength >= 0 && strength <= 3 ? strength : 3;
    return { title: [`${zh}海盗要塞 · ${seat} 号位`, `${en} pirate fortress · Seat ${seat}`], scenarioArt: "fortress", color, paragraphs: [
      [`这是 ${seat} 号位玩家需要收复的要塞。旗帜颜色对应玩家颜色；圆圈数字是剩余防御层数，当前为 ${remaining}/3，还需打赢 ${remaining} 次进攻才能收复。`, `The player in seat ${seat} must liberate this fortress. The flag matches their color. Its remaining defenses are ${remaining}/3: win ${remaining} more attacks to liberate it.`],
      ["必须用连续的船只经自己的补给点连到要塞，才能在回合末进攻；道路不算。每艘战舰算 1 点战力，普通船不算；骑士卡可将船升级为战舰。比较时，数自己的全部战舰。", "Only a continuous line of ships reaching the fortress via your outpost allows an attack at turn end; roads do not count. Each warship adds 1 strength; normal ships add none. Knights upgrade ships to warships. Count all your warships for the attack."],
      ["进攻时另掷 1 颗骰子：战舰数大于骰点，移除 1 层防御；相等，损失离要塞最近的 1 艘船；小于，损失最近的 2 艘船。平手或输了都不减少防御，进攻后立即结束回合。", "Roll one new die to attack. More warships than the roll: remove 1 defense. Equal: lose the ship nearest the fortress. Fewer: lose the nearest 2 ships. A tie or loss removes no defenses. Attacking ends your turn."],
      ["收复前不能升级城市。三层防御全部移除后，要塞变为自己的村庄，产资源并计 1 分；以后在自己的建造阶段，可花 2 麦子 + 3 矿石升级城市，计 2 分、产量翻倍，仍受每人 4 座城市上限限制。进攻已结束本回合，不能马上接着升级。", "Before liberation, it cannot become a city. After all 3 defenses fall, it becomes your settlement, producing resources and worth 1 VP. On a later building phase of your own, pay 2 grain + 3 ore to upgrade it to a city: 2 VP, double production, within your 4-city limit. The attack ends your turn, so you cannot upgrade immediately."],
      ["自己的回合达到 10 分，并收复自己的要塞，即可获胜。", "Win on your turn with 10 VP and your own fortress liberated."]
    ] };
  }
  function art(id, cls = "scenario-art") {
    const safe = /^[a-z-]+$/.test(id) ? id : "fortress";
    const prefix = root.document?.getElementById("catanScenarioSprite") ? "#catan-scenario-art-" : "catan-scenario-art.svg#";
    return `<svg class="${cls}" viewBox="0 0 ${safe.startsWith("wonder-") ? "160 96" : "48 48"}" aria-hidden="true"><use href="${prefix}${safe}"></use></svg>`;
  }
  function playerRange(map) { return map.minPlayers && map.minPlayers < map.players ? `${map.minPlayers}–${map.players}` : String(map.players); }
  function target(map, game) {
    if ((map?.family || kind(game)) === "wonders") return ["自己的回合：奇观建满 4 阶段，或至少 10 分且奇观阶段数超过所有对手", "On your turn: complete all 4 wonder stages, or reach at least 10 VP with more completed wonder stages than every opponent"];
    if ((map?.family || kind(game)) === "pirates") return [`${game?.target || map?.target || 10} 分 + 解放要塞`, `${game?.target || map?.target || 10} VP + Liberate your fortress`];
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
  function battleReport(g, icon) {
    const b = g?.scenario?.battle;
    if (kind(g) !== "pirates" || !b || !Number.isInteger(b.id)) return null;
    const name = b.name || g.players[b.actor]?.name || "", fortress = b.kind === "fortress";
    const operator = b.strength > b.power ? ">" : b.strength === b.power ? "=" : "<";
    const title = fortress ? ["进攻要塞", "Fortress attack"] : ["海盗巡航", "Pirate patrol"];
    let start, compare, outcome, follow, notice;
    if (fortress) {
      start = [`${name} 发起进攻，另掷一颗骰子：${b.power}`, `${name} attacks and rolls a new die: ${b.power}`];
      compare = [`战舰 ${b.strength} ${operator} 要塞骰点 ${b.power}`, `Warships ${b.strength} ${operator} fortress die ${b.power}`];
      outcome = b.result === "win" ? [b.liberated ? "最后一层防御移除，要塞收复！" : `打赢了：防御 ${b.defensesBefore} → ${b.defenses}/3`, b.liberated ? "Final defense removed. Fortress liberated!" : `Victory: defenses ${b.defensesBefore} → ${b.defenses}/3`]
        : [`${b.result === "tie" ? "平手" : "战败"}：损失最近的 ${b.shipsLost} 艘船，防御仍为 ${b.defenses}/3`, `${b.result === "tie" ? "Tie" : "Defeat"}: lose ${b.shipsLost} nearest ships; defenses stay ${b.defenses}/3`];
      follow = ["进攻结算完毕，本回合结束。", "Attack resolved. Your turn ends."];
    } else {
      start = [`骰子 ${b.dice.join(" + ")}，取较小的 ${b.power}：顺时针走 ${b.power} 格`, `Dice ${b.dice.join(" + ")}: lower die ${b.power}, move ${b.power} hexes clockwise`];
      compare = b.actor == null ? ["停靠海格旁没有村庄或城市，无人遭袭", "No settlements or cities beside the destination: no raid"]
        : [`${name} 的沿岸建筑遭袭：战舰 ${b.strength} ${operator} 海盗 ${b.power}`, `${name}'s coastal building is raided: warships ${b.strength} ${operator} pirates ${b.power}`];
      outcome = b.actor == null ? ["没有资源损失", "No resource losses"]
        : b.result === "tie" ? ["战力相等：不损失，也不领奖励", "Equal strength: no losses or reward"]
        : b.result === "win" ? b.reward === "pending" ? ["击退海盗：请选择 1 张银行资源", "Pirates defeated: choose 1 bank resource"]
          : b.reward === "claimed" ? ["击退海盗：已领取 1 张资源", "Pirates defeated: 1 resource collected"] : ["击退海盗，但银行没有资源可领", "Pirates defeated, but the bank is empty"]
        : [`防守失败：随机失去 ${b.lost} 张资源（1 + ${b.cities} 座城市${b.lost < b.cities + 1 ? "，手牌不足只弃现有的" : ""}）`, `Defense lost: ${b.lost} random resources discarded (1 + ${b.cities} cities${b.lost < b.cities + 1 ? ", limited to cards held" : ""})`];
      follow = b.dice.reduce((a, n) => a + n, 0) === 7 ? ["随后结算 7：手牌超过 7 张先弃一半，再由掷骰者向任一对手偷 1 张；海盗不再移动。", "Then resolve 7: hands over 7 discard half; the roller steals 1 card from any opponent. No extra pirate movement."]
        : ["随后按骰子总点数结算资源产出。", "Then produce resources for the dice total."];
    }
    notice = `${compare[0]}。${outcome[0]}。 / ${compare[1]}. ${outcome[1]}.`;
    const step = (label, texts, n) => `<li><span class="battle-step-number">${n}</span><div><span class="battle-step-label">${label}</span><strong>${esc(texts[0])}</strong><small>${esc(texts[1])}</small></div></li>`;
    const html = `<summary>${fortress ? art("fortress") : icon("pirate")}<strong>${title[0]}<small>${title[1]}</small></strong><span>回合 ${b.turn} / Turn ${b.turn}</span></summary><div role="status" aria-live="polite"><ol>${step(fortress ? "进攻 / Attack" : "移动 / Move", start, 1)}${step("比较 / Compare", compare, 2)}${step("结算 / Result", outcome, 3)}</ol><p class="battle-follow">${esc(follow[0])}<small>${esc(follow[1])}</small></p></div>`;
    return { id: b.id, actor: b.actor, result: b.result, html, notice };
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
      }).join("")}</div><div class="warship-guide"><button type="button" class="quiet" data-scenario-info="warship" title="怎样获得战舰 / How to get warships">${art("warship")}<span>怎样获得战舰？<small>How to get warships?</small></span></button><p>用 1 羊毛 + 1 麦子 + 1 矿石买发展卡；抽到「战舰」卡后，从下一个自己的回合起打出，免费升级最靠主岛的一艘普通船。<small>Buy a random dev card for 1 wool + 1 grain + 1 ore. If it is a Warship card, play it on a later turn to upgrade your normal ship nearest the mainland for free.</small></p><p>每艘战舰 = 1 战力；普通船 = 0。<small>Each warship = 1 strength; normal ships = 0.</small></p></div><button class="secondary scenario-attack" type="button" data-scenario-action="attackFortress" ${blocked || !l.attackFortress ? "disabled" : ""}>${art("warship")}<span>进攻要塞 · 结束回合<small>Attack fortress · Ends turn</small></span></button>`;
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
  root.CatanScenarioUI = { art, phases, playerRange, target, kind, devName, choice, render, tribeInfo, pirateInfo, battleReport };
})(typeof globalThis === "object" ? globalThis : this);
