# 晴湾大富翁 / Sunny Bay Richman

## 版本范围 / Scope

参考《大富翁4Fun》公开介绍和《大富翁4》官方手册，制作独立的多人联机改编。地图、插画、程序、股票名称与部分平衡数值为本馆原创；不提供原游戏安装包、商标角色素材或逐字复制的规则书。并非官方版本，也不是全部机制的逐项复刻。

This is an independent online adaptation of core Richman 4/4Fun mechanics. The town, artwork, code, fictional companies and balancing values are original to this club, not an official release or a complete reproduction.

已实现：2–6 人、真人与机器人混合、住宅地产、12 位神明、27 类卡片和交通工具、银行、股票、彩票、新闻命运、点券、破产与限日结算。

Implemented: 2–6 humans/bots, residential property, 12 deities, 27 cards/tools, banking, fictional stocks, lottery, events, points, bankruptcy and day-limit settlement.

未实现：商业地的饭店/购物中心等类型、拍卖竞价、原版道具商店全套道具、魔法屋、小游戏、银行贷款、联盟/复仇/嫁祸等未列出的卡片。规则入口显示实际已支持的内容。

Not included: commercial building specializations, auctions, the full original tool set, magic houses, minigames, loans, alliances, retaliation and other unlisted cards.

## 回合与地产 / Turns and Property

- 原创 36 格环形地图「晴湾」，有两处银行、两处卡片商店、两处彩票亭、新闻、命运和点券格。每六格中的第三格有经过赠卡效果；卡片上限 20。点券格经过获得 30 点券，商店可用点券买卡、半价回收手牌。
- All players complete one turn per day. The fictional calendar starts on 2026-01-01. Banks interrupt movement when passed on business days, then the unused steps resume. Sunday closes banks and stock trading.
- 初始总资金默认 50,000，另可选 20,000 / 100,000；现金存款各半，100 点券，遥控骰子、送神符、免费卡及两张随机卡。
- Land costs 2,400–4,400 before the price index. Each upgrade costs 60% of its base land price; maximum five levels. Fortune can add two levels for one upgrade, capped at five.
- 租金由同街、同房主的全部地块相加：地价 × 8% × 等级倍率 `[1, 2, 4, 7, 11, 16]` × 物价指数。无须整条街买齐。神明、涨价、查封、休息状态再修正租金。
- Rent combines all of the owner's properties on that street. Resting or sealed owners do not collect rent. Bankruptcy draws on cash, deposits, forced stock sales, then half-value property liquidation. Forced stock liquidation is allowed even at limit-down in this club version.
- 总资产为现金、存款、股票当前市值和地产现值之和；卡片、点券不计入限日结算。地产现值为地价 × `(1 + 0.6 × 等级)` × 物价指数。平均总资产相对初始每翻一倍，物价指数加一级。
- Last solvent player wins, or select 30/60/90 days and compare total assets when the limit is reached. Equal maximum assets result in joint winners. Skipped jailed/hibernating turns still advance the calendar.

## 神明 / Deities

游戏内“规则 → 神明”列出全部双语效果。大/小财神、福神、穷神、衰神，以及天使、恶魔、土地公通常附身 7 天，死神 13 天；遇到新神明会替换旧神明。送神不退还已经得到或损失的钱与卡。

Greater/lesser Wealth, Fortune, Poverty, Misfortune, Angel, Devil and Land Guardian generally last seven days; the Reaper lasts thirteen. Deities may be invited or dismissed. Arrival cash effects use club amounts: greater Wealth/Poverty 3,000 times the price index, lesser versions transfer 300 times the index per opponent.

与手册的明确差异：本馆到期/送走时，大小神及天使/恶魔配对换形并重生于随机道路位置；土地公、死神等其他神明随机替换，没有实现“土地公下月返回”的独立时间表。土地公在附身期间经过住宅地会改变所有权；天使、恶魔只改变建筑层数，保留所有权。死神在本馆使坏命运费用加倍，不包含原版所有特殊灾难动画与小游戏。

Club differences: paired deities respawn at random road locations. Land Guardian does not use the original separate next-month return schedule. Reaper doubles harmful fate payments and does not reproduce every original special disaster.

## 卡片 / Cards

27 类为：遥控骰子、转向、停留、乌龟、购地、换地、换屋、天使、恶魔、怪兽、拆除、抢夺、冬眠、陷害、免费、免罪、送神符、请神符、红卡、黑卡、查税、涨价、查封、均富、均贫、机车、汽车。

See the in-game Cards rules tab for the exact target, cost and effect of every card/tool. Manual cards may be played before rolling, at a property decision, or before ending your turn. Waiver and Amnesty are automatic. A loaded die sets 1–6 steps; a motorbike supports up to two dice and a car supports up to three.

本馆数值：停留影响下一次掷骰；乌龟 3 天；冬眠、陷害、查封和涨价 5 天；红/黑卡 3 个交易日。购地卡仅能强购脚下地块，换地/换屋需要脚下有自己的地产；其他指定目标卡的范围为整张地图。查税取目标现金 20% 进入奖池。均贫、均富只重分现金，不动存款和股票。免罪卡挡陷害、冬眠、对手乌龟和查税。

There are no range-tool mechanics or auctions in this version. Snatch takes a random card, not a separately modeled tool inventory. Monster clears one building; Remove takes one level. Sleep/Jail prevent rent collection for five days. Exact costs and these adaptation choices are club settings.

## 银行、股票与彩票 / Finance

- 股票只从存款结算，未破产真人可以在别人的回合买卖；每天最多 20 笔，每笔 1–10,000 股，成交价必须与服务器当前报价一致。不能透支、卖空或输负数。
- Six fictional stocks update once per market day, within a maximum 10% change, rounded to whole game coins with a minimum price of 10. No buys at limit-up or sells at limit-down; red/black cards force three market days and opposite cards cancel pending effects.
- 每月 15 日按所持股票当日市值发 3% 游戏分红入存款；月底按存款发 10% 游戏利息。股名、初始报价、每日随机分布和分红率为本馆设定，不对应真实证券。
- A ticket costs 1,000 cash at a lottery booth. Choose one of 1–36 exclusive numbers, at most five tickets per visit. On each month's 15th, the winner takes the whole pool. With no solvent owner of the drawn number, the pool rolls over. Every draw expires all old tickets.
- 奖池起始/中奖后重置为 20,000，购票款和多数罚款入池。这些范围、限额及数值为本馆设定。所有游戏资金均虚拟，无现实下注、充值或提现。

## 联机 / Online

房间号按显示内容完整输入，不额外添加前缀。所有操作在服务器校验；客户端只收到自己的卡片和持股明细。其他玩家的现金、存款、净资产、卡片总数、神明、已公开行动日志属于公开信息。

The same tab can reconnect using its private session token. Leaving keeps the seat in a running game under auto control; use the same browser session and room code to rejoin. Disconnect auto takeover starts after 30 seconds while another human remains online; bots pause when no humans are connected. In-memory rooms expire after an hour with nobody online and do not survive server redeployment.

## 一手资料 / Primary References

- 大宇《大富翁4Fun》介绍：<https://km.softstar.com.tw/topic.aspx?mobile-app=true&theme=wiki&tid=456>
- 大宇《大富翁4》Steam 页面及官方说明书入口：<https://store.steampowered.com/app/2059810/4/?l=tchinese>
- 《大富翁4》官方手册 PDF：<https://cdn.akamai.steamstatic.com/steam/apps/2059810/manuals/%E5%A4%A7%E5%AF%8C%E7%BF%814%E8%AA%AA%E6%98%8E%E6%9B%B8.pdf?t=1658992525>

参考核对日期：2026-09-14。仓库和上传包不附官方手册扫描图片，仅附原创资源与规则实现。
