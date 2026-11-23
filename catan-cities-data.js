"use strict";
(function (root) {
  const branches = [["科学", "Science", "paper", "#36876d"], ["贸易", "Trade", "cloth", "#c79834"], ["政治", "Politics", "coin", "#4385b4"]];
  const resources = ["wood", "brick", "wool", "grain", "ore", "paper", "cloth", "coin"];
  const cards = {
    alchemy: [0,2,"炼金术","Alchemy","掷骰前指定两颗数字骰；事件骰仍随机。","Before rolling, choose both number dice. The event die remains random."],
    crane: [0,2,"起重机","Crane","本回合一次城市改良少付 1 商品；同一次改良不能叠加。","One city improvement this turn costs 1 fewer commodity; no stacking on one improvement."],
    engineering: [0,1,"工程学","Engineering","免费为一座城市建城墙。","Build one city wall for free."],
    invention: [0,2,"发明","Invention","交换两块地形的数字，不能移动 2、6、8、12。","Swap two number discs, excluding 2, 6, 8 and 12."],
    irrigation: [0,2,"灌溉","Irrigation","每块邻接自己建筑的麦田领 2 麦，地块不重复计算。","Take 2 grain per distinct field adjacent to your buildings."],
    medicine: [0,2,"医学","Medicine","本回合一次升级城市只需 1 麦、2 矿。","One city upgrade this turn costs only 1 grain and 2 ore."],
    mining: [0,2,"采矿","Mining","每块邻接自己建筑的山地领 2 矿，地块不重复计算。","Take 2 ore per distinct mountain adjacent to your buildings."],
    printing: [0,1,"印刷术","Printing","立即公开，获得 1 分。","Reveal immediately for 1 VP."],
    roads: [0,2,"道路建设","Road Building","免费建至多两条道路，遵守连接和棋子上限。","Build up to two roads for free, obeying connections and piece limits."],
    smithing: [0,2,"锻造","Smithing","免费晋升至多两名不同骑士；仍遵守等级、库存和每回合晋升一次限制。","Promote up to two different knights for free, within rank, supply and once-per-turn limits."],
    harbor: [1,2,"商业港","Commercial Harbor","每打出 1 张商业港，可在当前回合向每名对手各提供一次 1 资源，换其自选 1 商品；机会在回合结束时失效。","Each Commercial Harbor played lets you offer each opponent 1 resource once during this turn for 1 commodity of their choice; unused exchanges expire at turn end."],
    guild: [1,2,"行会税","Guild Dues","查看一名分数比你高的对手的资源和商品，自选两张拿走。","Inspect a higher-scoring opponent's resources and commodities and take any two."],
    merchant: [1,6,"商人","Merchant","将商人放在自己建筑旁的资源地块，获得该资源 2:1 兑换和 1 分，直到别人夺走商人。","Place the merchant beside your building: 2:1 trade for that resource and 1 VP until another player takes control."],
    fleet: [1,2,"商船队","Merchant Fleet","指定一种资源或商品，本回合可按 2:1 兑换。","Choose one resource or commodity to trade at 2:1 this turn."],
    monopoly: [1,4,"资源垄断","Resource Monopoly","指定资源，每名对手交出至多 2 张。","Name a resource; each opponent gives you up to 2 of it."],
    tradeMonopoly: [1,2,"商品垄断","Trade Monopoly","指定商品，每名对手交出至多 1 张。","Name a commodity; each opponent gives you up to 1 of it."],
    diplomacy: [2,2,"外交","Diplomacy","移除一条开放道路：至少一端不接该道路主人自己的道路、建筑或骑士。若移除自己的道路，可立即免费另建一条，完成后才重算最长道路。不能使任何骑士失去道路连接。","Remove an open road: at least one end touches none of its owner's other roads, buildings or knights. If it is yours, rebuild one for free, then recalculate Longest Road. No knight may be stranded."],
    espionage: [2,3,"间谍","Espionage","查看一名对手的进步卡，拿走其中一张。","Inspect an opponent's progress cards and take one."],
    encouragement: [2,2,"鼓舞","Encouragement","免费激活自己的全部骑士；新激活的骑士本回合不能行动。","Activate all your knights for free; newly activated knights cannot act this turn."],
    intrigue: [2,2,"谋略","Intrigue","驱逐位于自己道路端点上的一名对手骑士，由其主人选择迁移位置。","Displace an opponent's knight touching your road; its owner chooses where to relocate it."],
    taxation: [2,2,"征税","Taxation","首次蛮族入侵后，移动强盗，从新地块旁每名对手各偷一张资源或商品。","After the first barbarian attack, move the robber and steal one resource or commodity from every adjacent opponent."],
    constitution: [2,1,"宪法","Constitution","立即公开，获得 1 分。","Reveal immediately for 1 VP."],
    treason: [2,2,"叛变","Treason","指定对手，由其移除一名骑士；你可免费放置同级或较低级骑士，保留激活状态，强骑士不要求政治三级。","Choose an opponent who removes a knight; place one of equal or lower rank with the same active state. A mighty knight needs no Fortress."],
    wedding: [2,2,"婚礼","Wedding","每名分数比你高的对手自行选择两张资源或商品给你，不足则全给。","Each higher-scoring opponent chooses 2 resources or commodities to give you, or all if fewer."],
    sabotage: [2,2,"破坏","Sabotage","分数不低于你的每名对手弃掉一半资源和商品，向下取整；城墙不减免。","Every opponent with at least your score discards half their resources and commodities, rounded down; walls do not help."]
  };
  const knightPlacement = [
    ["挡路：对手的路修到你的骑士处就停住，不能穿过这个路口继续修；骑士未激活也一样。只有待建道路的另一端已经连着对手自己的道路或建筑，才可从那边修到骑士旁，仍不能穿过去，也不能跳过骑士凭空新起一段路。骑士不会挡自己的路；计算最长道路时，会在该处断开对手的连续道路。", "Roads: an opponent's road must stop at your knight; it cannot extend through that intersection, even if the knight is inactive. Only if the proposed road's other end already connects to the opponent's own road or building may they build toward the knight from that side. They still cannot pass through the knight or start a disconnected road beyond it. Knights do not block their owner's roads; they split opponents' continuous roads when counting Longest Road."],
    ["占位：骑士不能与村庄、城市或另一名骑士占同一个交叉点，即使都是自己的也不行。想在骑士的位置建村庄，必须先按移动规则移走骑士，再满足道路连接和村庄间距要求。未激活的骑士不能直接挪开：先花 1 麦激活，等下一个自己的回合再移动。", "Building sites: a knight cannot share an intersection with a settlement, city or another knight, even your own. To build a settlement there, first move the knight legally, then meet the road connection and distance rules. An inactive knight cannot simply be moved aside: pay 1 grain to activate it and wait until your next turn to move it."]
  ];
  const rules = [
    ["基础建设与交易 / Building & Trading", "道路花木＋砖，沿自己的道路或建筑延伸；村庄花木、砖、羊、麦各 1，须连接自己的道路，且相邻交叉点不能有村庄或城市。城市花 2 麦＋3 矿，升级自己的村庄并收回村庄棋子。与玩家交易由当前玩家发起，双方同意后交换；银行通常同种 4 换 1，自己建筑所在的通用港 3 换 1，专用港对应资源 2 换 1。不能以进步卡、分数或建筑交易。", "A road costs lumber + brick and extends your road or building. A settlement costs one each of lumber, brick, wool and grain, connects to your road, and needs all neighboring intersections free of settlements and cities. Upgrade your settlement to a city for 2 grain + 3 ore, returning the settlement piece. The active player may negotiate trades with others, completed by mutual agreement. Bank trades are normally 4 of one type for 1; a building at a generic harbor gives 3:1, or 2:1 for a specialized harbor's resource. Progress cards, VP and buildings cannot be traded."],
    ["目标与开局 / Goal & Setup", "3–4 人，自己回合达到 13 分获胜。顺时针各放一个村庄和道路，再逆时针各放一座城市和道路。初始城市从相邻地块各领 1 张普通资源，不领商品。首次蛮族入侵前强盗不在棋盘上。", "3–4 players; reach 13 VP on your own turn. Place one settlement and road clockwise, then one city and road counterclockwise. The starting city collects one normal resource per adjacent producing hex, no commodities. The robber stays off the board until the first barbarian attack."],
    ["物资与棋子 / Supply & Pieces", "每人 5 村庄、4 城市、15 道路、3 城墙，一级、二级、三级骑士各 2 名。资源每种 19 张；纸、布、币每种 12 张。保留最长道路（2 分），不用最大军队和基础版发展卡。村庄 1 分、城市 2 分、都会 4 分。", "Each player has 5 settlements, 4 cities, 15 roads, 3 walls and 2 knights of each rank (1, 2, 3). The bank has 19 of each resource and 12 each of paper, cloth and coin. Longest Road (2 VP) remains; Largest Army and base development cards are removed. Settlements score 1, cities 2, metropolises 4."],
    ["回合与生产 / Turn & Production", "先掷两颗数字骰和事件骰，处理事件，再处理生产或七点，最后交易和建造。事件骰一半概率推进蛮族船，科学、贸易、政治各六分之一。城市在森林领木＋纸、牧场领羊＋布、山地领矿＋币，麦田和丘陵仍领 2 张资源；村庄照常领 1 张。资源和商品均可交易、偷取和弃牌。", "Roll two number dice and the event die. Resolve the event, then production or seven, then trade and build. The event die advances barbarians with probability 1/2; science, trade and politics each have probability 1/6. Cities collect lumber + paper, wool + cloth, or ore + coin; fields and hills still give 2 resources. Settlements receive 1 resource. Resources and commodities can be traded, stolen and discarded."],
    ["七点与城墙 / Seven & Walls", "掷七时手牌超过 7 张须弃一半（向下取整），每道城墙提高 2 张上限，最多 13。首次入侵前七点只弃牌，不移动强盗或偷牌；此后照常移动并偷一名相邻对手。城墙花 2 砖，每城最多一道，不加分，也不能防止蛮族摧毁城市。", "On seven, discard half your resources and commodities (round down) if above 7 cards; each wall raises the limit by 2, up to 13. Before the first attack, seven only causes discards, not robber movement or theft. Afterwards move the robber and steal from one adjacent opponent. A wall costs 2 brick, one per city, scores nothing and does not protect against barbarians."],
    ["城市改良与都会 / Improvements & Metropolises", "纸发展科学，布发展贸易，币发展政治。五级依次支付 1、2、3、4、5 张对应商品，必须拥有城市。科学三级：非七点且本次生产完全未领到资源或商品，任选 1 普通资源。贸易三级：所有商品可 2:1 交易。政治三级：可晋升三级骑士。每条路线首个四级者在自己的城市放都会，多 2 分。若对手比你先将同一项改良升到五级，就会拿走你的都会标记和额外 2 分，把标记放到自己的城市上；你的城市仍归你。你先升到五级，则能保住这类都会，别人之后升到五级也抢不走。平级不夺取，新都会需要一座未占用的城市。失去全部城市不会失去改良与能力，但不能继续改良。", "Spend paper on science, cloth on trade and coin on politics. Levels 1–5 cost 1–5 corresponding commodities and require a city. Science 3: choose 1 normal resource when a non-seven production gives you nothing. Trade 3: trade any commodity at 2:1. Politics 3: promote to mighty knights. First to level 4 claims that branch's metropolis (+2 VP). If an opponent reaches level 5 in that same branch before you, they move your metropolis marker to their own city and take its 2 bonus VP from you. Your city remains yours. If you reach level 5 first, you keep that metropolis even when others later reach level 5. Ties do not take it. A new metropolis requires a free city. Losing all cities preserves improvements and abilities, but prevents further improvements."],
    ["骑士 / Knights", "招募一级骑士或晋升一次均花羊＋矿；激活花 1 麦。骑士放在自己道路端点的空交叉点，不受村庄距离限制，也不生产或计分。每名骑士每回合最多晋升一次，晋升保留激活状态。之前回合已激活的骑士可沿自己的连续道路移动、赶走较弱对手骑士，或移走相邻强盗并偷一张；行动后失活，可再次花麦激活，但不能再次行动。新激活的骑士要等下回合才能行动。被驱逐者由主人沿自己的道路迁移，无位置则收回；保留激活状态。骑士无论激活与否都阻断对手道路与最长道路。", "Recruit a basic knight or promote one for wool + ore; activate for 1 grain. Place on an empty intersection touching your road, ignoring settlement distance. Knights produce nothing and score no VP. Promote each knight at most once per turn, retaining activation. Knights activated on a previous turn may move along your roads, displace a weaker opposing knight, or chase an adjacent robber and steal. Acting deactivates them; they may reactivate but cannot act again that turn. Displaced knights relocate along their owner's roads, keeping activation, or return to supply if no site exists. Active and inactive knights block opponents' roads and Longest Road."],
    ["蛮族入侵 / Barbarian Attack", "船每前进一步，走到第 7 格就入侵。蛮族强度＝全岛城市和都会总数；防守强度＝全部已激活骑士的等级之和。防守不低于蛮族则成功：贡献唯一最多者得 1 分；最高并列者各自选一类进步卡抽一张，不得分。失败时，在拥有普通城市的人中，贡献最少者各选一座城市降为村庄，城墙也失去；都会不会被毁。没有村庄棋子时用倒放的城市代替，之后必须先重建它。无论胜负，所有骑士失活，船回起点；首次入侵后把强盗放到沙漠。最后才处理这次数字骰的生产或七点。", "The ship attacks on its seventh advance. Barbarian strength equals all cities and metropolises; defense is the sum of all active knights' ranks. If defense is at least attack, the sole highest contributor gains 1 VP; tied highest contributors each choose a progress-card category and draw one instead. If defense fails, among players with ordinary cities, each lowest contributor downgrades one city and loses its wall. Metropolises cannot be destroyed. If all settlement pieces are used, a city on its side represents the settlement and must be rebuilt first. Afterwards all knights deactivate and the ship resets; after the first attack the robber enters its scenario starting hex. Only then resolve production or seven."],
    ["进步卡 / Progress Cards", "事件骰出现城门颜色时，该路线至少一级且红骰不高于改良级别＋1 的玩家，按当前玩家起顺时针各抽一张。三类各 18 张。加分卡立即公开，不计手牌上限。其余最多持 4 张；别人回合拿到第 5 张须立即弃一张，自己回合可先使用，到回合结束不得超过 4 张。新抽卡可立即使用，可在自己掷骰后连续使用多张；只有炼金术在掷骰前使用。用过或弃掉的卡放回对应牌堆底，不洗牌。进步卡不能交易或被强盗偷。", "A colored gate gives a progress card to each player with at least level 1 in that branch whose improvement level + 1 is at least the red die, clockwise from the current player. Each category has 18 cards. VP cards reveal immediately and do not count toward the 4-card hand limit. On another player's turn discard immediately if above 4; on your own turn you may play cards first, but must finish with at most 4. Newly drawn cards can be played immediately; play any number after rolling, except Alchemy before rolling. Return played/discarded cards to the bottom of their deck without shuffling. Progress cards cannot be traded or stolen by the robber."],
    ["库存与结算 / Shortages & Scoring", "银行资源和商品不足时，同种物资有多名领取者则该种全部不发；仅一人领取则给剩余数量。科学三级按实际领取结果判断。商品的 3:1 港口与 4:1 银行交易照常，但资源专用 2:1 港口不适用于商品。商人、保卫卡坦分数和公开加分卡均计入总分。", "If multiple players claim an item and the bank cannot supply all, none receive that item; a sole claimant gets what remains. Aqueduct checks actual receipts. Generic 3:1 harbors and 4:1 bank trades apply to commodities, but resource-specific 2:1 harbors do not. Merchant, Defender of Catan and revealed VP cards all count toward victory."]
  ];
  const knightRules = rules.find(([title]) => title === "骑士 / Knights");
  knightPlacement.forEach(([zh,en]) => { knightRules[1] += ` ${zh}`; knightRules[2] += ` ${en}`; });
  // Structured explanations are shared by the rule book, help dialogs and card previews.
  const ruleSections = [
    {
      "key": "building",
      "items": [
        [
          "道路",
          "Roads",
          "花 1 木材 + 1 砖块，沿自己的道路或建筑继续修路。",
          "Pay 1 lumber + 1 brick to extend your own road or building."
        ],
        [
          "村庄",
          "Settlements",
          "花木材、砖块、羊毛、麦子各 1 张。位置必须连接自己的道路；相邻交叉点不能已有村庄或城市。",
          "Pay 1 each of lumber, brick, wool and grain. The site must touch your road, with no settlement or city at a neighboring intersection."
        ],
        [
          "城市",
          "Cities",
          "花 2 麦子 + 3 矿石，把自己的一个村庄升级成城市，并收回村庄棋子。",
          "Pay 2 grain + 3 ore to upgrade your settlement to a city and return its settlement piece to your supply."
        ],
        [
          "和玩家交易",
          "Trading with players",
          "由当前回合的玩家发起，双方同意后交换资源或商品。进步卡、分数和建筑不能交易。",
          "The current player may offer a resource or commodity trade; both sides must agree. Progress cards, points and buildings cannot be traded."
        ],
        [
          "和银行交易",
          "Trading with the bank",
          "通常用 4 张相同资源或商品换 1 张其他资源或商品。自己的建筑连接通用港口时，可用 3 张相同物资换 1 张；专用港口只让对应的普通资源按 2:1 兑换。银行必须有你要换的牌。",
          "Normally trade 4 identical resources or commodities for 1 other resource or commodity. A building at a generic harbor gives 3:1; a specialized harbor gives 2:1 only for its named normal resource. The bank must have the requested card."
        ]
      ]
    },
    {
      "key": "setup",
      "items": [
        [
          "人数和胜利条件",
          "Players and victory",
          "3–4 人游玩。在自己的回合达到 13 分即可获胜。",
          "For 3–4 players. Reach 13 VP on your own turn to win."
        ],
        [
          "第一轮摆放",
          "First placement round",
          "从第一位玩家开始，顺时针每人放 1 个村庄和 1 条相连道路。",
          "Starting with the first player, each player places 1 settlement and 1 connected road clockwise."
        ],
        [
          "第二轮摆放",
          "Second placement round",
          "按相反顺序，每人放 1 座城市和 1 条相连道路。",
          "In reverse order, each player places 1 city and 1 connected road."
        ],
        [
          "初始物资",
          "Starting cards",
          "初始城市的每块相邻生产地块各给 1 张普通资源，不给纸、布、币。",
          "Each producing hex adjacent to your starting city gives 1 normal resource, not paper, cloth or coins."
        ],
        [
          "强盗何时入场",
          "When the robber enters",
          "首次蛮族入侵前，强盗不在棋盘上；首次入侵时才放到沙漠。",
          "The robber stays off the board until the first barbarian attack, when it enters the desert."
        ]
      ]
    },
    {
      "key": "supply",
      "items": [
        [
          "每人的建筑和道路",
          "Buildings and roads per player",
          "最多使用 5 个村庄、4 座城市、15 条道路和 3 道城墙。",
          "Each player has 5 settlements, 4 cities, 15 roads and 3 walls."
        ],
        [
          "每人的骑士",
          "Knights per player",
          "一级、二级、三级骑士各有 2 名。晋升后也不能超过目标等级的棋子上限。",
          "Each player has 2 knights of each rank: 1, 2 and 3. Promotion must fit the supply of the new rank."
        ],
        [
          "银行物资",
          "Bank supply",
          "木材、砖块、羊毛、麦子、矿石各 19 张；纸、布、币各 12 张。",
          "The bank has 19 each of lumber, brick, wool, grain and ore; 12 each of paper, cloth and coins."
        ],
        [
          "建筑得分",
          "Building points",
          "村庄 1 分，城市 2 分，都会共 4 分（城市 2 分 + 都会额外 2 分）。",
          "A settlement scores 1 VP, a city 2 VP, and a metropolis 4 VP total: the city's 2 plus 2 bonus VP."
        ],
        [
          "与基础版的区别",
          "Changes from the base game",
          "保留最长道路奖励（2 分）；不使用最大骑士团奖励，也不使用基础版发展卡。",
          "Longest Road remains worth 2 VP. Largest Army and base-game development cards are not used."
        ]
      ]
    },
    {
      "key": "production",
      "items": [
        [
          "回合顺序",
          "Turn order",
          "先掷黄骰、红骰和事件骰；先结算事件，再按两颗数字骰之和生产或处理七点，最后交易、建造和使用进步卡。炼金术是掷骰前使用的例外。",
          "Roll the yellow, red and event dice. Resolve the event first, then production or seven using the two number dice, then trade, build and play progress cards. Alchemy is the exception played before rolling."
        ],
        [
          "事件骰的六个面",
          "The six event-die faces",
          "3 个面是蛮族船，合计概率 1/2；科学（绿）、贸易（黄）、政治（蓝）各占 1 个面，概率各 1/6。",
          "Three faces show the ship, for a total chance of 1/2. Science (green), Trade (yellow) and Politics (blue) each have one face, a 1/6 chance."
        ],
        [
          "哪些地块生产",
          "Which hexes produce",
          "数字与两颗数字骰之和相同、且没有强盗的地块生产。只有与该地块相邻的建筑领取物资。",
          "A hex produces when its number matches the two-dice total and it is not blocked by the robber. Only buildings next to that hex collect."
        ],
        [
          "城市领取商品",
          "Cities produce commodities",
          "森林每座城市领 1 木材 + 1 纸；牧场领 1 羊毛 + 1 布；山地领 1 矿石 + 1 币。都会按城市领取。",
          "Each city receives 1 lumber + 1 paper from a forest, 1 wool + 1 cloth from a pasture, or 1 ore + 1 coin from a mountain. Metropolises produce as cities."
        ],
        [
          "其他生产",
          "Other production",
          "麦田和丘陵每座城市仍领 2 张对应资源。村庄每次只领 1 张对应普通资源，不领商品。",
          "Cities still receive 2 grain from fields or 2 brick from hills. A settlement receives only 1 matching normal resource, never a commodity."
        ],
        [
          "资源和商品都算手牌",
          "Resources and commodities count together",
          "资源和商品都可以交易，也都可能被偷取或弃掉；进步卡单独计算。",
          "Resources and commodities can both be traded, stolen and discarded. Progress cards are counted separately."
        ]
      ]
    },
    {
      "key": "walls",
      "items": [
        [
          "怎样建城墙",
          "Building a wall",
          "自己的回合掷骰并结算后，花 2 砖块，为自己一座还没有城墙的城市建墙。每座城市最多 1 道，每人最多 3 道。",
          "After rolling and resolving events on your turn, pay 2 brick to build a wall around your city without one. At most 1 wall per city and 3 per player."
        ],
        [
          "城墙提高弃牌门槛",
          "Walls raise the discard threshold",
          "把资源和商品合起来数，不算进步卡。没有城墙时，掷出 7 后超过 7 张就要弃牌；1、2、3 道城墙分别把门槛提高到 9、11、13 张。",
          "Count resources and commodities together, excluding progress cards. On seven, discard if above 7 cards without walls. With 1, 2 or 3 walls, the threshold is 9, 11 or 13 cards."
        ],
        [
          "超过门槛要弃多少",
          "How many cards to discard",
          "弃掉整手资源和商品的一半，向下取整，不是只弃超出的部分。例如有 1 道城墙、10 张手牌，要弃 5 张；9 张则不用弃。",
          "Discard half of your whole resource-and-commodity hand, rounded down, not merely the excess. With 1 wall and 10 cards, discard 5; with 9 cards, discard none."
        ],
        [
          "城墙不能挡蛮族",
          "Walls do not defend against barbarians",
          "城墙不加分，也不增加骑士防守力。城市被蛮族降为村庄时，它的城墙也会失去。",
          "Walls score no VP and add no knight defense. If barbarians downgrade a city, its wall is also removed."
        ],
        [
          "首次入侵前的七点",
          "Seven before the first attack",
          "只按门槛弃牌，不移动强盗，也不偷牌。",
          "Only resolve discards; do not move the robber or steal."
        ],
        [
          "首次入侵后的七点",
          "Seven after the first attack",
          "先完成弃牌，再把强盗移到另一块地，选该地块旁一名有手牌的对手，随机偷 1 张资源或商品。",
          "Resolve discards, then move the robber to a different hex. Choose an adjacent opponent with cards and steal 1 random resource or commodity."
        ]
      ]
    },
    {
      "key": "improvements",
      "items": [
        [
          "三条改良路线",
          "Three improvement tracks",
          "用纸升级科学，用布升级贸易，用币升级政治。提升的是整条路线，不是单独某座城市。",
          "Spend paper on Science, cloth on Trade and coins on Politics. Improve the whole track, not an individual city."
        ],
        [
          "升级条件和费用",
          "Requirements and costs",
          "自己的回合掷骰并结算后，至少有 1 座城市才能升级。每次升 1 级，最高 5 级；升到 1、2、3、4、5 级，通常分别付 1、2、3、4、5 张对应商品。",
          "After rolling and resolving events on your turn, you may upgrade if you own a city. Buy one level at a time, up to level 5. Reaching levels 1, 2, 3, 4 and 5 normally costs 1, 2, 3, 4 and 5 matching commodities."
        ],
        [
          "改良等级决定抽牌范围",
          "Levels determine eligible red-die results",
          "任何人掷出对应颜色的事件骰时，按下表检查自己的该项改良。符合红骰点数就抽 1 张该类进步卡；黄骰和数字骰总和不影响抽牌。",
          "Whenever anyone rolls the matching event color, check your level against the table below. An eligible red die gives 1 progress card of that category; the yellow die and total do not affect the draw.",
          true
        ],
        [
          "科学三级：水渠",
          "Science level 3: Aqueduct",
          "两颗数字骰之和不是 7，而且这次生产中你一张资源或商品都没领到时，从银行任选 1 张有库存的普通资源。不能选纸、布、币。",
          "If the dice total is not 7 and production gives you no resources or commodities at all, choose 1 available normal resource from the bank. You cannot choose paper, cloth or coins."
        ],
        [
          "贸易三级：商品 2:1",
          "Trade level 3: commodities at 2:1",
          "用 2 张相同商品换 1 张其他资源或商品。例如 2 张纸换 1 张麦子；纸和布不能混着凑。普通资源不会因此变成 2:1。",
          "Trade 2 identical commodities for 1 other resource or commodity. For example, 2 paper for 1 grain; paper and cloth cannot be combined. Normal resources do not gain this 2:1 rate."
        ],
        [
          "政治三级：解锁三级骑士",
          "Politics level 3: unlock rank-3 knights",
          "政治改良先达到 3 级，才能把二级骑士晋升为三级。不会自动升级；仍需 1 羊毛 + 1 矿石，每名骑士每回合最多晋升一次，不要求先激活。",
          "Politics must reach level 3 before a rank-2 knight can be promoted to rank 3. It is not automatic: pay 1 wool + 1 ore, at most once per knight per turn. Activation is not required."
        ],
        [
          "四级：获得都会",
          "Level 4: claim a metropolis",
          "科学、贸易、政治各有 1 个都会标记。本路线第一个升到 4 级的人，把标记放在自己一座没有都会标记的城市上，额外得 2 分；后来达到相同等级不能夺走它。",
          "Each branch has one metropolis marker. The first player to level 4 in that branch places it on an owned city without another marker for 2 extra VP. Later players at the same level cannot take it."
        ],
        [
          "都会带来什么",
          "Metropolis benefits",
          "这座城市共值 4 分，生产数量不变，不能被蛮族降级；但仍计入蛮族强度。",
          "The city is worth 4 VP total, produces the same amount, and cannot be downgraded by barbarians. It still counts toward barbarian strength."
        ],
        [
          "五级：夺取或保住都会",
          "Level 5: take or secure a metropolis",
          "若原主人还在 4 级，你先升到 5 级，就拿走标记和额外 2 分，放到自己的城市；原来的城市仍归对方。若你已拥有都会，先升到 5 级就能保住它，别人之后到 5 级也拿不走；不会再额外加 2 分。",
          "If its owner is still at level 4, reach level 5 first to move the marker and its 2 bonus VP to your own city; their original city stays theirs. If you own it, reaching level 5 secures it against later level-5 rivals, without adding another 2 VP."
        ],
        [
          "城市和高等级的限制",
          "City and higher-level restrictions",
          "四级、五级保留三级能力。失去城市不会降低已有改良，但没有城市就不能继续升级。若你没有该路线的都会，升到 4 或 5 级还需要一座没有都会标记的城市，即使这次拿不到都会也一样。",
          "Levels 4 and 5 retain the level-3 ability. Losing cities does not lower improvements, but you cannot upgrade without a city. If you do not own that branch's metropolis, reaching level 4 or 5 requires a city without a marker, even when no metropolis will be gained."
        ]
      ]
    },
    {
      "key": "knight",
      "items": [
        [
          "骑士有什么用",
          "What knights do",
          "已激活的一级、二级、三级骑士分别提供 1、2、3 点防守力。骑士不生产资源，也不直接加分。",
          "Active rank-1, rank-2 and rank-3 knights provide 1, 2 and 3 defense strength respectively. Knights produce no resources and score no VP themselves."
        ],
        [
          "招募一级骑士",
          "Recruiting a rank-1 knight",
          "花 1 羊毛 + 1 矿石，放在连接自己道路的空交叉点。骑士不受村庄间距限制；刚招募时未激活。",
          "Pay 1 wool + 1 ore and place it on an empty intersection touching your road. Settlement distance rules do not apply. A newly recruited knight is inactive."
        ],
        [
          "晋升费用与次数",
          "Promotion cost and limit",
          "每次花 1 羊毛 + 1 矿石，只升 1 级。每名骑士每回合最多晋升一次；晋升不要求先激活，并保留原来的激活状态。",
          "Pay 1 wool + 1 ore to raise a knight by 1 rank. Each knight may be promoted at most once per turn. It need not be active, and promotion preserves its active or inactive state."
        ],
        [
          "升到三级的条件",
          "Requirement for rank 3",
          "一级升二级不要求政治改良；二级升三级必须先把政治改良升到 3 级。每人每个等级最多 2 名骑士，目标等级的棋子用完就不能晋升。",
          "Rank 1 to 2 needs no Politics improvement; rank 2 to 3 requires Politics level 3 first. Each player has at most 2 knights of each rank, so the target rank must have a piece available."
        ],
        [
          "激活和等待",
          "Activation and waiting",
          "花 1 麦子激活一名骑士。新激活的骑士立刻能抵御蛮族，但要等下一个自己的回合才能移动、驱逐骑士或驱赶强盗。",
          "Pay 1 grain to activate a knight. It can defend against barbarians immediately, but must wait until your next turn to move, displace a knight or chase the robber."
        ],
        [
          "移动路线",
          "Movement route",
          "可沿自己连续相连的道路移动到空交叉点，一次可走多段。不能借用别人的路线，也不能穿过对手的建筑或骑士。",
          "Move along your connected roads to an empty intersection, across any number of segments. You cannot use another player's routes or pass through an opponent's building or knight."
        ],
        [
          "能驱逐几级骑士",
          "Which ranks you can displace",
          "你的骑士必须比对方等级高：2 级可驱逐 1 级；3 级可驱逐 1 级或 2 级；1 级不能驱逐任何骑士。同级不能驱逐，也不能驱逐自己的骑士。对方是否激活都不影响。",
          "Your rank must be higher: rank 2 can displace rank 1; rank 3 can displace rank 1 or 2; rank 1 cannot displace any knight. Equal ranks and your own knights cannot be displaced. The opponent may be active or inactive."
        ],
        [
          "在游戏里怎么驱逐",
          "How to displace in this game",
          "自己的回合掷骰及事件结算后，点「移动骑士」，先点一名本回合开始前已激活的己方骑士，再点高亮的低等级对手骑士。你的骑士会移到对方的位置，不用掷骰，也不额外花资源。",
          "After rolling and resolving events on your turn, select Move knight, select your knight that was active before this turn, then select a highlighted lower-rank opponent's knight. Your knight takes its place, with no dice roll or extra resource cost."
        ],
        [
          "驱赶强盗",
          "Chasing the robber",
          "首次蛮族入侵后，若强盗在骑士旁的地块，可把强盗移到别处，再从新地块旁一名对手随机偷 1 张资源或商品。",
          "After the first barbarian attack, a knight next to the robber may move it elsewhere and steal 1 random resource or commodity from an opponent beside the new hex."
        ],
        [
          "行动后需要重新激活",
          "After acting",
          "移动、驱逐或驱赶强盗后，该骑士变为未激活。可再花 1 麦子激活，让它防守，但这个回合不能再次行动。",
          "Moving, displacing or chasing the robber deactivates the knight. You may pay 1 grain to reactivate it for defense, but it cannot act again that turn."
        ],
        [
          "被驱逐后怎么放",
          "Relocating a displaced knight",
          "由被驱逐骑士的主人，从原位置沿自己的道路选择一个可到达的空交叉点。等级和激活状态不变；迁移时不能再驱逐别人的骑士。没有可到达的空位，就从棋盘移除并收回这名骑士。",
          "Its owner chooses an empty intersection reachable from the original location along their own roads. Its rank and active state stay the same; this relocation cannot displace another knight. With no reachable empty site, remove it from the board and return it to supply."
        ],
        [
          "骑士会挡住对手的路",
          "Blocking an opponent's road",
          "不管是否激活，对手的道路都不能穿过你的骑士所在交叉点继续延伸；对手的最长道路也会在这里被断开。骑士不挡自己的道路。",
          "Active or inactive, your knight stops opponents from extending roads through its intersection and splits their Longest Road. It does not block your own roads."
        ],
        [
          "可以从另一侧修到骑士旁",
          "Approaching from the other side",
          "对手只有从另一端已经连接自己的道路或建筑时，才能把新路修到骑士旁。仍不能穿过去，也不能跳过骑士凭空新起一段路。",
          "An opponent may build toward the knight only if the road's other end already connects to their own road or building. They still cannot pass through it or begin a disconnected road beyond it."
        ],
        [
          "骑士和建筑不能占同一点",
          "Knights cannot share a building site",
          "一个交叉点只能放一名骑士或一座建筑，即使都是自己的也不能重叠。想在那里建村庄，要先合法移走骑士，再满足道路连接和村庄间距要求；未激活的骑士要先激活，等下一个自己的回合才能移走。",
          "An intersection can hold one knight or one building, even for the same owner. To build a settlement there, first move the knight legally, then meet road and distance rules. An inactive knight must be activated and wait until your next turn to move."
        ]
      ]
    },
    {
      "key": "barbarians",
      "items": [
        [
          "什么时候前进",
          "When the ship advances",
          "无论谁掷骰，事件骰出现蛮族船，船就前进 1 格。出现其他图案时不前进。",
          "Whenever anyone rolls the ship on the event die, the fleet advances 1 space. Other faces do not advance it."
        ],
        [
          "什么时候入侵",
          "When the attack happens",
          "船从起点累计前进 7 格就入侵。界面显示的“还差几格”是还要出现几次船，不是还剩几个回合。",
          "The fleet attacks after advancing 7 spaces from the start. The displayed spaces remaining mean that many ship results, not that many turns."
        ],
        [
          "蛮族有多强",
          "Barbarian strength",
          "数全岛的城市总数，都会也算，每座算 1 点。村庄不计入蛮族强度。",
          "Count all cities on the island, including metropolises, at 1 strength each. Settlements do not count."
        ],
        [
          "我们有多少防守力",
          "Total defense strength",
          "把所有玩家已激活骑士的等级相加。一级算 1 点、二级算 2 点、三级算 3 点；未激活骑士不出力。",
          "Add the ranks of every player's active knights: rank 1 gives 1, rank 2 gives 2 and rank 3 gives 3. Inactive knights contribute nothing."
        ],
        [
          "怎样算防守成功",
          "Winning the defense",
          "总防守力大于或等于蛮族强度，就守住了；低于蛮族强度则失败。例如有 5 座城市，总防守力达到 5 就成功。",
          "Defense succeeds if total defense is at least barbarian strength; otherwise it fails. For example, with 5 cities, defense strength 5 is enough."
        ],
        [
          "成功：谁获得 1 分",
          "Success: who earns 1 VP",
          "比较每位玩家自己提供的防守力。只有一人贡献最高时，该玩家获得“保卫卡坦”奖励 1 分；每次入侵都可再获奖，分数会累积。",
          "Compare each player's own defense contribution. A sole highest contributor earns 1 Defender of Catan VP. This can be earned again on later attacks and the points accumulate."
        ],
        [
          "成功：最高贡献并列",
          "Success: tied highest contributors",
          "并列最高的每人各选科学、贸易或政治一类，从有牌的对应牌堆抽 1 张进步卡；这次不获得保卫卡坦分数。",
          "Each tied highest contributor chooses Science, Trade or Politics and draws 1 card from an available deck. They do not earn Defender of Catan VP for this attack."
        ],
        [
          "失败：哪些人失去城市",
          "Failure: who loses a city",
          "只在至少有一座普通城市（不是都会）的玩家中比较防守贡献。贡献最少者各选自己一座普通城市降为村庄；若最低并列，这些人每人都降 1 座。",
          "Compare contributions only among players with at least one ordinary city, meaning a non-metropolis city. Each lowest contributor downgrades one of their ordinary cities. If tied for lowest, each tied player loses one."
        ],
        [
          "降级后会怎样",
          "What downgrading changes",
          "该城变成村庄，城墙也失去。都会不会被降级。若村庄棋子已用完，用倒放的城市棋子表示这个村庄；之后升级城市时，必须优先重建它。",
          "The city becomes a settlement and loses its wall. Metropolises cannot be downgraded. If no settlement piece is left, a city on its side represents the settlement; it must be rebuilt before upgrading another settlement to a city."
        ],
        [
          "入侵结算后",
          "After the attack",
          "无论成功或失败，所有骑士都变为未激活，船回起点。首次入侵还会把强盗放到沙漠。完成奖励或降级选择后，才结算本次数字骰的生产或七点。",
          "Win or lose, all knights deactivate and the ship returns to the start. The first attack also puts the robber in the desert. Finish reward or downgrade choices before resolving production or seven from this roll."
        ]
      ]
    },
    {
      "key": "progress",
      "items": [
        [
          "三类牌",
          "Three categories",
          "科学、贸易、政治各有 18 张进步卡。",
          "Science, Trade and Politics each have 18 progress cards."
        ],
        [
          "抽牌条件",
          "When to draw",
          "任何人掷出对应颜色的事件骰时，检查自己的该项改良等级和红骰点数，具体对应见下表。符合条件的玩家各抽 1 张，从当前玩家开始顺时针结算。",
          "Whenever anyone rolls a matching event color, check your level and the red die against the table below. Each eligible player draws 1 card, clockwise from the current player.",
          true
        ],
        [
          "加分卡自动生效",
          "VP cards score automatically",
          "印刷术和宪法抽到后立即公开，各加 1 分；不用手动使用，也不计入进步卡手牌上限。",
          "Printing and Constitution reveal immediately when drawn for 1 VP each. They require no play action and do not count toward the progress-card hand limit."
        ],
        [
          "最多保留几张",
          "Hand limit",
          "其他进步卡最多保留 4 张。别人的回合拿到第 5 张要立即弃掉 1 张；自己的回合可先使用，但结束回合前必须减到最多 4 张。",
          "Keep at most 4 other progress cards. If you get a fifth on another player's turn, discard one immediately. On your own turn you may play cards first, but must end with at most 4."
        ],
        [
          "什么时候能使用",
          "When cards can be played",
          "需要手动使用的进步卡，新抽到也能当回合使用。除炼金术外，在自己的回合掷骰并完成结算后使用，可以连续使用多张；炼金术只能在自己掷骰前使用。",
          "Progress cards played manually can be used on the turn they are drawn. Except for Alchemy, play them on your own turn after rolling and resolving the roll, with no one-card-per-turn limit. Alchemy is only played before your roll."
        ],
        [
          "用过或弃掉之后",
          "After playing or discarding",
          "放回对应类别的牌堆底，不重新洗牌。进步卡不能交易，也不会被强盗偷走。",
          "Return played or discarded cards to the bottom of their category's deck without shuffling. Progress cards cannot be traded or stolen by the robber."
        ]
      ]
    },
    {
      "key": "shortages",
      "items": [
        [
          "同一种物资不够发",
          "When the bank runs short",
          "生产时，如果同一种物资有多名玩家领取，而银行不够全部发出，这一种就谁都不发。其他库存足够的种类照常发放。",
          "During production, if several players claim the same item and the bank cannot supply all of it, no one receives that item. Other sufficiently stocked items are distributed normally."
        ],
        [
          "只有一人领取的情况",
          "When there is only one claimant",
          "如果只有一名玩家领取某种物资，就把银行剩下的该种物资给他，最多给到本应领取的数量。",
          "If only one player claims an item, give that player the remaining supply, up to their normal entitlement."
        ],
        [
          "水渠看实际领到的牌",
          "Aqueduct uses actual receipts",
          "科学达到 3 级后，是否能用水渠取决于这次生产实际有没有领到资源或商品，不看原本应该领多少。",
          "At Science level 3, Aqueduct depends on whether you actually received any resources or commodities, not what you were entitled to."
        ],
        [
          "商品的银行和港口汇率",
          "Trading commodities",
          "纸、布、币可按银行 4:1 或通用港口 3:1 兑换。木材等普通资源的专用 2:1 港口不适用于商品。",
          "Paper, cloth and coins can use bank 4:1 and generic harbor 3:1 trades. A specialized 2:1 harbor for a normal resource does not apply to commodities."
        ],
        [
          "额外得分计入总分",
          "Bonus points count toward victory",
          "控制商人得 1 分；保卫卡坦奖励和公开加分卡也计入总分。这些分数已显示在总分里，不要重复加。",
          "Controlling the Merchant gives 1 VP; Defender of Catan awards and revealed VP cards also count. These are already included in the displayed total and should not be added again."
        ]
      ]
    }
  ];
  ruleSections.forEach((section, index) => { section.title = rules[index][0]; });
  const cardDetails = {
    "alchemy": [
      [
        "使用时机",
        "When to play",
        "只能在自己的回合、尚未掷骰时使用。",
        "Only play before rolling the dice on your own turn."
      ],
      [
        "选择点数",
        "Choose the numbers",
        "分别指定黄骰和红骰的点数，每颗都可选 1–6；之后掷骰时直接使用这两个点数。",
        "Choose a number from 1 to 6 for each of the yellow and red dice. Your roll then uses those two numbers."
      ],
      [
        "事件骰仍随机",
        "The event die stays random",
        "不能指定蛮族船或城堡颜色。红骰仍用于判断进步卡抽牌，两颗数字骰之和仍用于生产或七点。",
        "You cannot choose the ship or castle color. The red die still determines progress-card eligibility, and the two-dice total still determines production or seven."
      ]
    ],
    "crane": [
      [
        "减免多少",
        "Discount",
        "本回合下一次城市改良少付 1 张对应商品。例如政治 2 级升 3 级，由 3 币减为 2 币；0 级升 1 级可免费。",
        "Your next city improvement this turn costs 1 fewer matching commodity. For example, Politics 2 to 3 costs 2 coins instead of 3; level 0 to 1 can be free."
      ],
      [
        "次数和期限",
        "Uses and duration",
        "一张卡只减免一次升级，回合结束后未用的减免失效。即使打出两张，也不能让同一次升级减 2 张商品；要分两次升级使用。",
        "One card discounts one upgrade; unused discounts expire at turn end. Even with two cards, one upgrade cannot receive a 2-commodity discount; use them on separate upgrades."
      ],
      [
        "其他条件照常",
        "Other requirements still apply",
        "仍需要城市，并满足目标等级和都会位置等升级条件。",
        "You still need a city and must meet the target-level and metropolis-site requirements."
      ]
    ],
    "engineering": [
      [
        "免费建墙",
        "Build for free",
        "选择自己一座没有城墙的城市，免费建 1 道城墙，不用付通常的 2 砖块。",
        "Choose your city without a wall and build 1 wall for free, instead of paying the usual 2 brick."
      ],
      [
        "数量限制",
        "Wall limits",
        "每座城市最多 1 道城墙，每人最多 3 道。没有符合条件的城市时不能使用。",
        "At most 1 wall per city and 3 per player. You cannot play it without an eligible city."
      ],
      [
        "得到什么",
        "Benefit",
        "这道城墙把掷七时的弃牌门槛提高 2 张；不增加分数或蛮族防守力。",
        "The wall raises your discard threshold on seven by 2 cards. It adds no VP or defense against barbarians."
      ]
    ],
    "invention": [
      [
        "交换什么",
        "What to swap",
        "依次选择两块不同地块，交换它们的数字标记；地块类型和建筑位置不变。",
        "Choose two different hexes and swap their number discs. Terrain and buildings stay in place."
      ],
      [
        "哪些数字不能选",
        "Excluded numbers",
        "不能移动 2、6、8、12，也不能选择没有数字的地块。可选数字为 3、4、5、9、10、11。",
        "Do not move 2, 6, 8 or 12, or choose a hex without a number. Eligible numbers are 3, 4, 5, 9, 10 and 11."
      ]
    ],
    "irrigation": [
      [
        "能领多少",
        "How much to collect",
        "每块邻接自己村庄或城市的麦田，给你 2 张麦子。都会也算城市。",
        "Take 2 grain for each field next to your settlement or city. Metropolises also count as cities."
      ],
      [
        "按地块数，不按建筑数",
        "Count hexes, not buildings",
        "同一块麦田旁有你多个建筑，也只算 1 块。例如邻接 2 块不同麦田，共领 4 麦子。",
        "Count a field once even if several of your buildings touch it. For example, 2 distinct adjacent fields give 4 grain."
      ],
      [
        "不用等生产",
        "No production roll needed",
        "不要求掷中麦田数字，强盗也不影响这张卡的领取。银行不够时，只领取剩余的麦子。",
        "The dice need not match the field numbers, and the robber does not block this card's collection. If the bank runs short, take only its remaining grain."
      ]
    ],
    "medicine": [
      [
        "优惠费用",
        "Reduced cost",
        "本回合下一次把村庄升级为城市，只需 1 麦子 + 2 矿石，原价是 2 麦子 + 3 矿石。",
        "Your next settlement-to-city upgrade this turn costs only 1 grain + 2 ore, instead of 2 grain + 3 ore."
      ],
      [
        "次数和限制",
        "Uses and limits",
        "一张卡优惠一次，回合结束后未使用的优惠失效。仍要有可升级的自己的村庄和可用城市棋子；优惠不能叠加到同一次升级。",
        "One card discounts one upgrade, expiring at turn end if unused. You still need an eligible settlement and an available city piece. Discounts do not stack on one upgrade."
      ]
    ],
    "mining": [
      [
        "能领多少",
        "How much to collect",
        "每块邻接自己村庄或城市的山地，给你 2 张矿石。都会也算城市。",
        "Take 2 ore for each mountain next to your settlement or city. Metropolises also count as cities."
      ],
      [
        "按地块数，不按建筑数",
        "Count hexes, not buildings",
        "同一块山地旁有你多个建筑，也只算 1 块。例如邻接 2 块不同山地，共领 4 矿石。",
        "Count a mountain once even if several of your buildings touch it. For example, 2 distinct adjacent mountains give 4 ore."
      ],
      [
        "不用等生产",
        "No production roll needed",
        "不要求掷中山地数字，强盗也不影响这张卡的领取。银行不够时，只领取剩余的矿石。",
        "The dice need not match the mountain numbers, and the robber does not block this card's collection. If the bank runs short, take only its remaining ore."
      ]
    ],
    "printing": [
      [
        "立即加分",
        "Immediate point",
        "抽到后立即公开，获得 1 分，不需要点击使用。",
        "Reveal immediately when drawn and gain 1 VP. No play action is needed."
      ],
      [
        "不占进步卡手牌",
        "Outside the hand limit",
        "这张公开卡不计入最多 4 张的进步卡手牌上限。",
        "This revealed card does not count toward the 4-card progress hand limit."
      ]
    ],
    "roads": [
      [
        "免费道路",
        "Free roads",
        "免费修最多 2 条道路，不用支付木材和砖块。若修完第一条后已没有合法位置或剩余棋子，就只修 1 条。",
        "Build up to 2 roads without paying lumber or brick. If no legal site or road piece remains after the first, build only one."
      ],
      [
        "照常满足修路规则",
        "Normal placement rules apply",
        "每条路都必须合法连接自己的道路或建筑，也要有剩余道路棋子。每人最多 15 条。",
        "Each road must legally connect to your road or building, and you need an unused road piece. Each player has at most 15 roads."
      ]
    ],
    "smithing": [
      [
        "免费晋升",
        "Free promotions",
        "选择最多 2 名不同的自己的骑士，各免费升 1 级，不用支付羊毛和矿石；可以提前点“完成”。",
        "Choose up to 2 different knights of your own and promote each by 1 rank without paying wool or ore. You may choose Done early."
      ],
      [
        "不能跳过晋升限制",
        "Promotion limits still apply",
        "每名骑士每回合最多晋升一次，不能用此卡再升本回合已晋升的骑士。目标等级还必须有空余棋子，每级最多 2 名。",
        "Each knight may be promoted at most once per turn, so this cannot promote one already promoted this turn. The new rank must have a piece available, with at most 2 knights per rank."
      ],
      [
        "升三级仍要政治三级",
        "Rank 3 still requires Politics 3",
        "二级升三级前，政治改良必须已达到 3 级。晋升不要求先激活，并保留原激活状态。",
        "Promoting rank 2 to rank 3 still requires Politics level 3. The knight need not be active, and its active state is preserved."
      ]
    ],
    "harbor": [
      [
        "怎么交换",
        "How the exchange works",
        "本回合向对手提供你选的 1 张普通资源，换对方选择的 1 张商品（纸、布或币）。普通资源不能用商品替代。",
        "This turn, offer 1 normal resource of your choice for 1 commodity of the opponent's choice: paper, cloth or coin. Your offered card must be a normal resource."
      ],
      [
        "本张卡：每名对手一次",
        "Once per opponent for this card",
        "每打出 1 张「商业港」，你可在自己的当前回合内，向每名对手各发起最多 1 次交换。次数按本次出牌计算，不是整局每人只能一次。",
        "Each Commercial Harbor you play lets you offer at most one exchange to each opponent during your current turn. This limit applies to this card, not once per opponent for the whole game."
      ],
      [
        "对方是否必须交换",
        "Must the opponent exchange?",
        "对方有商品，就必须选择 1 张给你；没有商品则不交换，你也不支付资源。",
        "If the opponent has a commodity, they must choose one to give you. If they have none, no exchange occurs and you keep your offered resource."
      ],
      [
        "回合结束失效",
        "Expires at turn end",
        "这张卡的交换机会在你的当前回合结束时全部失效。之后想再交换，必须再次打出「商业港」；不会每回合自动获得交换机会。",
        "All exchanges granted by this card expire at the end of your current turn. To exchange again later, you must play another Commercial Harbor; new turns do not automatically grant exchanges."
      ]
    ],
    "guild": [
      [
        "选择目标",
        "Choose a target",
        "选择一名分数比你高、且至少有 1 张资源或商品的对手。分数相同不能选。",
        "Choose an opponent with a higher score and at least 1 resource or commodity. A tied score does not qualify."
      ],
      [
        "查看并拿牌",
        "Inspect and take cards",
        "查看对方的资源和商品，由你选择拿走共 2 张；若对方只有 1 张，就只拿 1 张。进步卡不能拿。",
        "Inspect their resources and commodities and choose a total of 2 cards to take, or only 1 if that is all they have. You cannot take progress cards."
      ]
    ],
    "merchant": [
      [
        "放在哪里",
        "Where to place it",
        "选择一块与自己村庄或城市相邻的资源地块，把商人移到那里并取得控制权；不能放沙漠。",
        "Choose a resource hex next to your settlement or city, move the Merchant there and take control. It cannot go on the desert."
      ],
      [
        "获得的好处",
        "Benefits",
        "控制者得 1 分，并可用该地块对应的 2 张普通资源换银行 1 张其他资源或商品。例如放森林，就可用 2 木材兑换。",
        "The controller gains 1 VP and may trade 2 of that hex's normal resource for 1 other resource or commodity from the bank. On a forest, for example, trade 2 lumber."
      ],
      [
        "别人可以夺走",
        "Another player can take it",
        "其他玩家打出商人卡后，可以把商人移走并取得控制权；原主人失去这 1 分和该 2:1 兑换能力。反复使用不会叠加商人分数。",
        "Another player's Merchant card can move it and take control. The former owner loses the 1 VP and that 2:1 rate. Repeated plays do not stack Merchant points."
      ]
    ],
    "fleet": [
      [
        "选择一种物资",
        "Choose an item",
        "从木材、砖块、羊毛、麦子、矿石、纸、布、币中选一种。",
        "Choose one of lumber, brick, wool, grain, ore, paper, cloth or coins."
      ],
      [
        "本回合按 2:1 兑换",
        "Trade at 2:1 this turn",
        "本回合可多次用 2 张所选物资，换银行 1 张其他资源或商品；银行要有库存。回合结束后该优惠失效。",
        "For the rest of this turn, repeatedly trade 2 of the chosen item for 1 other available resource or commodity from the bank. The rate expires at turn end."
      ]
    ],
    "monopoly": [
      [
        "选择普通资源",
        "Choose a normal resource",
        "指定木材、砖块、羊毛、麦子或矿石中的一种，不能选纸、布、币。",
        "Name lumber, brick, wool, grain or ore. Paper, cloth and coins cannot be chosen."
      ],
      [
        "每名对手交多少",
        "What each opponent gives",
        "每名对手最多交给你 2 张该资源：有 1 张就交 1 张，有 2 张或更多就交 2 张，没有则不交。",
        "Each opponent gives you up to 2 of that resource: 1 if they have one, 2 if they have two or more, and none if they have none."
      ]
    ],
    "tradeMonopoly": [
      [
        "选择商品",
        "Choose a commodity",
        "指定纸、布、币中的一种，不能选普通资源。",
        "Name paper, cloth or coins, not a normal resource."
      ],
      [
        "每名对手交多少",
        "What each opponent gives",
        "每名对手有这种商品就给你 1 张；没有则不交，即使有多张也只交 1 张。",
        "Each opponent with that commodity gives you 1 card. Those with none give nothing; even those with several give only one."
      ]
    ],
    "diplomacy": [
      [
        "什么道路可选",
        "Which roads qualify",
        "选择一条“开放道路”：至少一端没有连接该道路主人自己的其他道路、建筑或骑士。可以选自己的，也可以选对手的。",
        "Choose an open road: at least one end touches none of its owner's other roads, buildings or knights. It may belong to you or an opponent."
      ],
      [
        "移除对手的道路",
        "Removing an opponent's road",
        "收回那条道路，对手不能因此免费另建一条。",
        "Return that road to its owner's supply. They do not get a free replacement road."
      ],
      [
        "移除自己的道路",
        "Removing your own road",
        "可立即免费在合法位置另建 1 条道路，完成后才重新计算最长道路。",
        "You may immediately rebuild 1 road for free at a legal site. Longest Road is recalculated after the replacement is finished."
      ],
      [
        "不能让骑士断开道路",
        "Do not strand a knight",
        "如果移除这条路会让任何骑士失去自己的道路连接，就不能选它。",
        "You cannot choose a road whose removal would leave any knight without its own road connection."
      ]
    ],
    "espionage": [
      [
        "选择对手",
        "Choose an opponent",
        "选择一名至少有 1 张未公开进步卡的对手。",
        "Choose an opponent holding at least 1 unrevealed progress card."
      ],
      [
        "看牌并拿走一张",
        "Inspect and take one",
        "查看对方持有的进步卡，由你选择 1 张加入自己的手牌。已公开的印刷术、宪法不能拿。",
        "Inspect their progress-card hand and choose 1 to add to yours. Revealed Printing or Constitution cards cannot be taken."
      ]
    ],
    "encouragement": [
      [
        "免费激活",
        "Activate for free",
        "把自己所有未激活的骑士全部激活，不用支付麦子。原本已激活的骑士保持原状。",
        "Activate all your inactive knights without paying grain. Knights already active remain as they were."
      ],
      [
        "防守和行动的区别",
        "Defense versus actions",
        "新激活的骑士立刻能抵御蛮族，但本回合不能移动、驱逐骑士或驱赶强盗，要等下一个自己的回合。",
        "Newly activated knights can defend immediately, but must wait until your next turn to move, displace a knight or chase the robber."
      ]
    ],
    "intrigue": [
      [
        "选择要驱逐的骑士",
        "Choose a knight to displace",
        "选一名位于自己道路端点的对手骑士。不比较等级，也不需要你派自己的骑士过去。",
        "Choose an opponent's knight touching your road. Ranks do not matter, and you need not send a knight of your own."
      ],
      [
        "由对方重新放置",
        "Its owner relocates it",
        "对方沿自己的道路选择可到达的空交叉点，保留骑士原来的激活状态；没有合法位置就收回该骑士。",
        "Its owner selects a reachable empty intersection along their roads, preserving the knight's active state. With no legal site, the knight returns to supply."
      ]
    ],
    "taxation": [
      [
        "使用条件",
        "Requirement",
        "只能在首次蛮族入侵之后使用。",
        "Only playable after the first barbarian attack."
      ],
      [
        "移动强盗",
        "Move the robber",
        "把强盗移到另一个地块，不能留在原地。",
        "Move the robber to a different hex; it cannot stay where it is."
      ],
      [
        "从每名邻接对手偷一张",
        "Steal once from each adjacent opponent",
        "新地块旁每名有手牌的对手，都被随机偷 1 张资源或商品。同一对手即使有多个建筑邻接，也只偷 1 张；没有手牌就跳过。",
        "Steal 1 random resource or commodity from every opponent with cards beside the new hex. Multiple buildings belonging to the same opponent still yield only one card. Skip opponents with no cards."
      ]
    ],
    "constitution": [
      [
        "立即加分",
        "Immediate point",
        "抽到后立即公开，获得 1 分，不需要点击使用。",
        "Reveal immediately when drawn and gain 1 VP. No play action is needed."
      ],
      [
        "不占进步卡手牌",
        "Outside the hand limit",
        "这张公开卡不计入最多 4 张的进步卡手牌上限。",
        "This revealed card does not count toward the 4-card progress hand limit."
      ]
    ],
    "treason": [
      [
        "由对手移除骑士",
        "The opponent removes a knight",
        "选择一名有骑士的对手，由对方决定移除自己的哪一名骑士。",
        "Choose an opponent with a knight; that opponent chooses which of their knights to remove."
      ],
      [
        "你获得替代骑士",
        "Place your replacement knight",
        "你可免费选择同级或更低等级的骑士，放在连接自己道路的空交叉点。必须有对应等级的空余棋子。",
        "You may place a knight of equal or lower rank for free on an empty intersection touching your road. A piece of the chosen rank must be available."
      ],
      [
        "保留状态，三级例外",
        "Keep its state; rank-3 exception",
        "新骑士保持被移除骑士的激活或未激活状态。这张卡放置三级骑士时，不要求政治改良达到 3 级。",
        "Your new knight keeps the removed knight's active or inactive state. Placing a rank-3 knight with this card does not require Politics level 3."
      ]
    ],
    "wedding": [
      [
        "谁要给牌",
        "Who gives cards",
        "每名分数比你高的对手都要给牌；分数与你相同或更低的人不用给。",
        "Every opponent with a higher score gives you cards. Opponents with an equal or lower score give nothing."
      ],
      [
        "由对方选择",
        "The opponent chooses",
        "每人自行选择共 2 张资源或商品给你；不足 2 张就全给。不能给进步卡。",
        "Each chooses a total of 2 resources or commodities to give you, or all they have if fewer than two. Progress cards cannot be given."
      ]
    ],
    "sabotage": [
      [
        "谁要弃牌",
        "Who discards",
        "每名分数不低于你的对手都要弃牌，分数相同也包括在内。",
        "Every opponent with a score at least as high as yours discards, including tied scores."
      ],
      [
        "弃多少",
        "How many to discard",
        "由对方从自己的资源和商品中选择，弃掉总张数的一半，向下取整。例如 9 张弃 4 张。进步卡不计入，也不能用来弃。",
        "Each opponent chooses half their combined resources and commodities to discard, rounded down. For example, 9 cards means discarding 4. Progress cards neither count nor may be discarded for this effect."
      ],
      [
        "城墙不能减免",
        "Walls do not help",
        "不看掷七时的手牌门槛；即使有城墙或手牌不多，也照样按一半计算。",
        "Ignore the hand threshold used on seven. Having walls or a small hand does not reduce the half-hand calculation."
      ]
    ]
  };
  const combinedRules = [
    ["官方允许把城市与骑士和航海家组合游玩。本模式提供官方明确推荐的「扬帆出海 1／2」和「穿越荒漠 1／2」，供 3–4 人选择相应布局。", "CATAN officially supports combining Cities & Knights with Seafarers. This mode offers the explicitly recommended New Shores 1/2 and Through the Desert 1/2 layouts for three or four players."],
    ["地图选择：官方不推荐未知海域这类探索隐藏区域的地图，也不推荐四岛群岛这类分散在许多小岛上的地图，因为蛮族威胁会明显加重。本模式的四张地图是已支持的范围，不表示官方禁止所有其他地图。", "Map choice: hidden-area exploration such as Fog Islands and scattered-island maps such as Four Islands are not recommended because they amplify the barbarian threat. The four supported layouts are this mode's scope, not a claim that all other maps are officially forbidden."],
    ["胜利目标：在原航海家地图目标上加 2 分。这四张地图原为 14 分，组合模式均为 16 分；必须在自己的回合达到目标。", "Victory: add 2 VP to the Seafarers scenario's target. These four layouts normally require 14 VP, so the combined mode requires 16 VP on your own turn."],
    ["初始放置：依座位顺序各放 1 个村庄，再按相反顺序各放 1 座城市；每次放建筑后，再放 1 条道路或 1 艘船。建筑须位于地图允许的起始区域，船须放在海岸或海洋边。", "Setup: place one settlement each in seat order, then one city each in reverse order. Add one road or ship after each building. Use the map's permitted starting area; ships must lie on coastal or sea edges."],
    ["初始物资：只按初始城市相邻的产资源地块各领 1 张普通资源，不翻倍，也不领纸、布、币。之后正常生产时，城市才按城市与骑士规则领取资源和商品。", "Starting cards: take one normal resource per producing hex beside your starting city, with no doubling and no commodities. Later production uses the usual Cities & Knights resource-and-commodity rules."],
    ["保留城市与骑士的三颗骰子、商品、改良、骑士、城墙、都会和进步卡。使用航海家的船、金矿、发现岛屿奖励及地图特殊规则；不用基础版发展卡和最大军队奖励。", "Keep the three dice, commodities, improvements, knights, walls, metropolises and progress cards from Cities & Knights. Add Seafarers ships, gold fields, island bonuses and scenario rules. Base development cards and Largest Army are not used."],
    ["船与道路：造船花 1 木＋1 羊，每人最多 15 艘。道路与船在计算最长商路时，仍须通过自己的村庄或城市连接；骑士不能代替这个连接建筑。", "Ships and roads: a ship costs one lumber and one wool, with 15 ships per player. A road and a shipping route join for Longest Trade Route only through your own settlement or city; a knight cannot replace that building."],
    ["海上骑士：可在自己道路或船旁的空交叉点招募骑士，包括海上交叉点。已能行动的骑士可沿自己连续的道路和船移动，不能穿过对手的建筑或骑士；移动后失去激活状态。", "Knights at sea: recruit on an empty intersection beside your road or ship, including at sea. An eligible active knight may move along your continuous roads and ships, without passing an opponent's building or knight, and deactivates after moving."],
    ["骑士与船的移动：骑士位于航线末端时，会封闭该航线。不能移动导致自己的骑士失去连接的船。对手骑士会截断你计算最长商路的连续路线，但不会因此让它旁边的船变成可移动的开放船。", "Knights and ship movement: a knight closes a route at its endpoint. Do not move a ship that would disconnect your knight. An enemy knight splits your route for Longest Trade Route, but does not make adjacent ships open and movable."],
    ["蛮族同时攻击所有岛屿：把全图所有城市和都会合计为蛮族强度，把全图所有已激活骑士的等级相加作为防守力。不会按岛屿分别结算；奖励、城市降级及骑士失活照常处理。", "Barbarians attack all islands together. Count all cities and metropolises for their strength and all active knights' ranks for defense. Resolve rewards, city losses and knight deactivation once for the whole board, not island by island."],
    ["首次入侵前：强盗和海盗都不入场，不能移动或用骑士驱赶它们。掷出 7 时，超过手牌上限的人仍须弃掉一半资源和商品；不执行移动强盗／海盗或偷牌。", "Before the first barbarian attack, neither robber nor pirate is in play, so neither can move or be chased. A seven still makes players above their hand limit discard half their resource and commodity cards, but causes no robber/pirate move or theft."],
    ["首次入侵后：强盗进入本图规定的起始地块，海盗进入本图规定的起点（可能在棋盘外）。此后掷 7 可按航海家规则选择移动强盗或海盗。", "After the first attack, the robber enters its scenario starting hex and the pirate takes the scenario's starting position, which may be off the board. Later sevens allow the usual Seafarers choice of moving the robber or pirate."],
    ["驱赶海盗：首次入侵后，能行动且紧邻海盗所在海格的已激活骑士，可像驱赶强盗一样驱赶海盗。驱赶后该骑士失活；本回合刚激活的骑士不能这样行动。", "Chasing the pirate: after the first attack, an eligible active knight bordering the pirate's sea hex may chase it as it would the robber. The knight deactivates; a knight activated this turn cannot take this action."],
    ["金矿只产普通资源：村庄领取 1 张，城市领取 2 张，可选择不同种类；不能选纸、布或币。商人也不能放在金矿上。", "Gold fields yield only normal resources: one for a settlement or two for a city, which may be different types. Never take paper, cloth or coins from gold fields, and never place the merchant there."],
    ["道路建设进步卡：可免费建至多 2 条道路、2 艘船，或各 1 个；仍须满足连接、地形、海盗封锁和棋子数量限制。", "Road Building: build up to two roads, two ships, or one of each for free, following connection, terrain, pirate-blocking and piece limits."],
    ["外交进步卡：也可移除开放的船，包括海盗旁的开放船。移除自己的道路，只能免费另建道路；移除自己的船，只能免费另建船。移除对手的棋子则交还对手，不能换成自己的。", "Diplomacy also removes open ships, even beside the pirate. Removing your road permits a replacement road; removing your ship permits a replacement ship. An opponent's piece returns to their supply and does not become yours."],
    ["征税进步卡：只能移动强盗，从新地块旁每名对手各偷 1 张资源或商品；不能用它移动海盗。其他进步卡继续遵守各自的城市与骑士规则。", "Taxation moves only the robber and steals one resource or commodity from each opponent beside the new hex; it cannot move the pirate. Other progress cards retain their Cities & Knights effects."]
  ];
  const combinedCardDetails = {
    roads: [["组合模式：道路和船合计至多两个", "Combined mode: up to two roads and/or ships", "可把免费道路换成免费船：两条道路、两艘船，或道路和船各一个，合计最多两个。船仍须符合建造位置、海盗封锁和每人 15 艘的上限。", "The two free pieces may be roads, ships, or one of each, never more than two total. Ships must obey placement rules, pirate blocking and the 15-ship limit."]],
    diplomacy: [["组合模式：也能移除开放的船", "Combined mode: open ships are eligible", "可移除开放的船，即使它紧邻海盗。移除自己的船后只能免费另建船，移除自己的道路后只能免费另建道路；不能互换类型。对手的棋子交还对手。骑士不能因此失去连接。", "An open ship may be removed even beside the pirate. Your removed ship can only be replaced by a ship, and your road by a road; the types cannot be swapped. Opponents reclaim their own pieces. No knight may be disconnected."]],
    merchant: [["组合模式：不能放在金矿", "Combined mode: no merchant on gold", "商人仍须放在自己村庄或城市旁的普通资源地块，不能放在金矿或海洋上。金矿也不能作为商人的 2:1 兑换种类。", "Place the merchant on a normal resource hex beside your settlement or city, never on gold fields or sea. Gold fields cannot supply a merchant 2:1 trading type."]],
    taxation: [["组合模式：只能移动强盗", "Combined mode: robber only", "征税只能移动强盗，不能移动海盗。仍须等首次蛮族入侵后才能使用，并从强盗新地块旁每名对手各偷一张资源或商品。", "Taxation moves the robber, never the pirate. It remains unavailable before the first barbarian attack and steals one resource or commodity from each opponent beside the robber's new hex."]]
  };
  const combinedSources = [
    ["CATAN 官方：城市与骑士 2025 规则，第 12 页组合规则 / Official 2025 Cities & Knights rules, p. 12", "https://www.catan.com/sites/default/files/2025-03/CN3087%20CATAN%E2%80%93Cities%26Knights_%20Rulebook.pdf"],
    ["CATAN 官方：城市与骑士与航海家组合说明 / Official expansion combination guidance", "https://www.catan.com/cities-knights"],
    ["CATAN 官方：城市与骑士常见问题 / Official Cities & Knights FAQ", "https://www.catan.com/faq/cities-knights"],
    ["CATAN 官方：航海家常见问题 / Official Seafarers FAQ", "https://www.catan.com/faq/seafarers"]
  ];
  const data = { branches, resources, cards, rules, knightPlacement, ruleSections, cardDetails, combinedRules, combinedCardDetails, combinedSources, source: "https://www.catan.com/sites/default/files/2025-03/CN3087%20CATAN%E2%80%93Cities%26Knights_%20Rulebook.pdf" };
  if (typeof module === "object") module.exports = data; else root.CatanCitiesData = data;
})(typeof window === "object" ? window : globalThis);
