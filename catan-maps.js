"use strict";
(function (root, factory) {
  const maps = factory(typeof module === "object" && module.exports ? require("./catan-scenario-maps") : root.CatanScenarioMaps);
  if (typeof module === "object" && module.exports) module.exports = maps;
  else root.CatanMaps = maps;
})(typeof globalThis === "object" ? globalThis : this, (scenarios) => {
  // Pointy-top rows, clockwise port normals (degrees). F is printed frame water.
  const maps = [
    { id: "shores-1", name: "扬帆出海1", english: "New Shores 1", players: 3, target: 14, family: "shores", robber: [0, 0], pirate: [3, 6], rows: [
      "b12 g5 s s", "s s s w4 o9", "s h4 w6 s h3 s", "F w2 o5 t10 s g4 F",
      "b8 w10 w9 t8 s s", "h11 o3 b11 s o8", "h6 t5 s b10",
    ], ports: [[6,0,180,1],[6,1,120,0],[6,1,0,-1],[4,0,120,-1],[4,0,240,4],[2,1,180,3],[2,2,0,-1],[4,3,300,2]] },
    { id: "shores-2", name: "扬帆出海2", english: "New Shores 2", players: 4, target: 14, family: "shores", robber: [4,2], pirate: [3,7], rows: [
      "o8 w11 s g4 s", "s s s s b5 o2", "s w5 t6 o4 s t9 s", "F h12 b11 h3 w9 s g10 F",
      "b6 t10 d h11 t5 s s", "o3 w4 b9 w8 s b3", "h8 t2 o10 s h6",
    ], ports: [[2,1,180,-1],[2,3,240,4],[3,4,300,-1],[4,4,60,3],[6,2,0,-1],[6,1,120,0],[6,0,180,-1],[4,0,120,1],[4,0,240,2]] },
    { id: "islands-1", name: "四岛群岛1", english: "Four Islands 1", players: 3, target: 13, family: "islands", robber: [6,0], pirate: null, rows: [
      "s s h4 w3", "o4 t9 s h9 b5", "w6 o10 s t8 b11 s", "F s s s s s F",
      "h11 o8 t3 s b10 b6", "t5 w9 s o2 h5", "w12 s s s",
    ], ports: [[4,0,120,-1],[4,0,300,0],[5,1,60,2],[2,0,240,-1],[1,1,60,4],[2,4,120,1],[1,4,300,-1],[5,3,240,-1],[4,5,60,3]] },
    { id: "islands-2", name: "四岛群岛2", english: "Four Islands 2", players: 4, target: 13, family: "islands", robber: [1,3], pirate: null, rows: [
      "w8 s t9 t11", "b10 s o3 h12 w5", "h5 t3 s b5 o10 s", "F s s t6 s s F",
      "b4 w9 s s t9 w11", "h6 o4 b2 s o8", "w10 h11 s h4",
    ], ports: [[4,0,120,1],[6,0,180,2],[5,1,300,-1],[2,0,60,-1],[1,0,180,3],[3,3,240,-1],[1,4,60,0],[4,5,240,4],[4,5,60,-1]] },
  ];
  maps.push(
    { id: "fog-1", name: "未知海域1", english: "Fog Islands 1", players: 3, target: 12, family: "fog", robber: [6,1], pirate: null, pirateOffset: [6,4,92,0], rows: [
      "? ? s b6 t11", "? ? ? s t5 h3", "s s s ? s w8 w9", "F t6 w5 s ? s o4 F",
      "s b11 t9 s ? s s", "s o8 h10 s ? ?", "s w12 s ? ?",
    ], ports: [[0,3,300,-1],[0,4,0,2],[2,6,300,3],[3,6,0,-1],[3,1,120,4],[5,1,180,0],[6,1,180,-1],[5,2,60,1]], fogNumbers: [3,3,4,5,6,8,9,10,11,12] },
    { id: "fog-2", name: "未知海域2", english: "Fog Islands 2", players: 4, target: 12, family: "fog", robber: [1,5], pirate: null, pirateOffset: [6,3,46,80], rows: [
      "? s b4 h10 o3", "? ? s w9 t6 b12", "s s ? s s w10 o8", "F o3 s ? ? s h11 F",
      "h6 t4 s ? ? s t5", "b9 w8 s ? ? s", "w2 t5 s ? ?",
    ], ports: [[0,2,300,2],[0,3,300,3],[0,4,0,-1],[1,5,0,1],[3,6,0,-1],[3,1,180,0],[4,0,120,4],[6,0,180,-1],[6,1,120,-1]], fogNumbers: [3,4,5,6,8,9,10,11,11,12] },
    { id: "desert-1", name: "穿越荒漠1", english: "Through the Desert 1", players: 3, target: 14, family: "desert", robber: [0,1], pirate: null, pirateOffset: [0,0,46,-80], rows: [
      "g4 d s o8", "t3 d t4 s w12", "h6 d b5 w6 s s", "F s o3 t10 s g5 F",
      "t11 b6 h2 b9 s s", "o10 h9 t8 s h9", "w8 w4 s o5",
    ], ports: [[1,2,300,0],[4,1,240,3],[4,0,120,2],[6,0,180,4],[6,0,60,1],[6,1,0,-1],[4,3,60,-1],[3,3,0,-1]] },
    { id: "desert-2", name: "穿越荒漠2", english: "Through the Desert 2", players: 4, target: 14, family: "desert", robber: [0,1], pirate: null, pirateOffset: [0,0,46,-80], rows: [
      "g10 d t5 s o9", "o11 d b3 w6 s h4", "h8 d o8 h10 t4 s b2", "F s t10 b11 w9 s s F",
      "b12 b6 h5 t8 s g5 w3", "w3 w11 o4 s s s", "s t9 s o6 h12",
    ], ports: [[0,2,0,1],[2,4,300,-1],[2,4,60,-1],[4,3,60,-1],[3,2,180,2],[5,0,180,3],[5,0,60,4],[6,1,0,0],[6,1,120,-1]] },
  );
  if (!scenarios?.maps) throw new Error("Load catan-scenario-maps.js before catan-maps.js");
  maps.push(...scenarios.maps);
  const terrain = { t: 0, b: 1, w: 2, h: 3, o: 4, d: -1, s: -2, F: -2, g: 5, "?": -3 };
  const adjacent = (a, b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs(a.q+a.r-b.q-b.r)) === 1;
  const randomRules = {
    shores: ["主岛地形、数字和港口分别洗匀；小岛框内连同海洋一起洗匀，保留框的范围。6、8 不相邻。", "Shuffle mainland terrain, tokens and harbor types separately. Shuffle land AND sea within the foreign region. Red 6/8 tokens cannot be adjacent."],
    islands: ["保留四座岛的外形，随机地形、数字和港口。森林、牧场配较好的数字（不放 2、3、11、12）。", "Keep all four island outlines; shuffle terrain, tokens and harbor types. Forests and pastures receive productive numbers, not 2, 3, 11 or 12."],
    fog: ["保留已知岛屿外形与未知格位置，随机已知地形、数字和港口；红色 6、8 可以相邻。未知地形堆与数字堆始终分别洗匀。", "Keep known island outlines and fog locations. Shuffle visible terrain, tokens and harbors; red 6/8 tokens MAY touch. The two discovery stacks are always shuffled separately."],
    desert: ["主岛与外地分别随机地形和数字，保留外形及三块沙漠位置；港口洗匀。6、8 不相邻，也不能放在金矿上。", "Shuffle mainland and foreign terrain/tokens separately, preserving outlines and all three deserts. Shuffle harbor types. Red 6/8 tokens cannot touch or be placed on gold fields."],
  };
  for (const map of maps) {
    map.tiles = map.rows.flatMap((row, y) => row.split(" ").map((cell, x) => ({ row: y, col: x, q: Math.max(-3, -y) + x, r: y - 3, resource: terrain[cell[0]], number: Number(cell.slice(1)) || 0, frame: cell === "F" })));
    // The desert belt separates reward territories even though the land is physically connected.
    const components = [];
    for (const tile of map.tiles.filter((t) => t.resource >= (map.family === "desert" ? 0 : -1))) {
      if (tile.region !== undefined) continue;
      const region = components.length, members = [], queue = [tile]; tile.region = region;
      while (queue.length) {
        const t = queue.pop(); members.push(t);
        for (const n of map.tiles) if (n.resource >= (map.family === "desert" ? 0 : -1) && n.region === undefined && adjacent(t, n)) { n.region = region; queue.push(n); }
      }
      components.push(members);
    }
    const main = components.reduce((best, list, i) => list.length > components[best].length ? i : best, 0);
    if (map.scenario) {
      const mainland = new Set(map.mainCells.map(([row, col]) => `${row}:${col}`));
      for (const t of map.tiles) {
        const home = mainland.has(`${t.row}:${t.col}`);
        t.setupAllowed = t.resource >= -1 && home;
        t.noProduction = t.resource >= -1 && !t.number;
        t.noSettlement = t.resource >= -1 && !home && ["tribes", "cloth", "pirates"].includes(map.family);
        t.robberAllowed = t.resource >= -1 && map.family !== "pirates" && (!["tribes", "cloth"].includes(map.family) || home);
      }
      map.randomPolicy.groups = map.randomPolicy.portsOnly || map.randomPolicy.regenerateWorld ? [] : [map.tiles.filter((t) => t.setupAllowed && t.resource >= 0 && t.number).map((t) => [t.row, t.col])];
      continue;
    }
    for (const t of map.tiles) {
      if (map.family === "desert" && t.resource === -1) t.region = main;
      t.setupAllowed = t.resource >= -1 && (["fog", "islands"].includes(map.family) || t.region === main);
    }
    map.bonusPoints = map.family === "fog" ? 0 : 2;
    map.randomPolicy = { redSeparated: map.family === "shores" || map.family === "desert", goldNoRed: map.family === "desert", productivePastures: map.family === "islands" };
    const groups = [[], []];
    for (const t of map.tiles) if (t.resource >= 0 || (t.resource === -1 && map.family !== "desert")) groups[["shores", "desert"].includes(map.family) && !t.setupAllowed ? 1 : 0].push([t.row, t.col]);
    if (map.family === "shores") groups[1].push(...(map.players === 3 ? [[0,2],[0,3],[2,5],[4,5]] : [[0,2],[0,4],[2,6],[4,6]]));
    map.randomPolicy.groups = groups.filter((g) => g.length);
    map.randomRules = randomRules[map.family];
    if (!map.randomRules) throw new Error(`Missing scenario randomization policy: ${map.id}`);
    map.rules = [
      [`${map.players} 人。默认地图按说明书摆放；也可选择本剧本的随机地图。`, `${map.players} players. Use the illustrated default board or this scenario's random layout.`],
      ["shores", "desert"].includes(map.family) ? ["初始两个村庄只能建在主岛；沿海可配道路或船。", "Both starting settlements must be on the main island; a coastal settlement may start with a road or ship."] : map.family === "fog" ? ["初始村庄只能建在两座已知岛屿；不能建在未知格。沿海可配道路或船。", "Start only on the two known islands, never in fog. Coastal settlements may start with a road or ship."] : ["初始两个村庄可放在任意一座或两座岛；这些岛是你自己的起始岛。", "Start on any one or two islands. Those become your personal home islands."],
      map.family === "fog" ? ["道路或船到达未知格旁的交叉点时立即探索：先翻地形，陆地再翻数字并领 1 张对应资源；金矿任选 1 张，海洋不领奖励。本图没有登岛奖励分。", "A road or ship reaching a fog intersection reveals terrain, then a token for land. Gain one matching resource (choose one for gold); sea gives nothing. No island bonus VP in this scenario."] : map.family === "desert" ? ["沙漠另一侧与三座小岛共四处外地，不能初始建村。每人首次在每处外地建村额外 +2 分，最多 +8；别人先到不影响，升级城市不重复奖励。", "The land beyond the desert and three small islands are four foreign territories, excluded from setup. Each player's first settlement in each earns +2 VP, up to +8, regardless of other players. City upgrades do not repeat the bonus."] : ["首次在每座非起始岛建村庄，额外获得 2 分，每座岛每位玩家仅一次；不受他人先登岛影响。", "Your first settlement on each foreign island earns 2 extra VP, once per island for each player, even if another player arrived first."],
      [map.id === "shores-2" || map.family === "desert" ? "强盗从沙漠出发，海盗从图中 X 所在海域出发。" : "强盗从数字 12 地块出发，海盗从图中 X 所在海域出发。", map.id === "shores-2" || map.family === "desert" ? "The robber starts in the desert; the pirate starts on the marked sea hex." : "The robber starts on the 12 hex; the pirate starts on the marked sea hex."],
      ...(map.family === "fog" ? [["即使选默认地图，12 块未知地形和 10 枚未知数字也会分别洗匀并保密，探索前谁都不能查看。", "Even in Default mode, the 12 fog terrain tiles and 10 number tokens are separately shuffled and hidden from everyone until discovery."]] : []),
      [`在自己的回合达到 ${map.target} 分立即获胜。`, `Win immediately upon reaching ${map.target} VP on your own turn.`],
      [`随机地图：${map.randomRules[0]}`, `Random layout: ${map.randomRules[1]}`],
    ];
  }
  const rules = [
    ["船：1 木材 + 1 羊毛。每人的棋子库存为 5 个村庄、4 座城市、15 条道路、15 艘船。", "Ship: 1 lumber + 1 wool. Each player's piece supply is 5 settlements, 4 cities, 15 roads and 15 ships."],
    ["标准发展牌共 25 张：14 骑士、5 胜利点、2 道路建设、2 丰收、2 垄断。海盗巢穴例外：三人局移除 5 张胜利点牌，四人局将其作为骑士使用。", "The standard 25-card development deck has 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty and 2 Monopoly. Pirate Islands is an exception: remove the 5 VP cards with three players; treat them as Knights with four."],
    ["船只能建在海上或海岸边，道路只能建在陆地或海岸边；同一边只能放一个。船与道路必须经自己的村庄或城市连接。", "Ships go on sea/coastal edges, roads on land/coastal edges; one piece per edge. A road and ship connect only through your own settlement or city."],
    ["每个自己的建造阶段可移动一艘开放航线末端的旧船。本回合新造的船、封闭航线的船及海盗旁的船不能移动。", "Once per building phase, move an old ship at an open shipping end. Newly built ships, closed shipping routes and ships beside the pirate cannot move."],
    ["最长商路合并计算道路和船，连接转换处必须有自己的建筑；至少 5 段，奖励 2 分。道路建设卡可免费造两条路、两艘船或各一个。", "Longest Trade Route counts roads and ships, joined through your own buildings. At least 5 segments earn 2 VP. Road Building allows two roads, two ships, or one of each."],
    ["掷出 7 或使用骑士，可选择移动强盗或海盗。强盗封锁陆地产出；海盗封锁相邻船只的建造和移动，并可从相邻船主随机偷 1 张资源。", "On 7 or a Knight, move either robber or pirate. The robber blocks production. The pirate blocks adjacent ship building/movement and can steal one random resource from an adjacent ship owner."],
    ["金矿产出时：村庄任选 1 张、城市任选 2 张资源。多人领取按当前玩家起顺时针选择，受银行库存限制。黄金不是额外的资源卡。", "Gold fields yield any 1 resource for a settlement or any 2 for a city. Choose clockwise from the active player, subject to bank supply. Gold is not a separate resource card."],
    ["保留基础版距离、交易、弃牌与发展卡规则。旧发展卡可在掷骰前或之后使用，每回合最多一张；胜利点卡例外。", "Base-game distance, trade, discard and development rules still apply. An older action development card can be played before or after rolling, at most one per turn; VP cards are exempt."],
  ];
  return { maps, rules, get: (id) => maps.find((map) => map.id === id) };
});
