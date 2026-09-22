"use strict";
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.CatanScenarioMaps = data;
})(typeof globalThis === "object" ? globalThis : this, () => {
  // References use row/column, engine corner order NE,SE,S,SW,NW,N, and port-normal angles.
  const at = (row, col, corner) => ({ at: [row, col], corner });
  const edge = (row, col, angle) => ({ at: [row, col], angle });
  const shuffled = (values, rng) => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const seeded = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const adjacent = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;
  const cells = (rows) => rows.flatMap((row, y) => row.split(" ").map((cell, x) => ({ row: y, col: x, q: Math.max(-3, -y) + x, r: y - 3, cell })));
  const mainCells = (rows, predicate) => cells(rows).filter((t) => !["s", "F"].includes(t.cell) && predicate(t)).map((t) => [t.row, t.col]);
  const numberPool = [2,3,3,3,4,4,4,5,5,5,6,6,8,8,9,9,9,10,10,10,11,11,12];
  const worldPool = ["t","t","t","t","t","b","b","b","b","w","w","w","w","w","h","h","h","h","h","o","o","o","o", ...Array(19).fill("s")];
  const cornerOffsets = [[1,-1],[1,1],[0,2],[-1,1],[-1,-1],[0,-2]];
  const neighbors = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  const worldFrame = [5,6,7,8,7,6,5].map((length, row) => Array.from({ length }, (_, col) => row === 3 && (col === 0 || col === length - 1) ? "F" : "s").join(" "));

  function generateWorld(rng) {
    const slots = cells(worldFrame);
    for (let attempt = 0; attempt < 10000; attempt++) {
      const terrain = shuffled(worldPool, rng), numbers = shuffled(numberPool, rng);
      let ti = 0, ni = 0;
      for (const tile of slots) {
        tile.cell = tile.row === 3 && [0,7].includes(tile.col) ? "F" : terrain[ti++];
        tile.number = !["s", "F"].includes(tile.cell) ? numbers[ni++] : 0;
      }
      const land = slots.filter((t) => t.number), reds = land.filter((t) => [6,8].includes(t.number));
      if (reds.some((a, i) => reds.slice(i + 1).some((b) => adjacent(a, b)))) continue;
      const connected = new Set([land[0]]), queue = [land[0]];
      while (queue.length) {
        const tile = queue.pop();
        for (const other of land) if (!connected.has(other) && adjacent(tile, other)) { connected.add(other); queue.push(other); }
      }
      // The printed scenario explores foreign islands; retain at least two in generated boards.
      if (connected.size === land.length) continue;
      const candidates = [];
      for (const tile of land) for (let side = 0; side < 6; side++) {
        const [dq, dr] = neighbors[side];
        if (land.some((other) => other.q === tile.q + dq && other.r === tile.r + dr)) continue;
        const vertices = [side, (side + 1) % 6].map((corner) => {
          const [dx, dy] = cornerOffsets[corner];
          return `${2 * tile.q + tile.r + dx}:${3 * tile.r + dy}`;
        });
        candidates.push({ row: tile.row, col: tile.col, angle: side * 60, vertices });
      }
      const occupied = new Set(), chosen = [];
      for (const candidate of shuffled(candidates, rng)) {
        if (candidate.vertices.some((v) => occupied.has(v))) continue;
        chosen.push(candidate);
        candidate.vertices.forEach((v) => occupied.add(v));
        if (chosen.length === 10) break;
      }
      if (chosen.length < 10) continue;
      const types = shuffled([0,1,2,3,4,-1,-1,-1,-1,-1], rng);
      return {
        rows: worldFrame.map((_, row) => slots.filter((t) => t.row === row).map((t) => `${t.cell}${t.number || ""}`).join(" ")),
        ports: chosen.map((p, i) => [p.row, p.col, p.angle, types[i]]),
      };
    }
    throw new Error("Unable to generate a legal New World map");
  }

  const wonderCards = [
    { id: "bridge", name: "大桥", english: "Great Bridge", cost: [3,0,1,1,0], requirements: { site: "bridge" }, requirementsText: ["在任一紫色标记处拥有村庄或城市。", "Own a settlement or city at a purple bridge site."] },
    { id: "wall", name: "长城", english: "Great Wall", cost: [1,3,0,1,0], requirements: { site: "wall" }, requirementsText: ["在任一棕色标记处拥有村庄或城市。", "Own a settlement or city at a brown wall site."] },
    { id: "theatre", name: "大剧院", english: "Great Theatre", cost: [1,1,3,0,0], requirements: { cities: 2 }, requirementsText: ["拥有至少两座城市。", "Own at least two cities."] },
    { id: "library", name: "大教堂", english: "Great Library", cost: [0,1,0,1,3], requirements: { cities: 1, victoryPoints: 6 }, requirementsText: ["拥有至少一座城市和六分。", "Own at least one city and have six victory points."] },
    { id: "colossus", name: "巨像", english: "Colossus", cost: [0,0,0,3,2], requirements: { harbors: 1, routeLength: 5 }, requirementsText: ["拥有至少一个海港及连续五段的道路或船；转接处须有自己的建筑。", "Own a harbor and a continuous five-segment road/ship route, joined through your own buildings."] },
  ].map((card) => ({ ...card, stages: 4 }));

  const tribesRows = [
    "g o s d o h", "s s s s s s s", "h6 t9 o11 b5 t6 o4 s w", "F w10 b8 w4 h12 t5 w2 s F",
    "t11 h9 o3 w8 b10 h3 s t", "s s s s s s s", "d b s b d g",
  ];
  const clothRows = [
    "t4 w6 b5 w11 h8", "h3 t12 s s t3 o9", "h12 s s g s s s", "F s d s s d s F",
    "s s s g s s o2", "b9 h2 s s w11 o4", "w10 t6 o5 h10 b8",
  ];
  const pirateRows = [
    "g11 o6 s s h4 b5", "b s s d s o9 t10", "h4 s s d s t3 w8 t5", "F s o8 s s h6 b9 w12 F",
    "h10 s s d s w11 t8 w9", "b s s w s o5 t2", "g3 o6 s s h10 b4",
  ];
  const wonderRows = [
    "g8 b2 s o10 s s", "s s s t11 s d s", "o12 h6 b11 h10 w3 t9 d s", "F o3 h4 o6 w5 b4 d s F",
    "b8 w9 s s b10 s s g6", "s t3 s t8 h9 s t4", "o5 s w11 w2 s h5",
  ];
  const bridge = [at(5,1,1), at(6,2,4)];
  const wall = [at(2,5,5), at(2,5,0), at(2,5,1), at(2,5,2), at(3,5,1)];
  const warnings = [at(5,1,0), at(5,1,2), at(6,2,3), at(5,3,3)];
  const defaultSeed = 20220919;
  const world = generateWorld(seeded(defaultSeed));
  const maps = [
    {
      id: "tribes", family: "tribes", name: "世外部落", english: "The Forgotten Tribe", target: 13,
      rows: tribesRows, mainCells: mainCells(tribesRows, (t) => t.row >= 2 && t.row <= 4 && Number(t.cell.slice(1)) > 0), ports: [],
      robber: [0,3], pirate: [0,2], bonusPoints: 0,
      randomPolicy: { redSeparated: false, restrictedNumbers: [{ cells: [[2,5],[3,6],[4,5]], forbidden: [5,6,8,9] }], shuffleGiftHarbors: true },
      randomRules: ["保留岛形、外岛和所有礼物位置；只洗匀主岛地形与数字。主岛最右侧三格不得放 5、6、8、9；红色数字可相邻。六个礼物海港的种类洗匀。", "Keep island outlines, foreign tiles and gift sites fixed. Shuffle mainland terrain and tokens; its three rightmost hexes cannot receive 5, 6, 8 or 9. Red tokens may touch. Shuffle the six gift harbor types."],
      scenario: {
        kind: "tribes",
        gifts: [
          ...[[0,0,300],[0,3,300],[0,5,300],[2,7,0],[4,7,0],[6,0,60],[6,3,120],[6,5,60]].map(([r,c,a], i) => ({ id: `vp-${i}`, ...edge(r,c,a), type: "vp", points: 1 })),
          ...[[0,0,180],[0,5,0],[6,0,180],[6,5,0]].map(([r,c,a], i) => ({ id: `development-${i}`, ...edge(r,c,a), type: "development" })),
          ...[[0,0,240],[0,3,240],[2,7,300],[4,7,60],[6,0,120],[6,3,60]].map(([r,c,a], i) => ({ id: `harbor-${i}`, ...edge(r,c,a), type: "harbor", resource: [0,1,2,3,4,-1][i] })),
        ],
      },
      rules: [
        ["初始与后续村庄只能建在主岛。外岛没有数字，不产资源，也不能建村。海岸边设有可领取的礼物。", "Build all settlements on the mainland. Foreign islands have no number tokens, produce no resources and cannot be settled. Gifts are placed along their coasts."],
        ["领取方式：按通常连接规则，将自己的船建造或移动到礼物标记连线所指的海岸边，即可领取该处的礼物。每份礼物由最先到达的玩家领取一次，之后不补充。", "Legally build or move your ship onto the coastal edge linked to a gift marker to collect it. Each gift goes to the first player to arrive and is not replenished."],
        ["六个海港礼物：五个资源专门港（各一种，2:1）和一个通用港（3:1）。领取后须立即放在自己沿海村庄或城市旁的合法海岸边，不得与现有港口重合或共用交叉点；没有合法位置则暂存，之后一有合法位置就必须放置。放好当回合即可使用。", "Six harbor gifts: five resource-specific 2:1 harbors and one generic 3:1 harbor. Place it immediately beside your own coastal settlement or city, without overlapping or sharing an intersection with another harbor. Keep it only while no legal site exists; place it as soon as one becomes available. It is usable on the turn placed."],
        ["港口上的资源图标表示兑换种类：例如木材 2:1，表示两张木材换银行一张自选资源；通用港 3:1 表示三张同种资源换一张。尚在外岛的港口不能用于交易。", "A harbor's resource icon specifies its exchange rate: a lumber 2:1 harbor exchanges two lumber for any one bank resource; a generic 3:1 harbor exchanges three identical resources for one. A harbor still on a foreign island cannot be used for trade."],
        ["奖杯标记共八枚，每枚 1 胜利点；卡牌标记共四张，每处可领取一张免费发展卡。行动发展卡从下一个自己的回合起可用；胜利点卡立即计分。", "There are eight trophies worth 1 VP each and four card markers, each granting a free development card. Action cards are playable on a later turn of your own; victory-point cards count immediately."],
        ["强盗从沙漠出发，离开外岛后不能返回；海盗从图示位置出发。", "The robber starts in the desert and cannot return to foreign islands after leaving. The pirate starts on the marked sea hex."],
        ["自己的回合达到十三分获胜。照片虽标注三人，官方英文版将同一布局用于三至四人。", "Win with thirteen VP on your turn. Although the photo is labelled three-player, the official English edition uses this same layout for three or four players."],
      ],
    },
    {
      id: "cloth", family: "cloth", name: "布匹贸易", english: "Cloth for Catan", target: 14,
      rows: clothRows, mainCells: mainCells(clothRows, (t) => Number(t.cell.slice(1)) > 0),
      ports: [[0,0,300,0],[0,3,240,-1],[1,0,180,1],[1,5,0,2],[4,6,0,3],[5,0,180,4],[6,1,120,-1],[6,3,60,-1],[5,5,60,-1]],
      robber: [2,0], pirate: [3,7], bonusPoints: 0, randomPolicy: { redSeparated: false },
      randomRules: ["保留两大岛外形，洗匀大岛地形、数字与海港种类；中央四岛、八个村落位置和数字不变。红色数字可相邻。", "Keep both mainland outlines; shuffle their terrain, tokens and harbor types. Keep all four central islands and all eight village numbers/sites fixed. Red tokens may touch."],
      scenario: {
        kind: "cloth", clothReserve: 10, startingSettlements: 3, longestRoute: false,
        villages: [[2,3,5,11],[2,3,2,8],[3,2,5,10],[3,2,2,9],[3,5,5,4],[3,5,2,5],[4,3,5,6],[4,3,2,3]].map(([r,c,corner,number], i) => ({ id: `village-${i}`, ...at(r,c,corner), number, cloth: 5 })),
      },
      rules: [
        ["初始在两座大岛建三个村庄，第三轮从起始玩家顺时针进行；只按第三个村庄领取起始资源。中央四岛不产资源、不能建村；交叉点的数字对应布匹村落。", "Start with three settlements on the two main islands; the third round runs clockwise from the starting player. Take starting resources only from the third settlement. The four central islands produce no resources and cannot be settled; numbers at intersections identify cloth villages."],
        ["八个村落各有五匹布，公库另有十匹。每人首次用船连到一个村落时取一匹，以后掷中其数字时每位已连接玩家取一匹。", "Each of eight villages holds five cloth; the reserve holds ten. Your first ship connection to a village gives one cloth, then each connected player gains one when its number rolls."],
        ["村落库存不足一次发放时由公库补足；已经空的村落不再生产。每两匹布值一分，单匹不计分；连接村落的航线视为封闭，船不能移动。", "The reserve completes a payout if village stock runs short; an already empty village produces nothing. Every two cloth are worth one VP. A route to a village is closed and its ships cannot move."],
        ["至少连接一个村落后才可移动海盗；可从受害者偷一张资源或一匹布。强盗只能在大岛上移动，不能封锁布匹村落。本剧本没有最长商路奖励。", "You may move the pirate only after connecting to a village, stealing either a resource or one cloth. The robber stays on the main islands and cannot block cloth villages. Longest Trade Route is not awarded."],
        ["自己的回合达到十四分，或仍有布的村落只剩三个时结束。后者由分数最高者获胜，同分比较布匹数。", "End at fourteen VP on your turn, or when at most three villages retain cloth. For the latter, highest VP wins; break a tie by cloth count."],
      ],
    },
    {
      id: "pirates", family: "pirates", name: "海盗巢穴", english: "The Pirate Islands", target: 10,
      rows: pirateRows, mainCells: mainCells(pirateRows, (t) => t.col >= ([0,6].includes(t.row) ? 4 : 5)),
      ports: [[0,4,240,0],[0,5,240,-1],[0,5,0,1],[1,6,0,2],[3,7,0,-1],[4,7,60,3],[5,6,60,4],[6,5,60,-1]],
      robber: null, pirate: [6,3], bonusPoints: 0, randomPolicy: { portsOnly: true },
      randomRules: ["仅洗匀八个海港种类；地形、数字、起始建筑、补给点、堡垒及海盗巡逻路线全部固定。", "Shuffle only the eight harbor types. Terrain, tokens, starting pieces, outposts, fortresses and the pirate patrol route remain fixed."],
      scenario: {
        kind: "pirates", longestRoute: false, largestArmy: false, fortressStrength: 3,
        piratePath: [[6,3],[6,2],[5,2],[4,2],[3,3],[2,2],[1,2],[0,2],[0,3],[1,4],[2,4],[3,4],[4,4],[5,4]],
        pirateSeats: [
          { color: "red", settlement: at(0,4,2), ship: edge(0,4,120), outpost: at(0,1,0), fortress: at(0,0,5) },
          { color: "blue", settlement: at(4,5,4), ship: edge(3,5,120), outpost: at(3,2,2), fortress: at(4,0,1) },
          { color: "orange", settlement: at(6,4,5), ship: edge(6,4,240), outpost: at(6,1,1), fortress: at(6,0,2) },
          { color: "white", settlement: at(2,5,3), ship: edge(3,5,240), outpost: at(3,2,5), fortress: at(2,0,0) },
        ],
      },
      rules: [
        ["开局：每人已有 1 座沿海村庄、1 艘船，再按基础规则在东侧主岛建 2 座村庄；三人局不用第 4 号位。本图没有强盗、最长商路或最大军队奖励。", "Setup: Start with 1 coastal settlement and 1 ship, then place 2 settlements on the eastern mainland under the usual rules. Omit seat 4 with three players. No robber, Longest Trade Route or Largest Army award."],
        ["航线与补给点：每人沿最短可行路线，从主岛经自己的西侧彩色圆点，到同色旗帜要塞；不能分叉、绕路挡人或越过要塞造船。连到圆点后可付费建村、升级城市；初始村庄不能放这里，其他外岛位置也不能建村。", "Route and outpost: Take one unbranched, shortest available shipping route from the mainland via your colored western dot to your matching fortress. No blocking detours or ships beyond the fortress. Reach your dot to pay for a settlement and later a city; no initial settlements there or other foreign settlement sites."],
        ["外岛道路：只有连续船线通往要塞才能进攻，道路不算；外岛建路没有收益，还占造船位置。本站允许在自己的建造阶段点击自己的外岛道路，确认后收回棋子，不退资源、发展卡或免费建造次数；主岛道路、船只和他人道路不能这样撤回。", "Island roads: Only a continuous ship line to your fortress permits attacks. Roads give no benefit here and occupy ship sites. On this site, during your building phase, click and confirm your own island road to recover its piece, with no resource, development-card or free-build refund. Mainland roads, ships and others' roads cannot be removed this way."],
        ["战舰：花 1 羊毛 + 1 麦子 + 1 矿石买随机发展卡，骑士显示为「战舰」。打出后免费升级最靠主岛的 1 艘普通船，没有普通船不能用。防守海盗和进攻要塞都数自己棋盘上的全部战舰：每艘 1 战力，普通船 0。", "Warships: Buy a random development card for 1 wool + 1 grain + 1 ore; Knights appear as Warships. Play one to upgrade your normal ship nearest the mainland for free; you need a normal ship. For both raids and fortress attacks, count all your warships on the board: 1 strength each, normal ships 0."],
        ["牌堆与出牌：三人局移除全部 5 张胜利点卡，剩 20 张（14 战舰）；四人局保留这 5 张但改作战舰，共 25 张（19 战舰）。两种人数都没有加分卡，道路建设、丰收、垄断各 2 张。每回合最多打出 1 张行动卡，新买的须等下一个自己的回合；用过不放回，牌堆耗尽不能再买。", "Deck and play: Three players remove all 5 VP cards: 20 cards, including 14 Warships. Four players keep the 5 as Warships: 25 cards, including 19 Warships. Neither deck scores VP; each has 2 Road Building, 2 Year of Plenty and 2 Monopoly. Play at most 1 action card per turn, never one bought that turn. Used cards never return; an empty deck ends purchases."],
        ["海盗巡航：每人掷骰后，海盗按较小骰点沿箭头顺时针移动，移动格数就是本次战力；如 3 和 5 走 3 格、战力 3，双骰相同就按该点数。只袭击最后停下的海洋格旁的村庄或城市，船只和沿途建筑不触发袭击。先结算袭击，再按骰子总和产资源或处理 7。", "Pirate patrol: After each roll, move clockwise along the arrows by the lower die; movement is raid strength. A 3 and 5 means 3 spaces and strength 3; doubles use that value. Raid only settlements or cities beside the final sea hex, not ships or buildings passed en route. Resolve raids before production for the total, or the rules for 7."],
        ["遭遇海盗：全部战舰数与海盗移动格数相比，大于就赢，银行任选 1 张有库存的资源；相等无事；小于就输，随机交回 1 张资源 + 自己每座城市 1 张，不够就交完。如有 4 艘战舰，海盗走 3／4／5 格分别为赢／平／输。袭击不拆船、建筑，也不减少要塞防御。", "Raids: Compare all your warships with pirate movement. Higher: choose 1 available bank resource. Equal: nothing. Lower: return 1 random resource plus 1 per city you own, or all if short. With 4 warships, movement of 3/4/5 means win/tie/loss. Raids remove no ships, buildings or fortress defenses."],
        ["掷到 7：仍先巡航、结算袭击，再由资源手牌超过 7 张的所有玩家弃一半（向下取整，发展卡不算）；掷骰者从任一有资源的对手随机偷 1 张，不限距离。海盗不再移动，也不按骰点产资源。", "Rolling 7: Patrol and resolve raids first. Then everyone with over 7 resource cards discards half, rounded down; development cards do not count. The roller steals 1 random resource from any opponent holding one, at any distance. No second pirate move and no production."],
        ["进攻要塞：船线接到自己的要塞后，每回合末可进攻一次，另掷 1 颗骰子。全部战舰数大于骰点，防御减 1（如 4 舰对 3 点）；相等损失离要塞最近的 1 艘船，小于损失最近的 2 艘船，防御不减。防御数字从 3 → 2 → 1 → 0，赢三次收复。任何结果都立即结束回合，断线须补回要塞才能再攻。", "Fortress attack: Once your ship line reaches your fortress, attack once at turn end by rolling 1 new die. More warships than the roll removes 1 defense (e.g. 4 warships vs 3). Equal loses the ship nearest the fortress; fewer loses the nearest 2, with no defense removed. Defenses go 3 → 2 → 1 → 0: three wins liberate it. Any result ends your turn; rebuild a broken line before attacking again."],
        ["收复、升级与获胜：收复前要塞不产资源、不计分、不能升级；收复后变成自己的村庄，产资源、计 1 分。之后自己的建造阶段可用 2 麦子 + 3 矿石升级城市，计 2 分、产量翻倍，占用 1 枚城市棋子（上限 4 座），不能在攻城后马上升级。自己的回合达 10 分且收复自己的要塞即获胜；所有要塞收复后移走海盗，巡航、袭击停止。", "Liberation, cities and victory: An occupied fortress produces nothing, scores no VP and cannot upgrade. Liberated, it is your producing settlement worth 1 VP. In a later building phase, pay 2 grain + 3 ore for a city: 2 VP, double production, using 1 of your 4 city pieces; never immediately after an attack. Win on your turn with 10 VP and your fortress liberated. Once all fortresses are free, remove the pirates and stop patrols and raids."],
      ],
    },
    {
      id: "wonders", family: "wonders", name: "卡坦奇观", english: "The Wonders of Catan", target: 10,
      rows: wonderRows, mainCells: mainCells(wonderRows, (t) => !((t.row === 0 && t.col < 2) || (t.row >= 4 && t.col === 11 - t.row))),
      ports: [[2,1,240,0],[2,3,240,1],[2,4,300,-1],[3,1,180,2],[3,2,60,-1],[5,1,180,3],[5,4,300,4],[5,4,60,-1],[6,2,60,-1]],
      robber: [1,5], pirate: null, bonusPoints: 1,
      randomPolicy: { redSeparated: false, restrictedNumbers: [{ cells: [[2,5],[3,5]], forbidden: [6,8] }] },
      randomRules: ["保留岛形、三格沙漠和标记位置；只洗匀主岛地形与数字，海港种类洗匀。紧邻沙漠的两格不得放六或八。", "Keep island outlines, all three deserts and marked sites. Shuffle mainland terrain/tokens and harbor types. The two productive hexes beside the deserts cannot receive six or eight."],
      scenario: { kind: "wonders", wonderSites: { bridge, wall }, setupExcluded: [...bridge, ...wall, ...warnings], warningSites: warnings, wonderCards, islandBonus: "each-settlement" },
      rules: [
        ["初始村庄只能建在主岛，不能占用紫色、棕色或惊叹号标记处。只有强盗，从沙漠出发；本剧本不使用海盗。", "Start on the mainland, excluding purple, brown and exclamation-mark sites. Only the robber is used, starting in the desert; there is no pirate."],
        ["在任一小岛每建一个村庄，额外获得一分；不是每岛仅奖励一次，升级城市不重复奖励。", "Every settlement built on either small island earns one extra VP, not merely the first per island. City upgrades do not repeat the bonus."],
        ["满足卡面要求后可选择尚无人选择的奇观，并将一艘未使用的船放在牌上作为标记，占用十五艘船库存；每人只能选一个，不能更换。五种奇观各有四层，每层支付卡面五张资源，可以一回合连建多层。", "Meet a card's requirements and reserve one unused ship from your fifteen-piece supply on the card to claim an unclaimed wonder. Each player may claim only one, irrevocably. Each of five wonders has four stages costing its listed five resources per stage; multiple stages may be built in one turn."],
        ["自己的回合完成第四层，或拥有至少十分且奇观层数严格高于所有对手，即获胜。巨像要求按照片卡面：一个海港与连续五段商路。", "Win on your turn by completing stage four, or by having at least ten VP and a strictly higher wonder stage than every opponent. Colossus follows the photographed card: a harbor and a five-segment route."],
      ],
    },
    {
      id: "new-world", family: "new-world", name: "新世界", english: "New World", target: 12,
      ...world, mainCells: mainCells(world.rows, () => true), robber: null, pirate: null, bonusPoints: 1,
      defaultGenerated: true, defaultSeed, defaultNote: ["原书只有空白框架；默认图为固定种子生成的合法示例，不是书中印刷布局。", "The book supplies only a blank frame. Default is a fixed-seed legal example, not an illustrated book layout."],
      randomPolicy: { regenerateWorld: true, redSeparated: true, goldNoRed: true },
      randomRules: ["默认地形是固定种子示例；随机模式重洗二十三块陆地、十九块海洋及二十三枚数字，六、八不得相邻。预览港口仅作示意，正式开局重新轮流抽取并选择海岸。", "Default terrain is a fixed-seed example. Random reshuffles twenty-three land, nineteen sea and twenty-three tokens; six/eight cannot touch. Preview harbors are illustrative; the actual game drafts fresh harbors onto player-chosen coasts."],
      scenario: { kind: "new-world", thiefOptions: ["both", "robber", "pirate"], harborCount: 10, harborPlacement: "draft", harborTypes: [0,1,2,3,4,-1,-1,-1,-1,-1], harborDraftStartSeat: 0 },
      rules: [
        ["初始村庄可建在一座或两座岛，这些是自己的起始岛。首次在每座非起始岛建村额外一分，别人先到不影响。", "Start on one or two islands, which become your home islands. Your first settlement on each foreign island earns one extra VP regardless of other players."],
        ["可选择同时使用强盗和海盗，或只用其中之一。自己的回合达到十二分获胜。", "Choose both robber and pirate, or either one alone. Win with twelve VP on your turn."],
        ["照片所列配件为二十三块资源地、十九块海洋和十个海港，不含沙漠或金矿；强盗初始在场外。", "The photographed inventory has twenty-three productive tiles, nineteen sea and ten harbors, with no desert or gold. The robber begins off-board."],
        ["正式开局从一号位起，按顺时针顺序轮流抽取一个海港并选择合法海岸摆放，直到十个放完，再开始建村；海港不可共用交叉点。可让最年长玩家坐一号位。", "Before settlements, draft all ten harbors clockwise from seat one: each player draws a harbor and chooses a legal coastal edge. Harbors cannot share intersections. Seat the oldest player first to follow the physical rule."],
      ],
    },
  ];
  for (const map of maps) {
    map.players = 4; map.minPlayers = 3; map.maxPlayers = 4;
    map.scenario.source = "photographed-2022-zh-with-2021-en-rules";
    map.rules.unshift(["三至四人；默认图与随机图使用相同剧本规则。", "Three or four players; Default and Random share the same scenario rules."]);
    if (map.defaultNote) map.rules.splice(1, 0, map.defaultNote);
    map.rules.push([`随机地图：${map.randomRules[0]}`, `Random layout: ${map.randomRules[1]}`]);
  }
  return { maps, wonderCards, generateWorld };
});
