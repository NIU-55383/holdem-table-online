"use strict";
(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.RichmanData=factory();})(typeof globalThis!=="undefined"?globalThis:this,()=>{
  const COLORS=["#e96b62","#3e9bc6","#e6b546","#9874c7","#419c76","#d97eaf"];
  const gods={
    wealth:{name:"大财神",en:"Wealth God",art:"wealth",good:true,days:7,desc:"免付租金；附身时得到现金。",detail:"No rent; a cash gift on arrival."},
    wealthSmall:{name:"小财神",en:"Lesser Wealth",art:"wealth",good:true,days:7,desc:"租金减半；从每名对手收取少量现金。",detail:"Half rent; collect a small cash gift from opponents."},
    luck:{name:"大福神",en:"Fortune God",art:"fortune",good:true,days:7,desc:"赠两张卡，买地免费，投资时加盖两层。",detail:"Two cards, free land and two levels per upgrade."},
    luckSmall:{name:"小福神",en:"Lesser Fortune",art:"fortune",good:true,days:7,desc:"赠一张卡，买地半价，投资时加盖两层。",detail:"One card, half-price land and two levels per upgrade."},
    poor:{name:"大穷神",en:"Poverty God",art:"poverty",good:false,days:7,desc:"损失现金，支付双倍租金。",detail:"Lose cash and pay double rent."},
    poorSmall:{name:"小穷神",en:"Lesser Poverty",art:"poverty",good:false,days:7,desc:"给对手少量现金，租金增加一半。",detail:"Give opponents cash; pay 1.5 times rent."},
    bad:{name:"大衰神",en:"Misfortune",art:"misfortune",good:false,days:7,desc:"失去一半卡片；买地与投资失败。",detail:"Lose half your cards; purchases and upgrades fail."},
    badSmall:{name:"小衰神",en:"Lesser Misfortune",art:"misfortune",good:false,days:7,desc:"失去一张卡；买地与投资有一半几率失败。",detail:"Lose one card; purchases and upgrades may fail."},
    angel:{name:"天使",en:"Angel",art:"angel",good:true,days:7,desc:"经过已购土地时，房屋加盖一层。",detail:"Add a level to owned properties you pass."},
    devil:{name:"恶魔",en:"Devil",art:"devil",good:false,days:7,desc:"经过建筑时拆掉一层。",detail:"Remove a level from buildings you pass."},
    land:{name:"土地公",en:"Land Guardian",art:"guardian",good:true,days:7,desc:"经过住宅土地时，占为己有。",detail:"Claim residential properties you pass."},
    death:{name:"死神",en:"Reaper",art:"reaper",good:false,days:13,desc:"失去所有卡片，命运坏事加倍。",detail:"Lose all cards; harmful fate payments double."}
  };
  const cards={
    dice:["遥控骰子","Loaded Dice","dices",35,"step","指定本次前进 1–6 步。","Choose 1–6 steps for this move."],
    reverse:["转向卡","Reverse","undo-2",20,"player","指定玩家改变前进方向。","Reverse a player's direction."],
    stop:["停留卡","Stay","pause",25,"player","下次掷骰不移动，仍触发所在格。","Stay on the current tile next roll."],
    turtle:["乌龟卡","Slow Down","footprints",35,"player","三天内每次仅前进一步。","Move one step per turn for three days."],
    buy:["购地卡","Takeover","land-plot",70,"here","按现值强购脚下对手的土地。","Buy the opponent's current property at its value."],
    swap:["换地卡","Land Swap","replace",50,"property","用脚下自己的土地交换另一块土地。","Exchange your current property with another."],
    swapHouse:["换屋卡","Building Swap","building-2",40,"property","交换脚下与目标地块的建筑等级。","Swap the building levels of two owned plots."],
    build:["天使卡","Build a Street","house-plus",60,"property","目标街区已购土地都加盖一层。","Add one level to owned plots on a street."],
    destroy:["恶魔卡","Clear a Street","flame",90,"property","清空目标街区的建筑，土地归属不变。","Clear a street's buildings; retain ownership."],
    monster:["怪兽卡","Demolish","brick-wall",50,"property","将一栋建筑夷为平地。","Remove every level from one building."],
    remove:["拆除卡","Remove a Level","hammer",20,"property","拆除指定建筑的一层。","Remove one building level."],
    steal:["抢夺卡","Snatch","hand",35,"opponent","随机夺取对手一张卡。","Take one random card from an opponent."],
    sleep:["冬眠卡","Hibernation","moon",100,"none","其他人休息五天，期间不能收租。","All opponents rest for five days without collecting rent."],
    jail:["陷害卡","Frame","lock-keyhole",50,"opponent","对手入狱五天，期间不能收租。","Jail an opponent for five days without rent income."],
    free:["免费卡","Rent Waiver","ticket-check",35,"auto","租金或罚款达到 2,000 或现金不足时自动免除。","Automatically waive rent or fines of 2,000+, or beyond your cash."],
    pardon:["免罪卡","Amnesty","shield-check",40,"auto","自动抵消一次陷害、冬眠、乌龟或查税。","Automatically block a jail, sleep, slow or tax attack."],
    dismiss:["送神符","Dismiss Spirit","wind",35,"selfGod","送走自己附身的神明。","Remove your attached deity."],
    invite:["请神符","Invite Spirit","sparkles",40,"none","请地图上离自己最近的神明附身。","Invite the nearest roaming deity."],
    red:["红卡","Bull Card","trending-up",50,"stock","指定股票连续三日涨停，与黑卡抵消。","Force three daily limit-up moves; cancels a Bear Card."],
    black:["黑卡","Bear Card","trending-down",50,"stock","指定股票连续三日跌停，与红卡抵消。","Force three daily limit-down moves; cancels a Bull Card."],
    tax:["查税卡","Tax Audit","receipt",45,"opponent","收取对方现金的 20%，进入奖池。","Take 20% of an opponent's cash for the jackpot."],
    raise:["涨价卡","Rent Boost","badge-dollar-sign",40,"self","自己的租金翻倍，持续五天。","Double your rent income for five days."],
    seal:["查封卡","Rent Freeze","ban",45,"opponent","指定对手五天不能收租。","Stop an opponent collecting rent for five days."],
    equal:["均富卡","Equal Wealth","equal",100,"none","平均分配所有未破产玩家的现金，不含存款。","Equalize active players' cash, excluding deposits."],
    pair:["均贫卡","Split Cash","scale",60,"opponent","与指定对手平分现金，不含存款。","Share cash equally with one opponent; exclude deposits."],
    bike:["机车","Motorbike","bike",70,"self","机车可选掷一颗或两颗骰子。","Use one or two dice with a motorbike."],
    car:["汽车","Car","car",120,"self","汽车可选掷一至三颗骰子。","Use one, two or three dice with a car."]
  };
  const stockNames=[["晴湾建设","Sunny Homes"],["海风科技","Sea Tech"],["彩虹百货","Rainbow Stores"],["星港运输","Star Transit"],["云杉能源","Spruce Energy"],["丰年食品","Harvest Foods"]];
  const specials={0:"bank",4:"shop",8:"lottery",12:"news",16:"bank",20:"shop",24:"lottery",28:"fate",32:"points"};
  const tileNames={bank:["银行","Bank"],shop:["卡片商店","Card Shop"],lottery:["彩票亭","Lottery"],news:["新闻","News"],fate:["命运","Fate"],points:["点券","Points"]};
  const streets=[["海风路","Seabreeze"],["彩虹街","Rainbow"],["花园路","Garden"],["星光街","Starlight"]];
  const coords=[];
  for(let x=0;x<=10;x++)coords.push([x,0]);for(let y=1;y<=8;y++)coords.push([10,y]);for(let x=9;x>=0;x--)coords.push([x,8]);for(let y=7;y>=1;y--)coords.push([0,y]);
  const tiles=coords.map(([x,y],id)=>({id,x,y,type:specials[id]||"land",name:specials[id]?tileNames[specials[id]][0]:`${streets[Math.floor(id/9)][0]}${id+1}号`,en:specials[id]?tileNames[specials[id]][1]:`${streets[Math.floor(id/9)][1]} ${id+1}`,street:Math.floor(id/9),price:2400+(id%5)*500}));
  const rules={
    basics:[["晴湾为原创地图，2–6 人轮流行动。全员完成一轮为一天，最后未破产者胜；限日模式到期按总资产比较。","Sunny Bay is an original 2–6 player board. One full round is a day. Last solvent player wins, or highest net worth at the day limit."],["买地、加盖建筑和收租；同街属于同一房主的地块合并计租。房屋最高五级，不要求凑齐整条街。","Buy property and add up to five building levels. Rent combines your host's plots on that street; no complete street set is required."],["现金用于购地和彩票，点券用于商店，存款用于股票。付不起费用时依次动用存款、股票、半价变卖土地；仍不足则破产。","Cash buys property and tickets, points buy cards, and deposits buy shares. Unpaid charges draw from deposits, shares, then half-value property sales before bankruptcy."],["本馆初始总资金默认 50,000，现金与存款各半；地价 2,400–4,400，升级费为地价的 60%。这是按四代核心机制制作的联机改编，并非 4Fun 全量复刻。","Club defaults: 50,000 starting funds split equally between cash and deposits; land 2,400–4,400; upgrades cost 60% of land price. This is an online adaptation, not a complete 4Fun reproduction."],["当前含住宅地、27 类卡片与道具、12 位神明。原版商业地、拍卖、魔法屋及小游戏尚未纳入；效果范围按整张晴湾地图计算。","Includes residential plots, 27 cards/tools and 12 deities. Commercial buildings, auctions, magic houses and minigames are not included. Target range covers the whole Sunny Bay board."]],
    stocks:[["经过银行可存取现金，周日银行与股市休市。股票以存款结算；未破产玩家可在其他人的回合买卖。","Pass a bank to deposit or withdraw cash. Banks and the market close on Sundays. Share trades use deposits, including during other players' turns."],["每天更新一次价格，本馆日涨跌幅最多 10%；涨停不能买，跌停不能卖。红卡、黑卡连续影响三个交易日，反向卡抵消未完成的效果。","Prices update daily within a club limit of 10%. No buying at limit-up or selling at limit-down. Bull/Bear Cards act for three market days; an opposite card cancels remaining effects."],["每月 15 日持股获得 3% 游戏分红；月底存款获得 10% 游戏利息。股票是虚构市场，不对应现实证券；禁止负数、透支或做空。","Holdings pay a club dividend of 3% on the 15th; deposits earn 10% game interest at month end. Fictional shares only; no borrowing, negative orders or short selling."],["股价与分红算法、股名及初始价格为本馆设定。平均总资产每翻一倍，物价指数上升一级，购地、建造、租金和事件金额随之提高。","Stock names, prices, dividends and pricing algorithm are club settings. Each doubling of average net worth raises the price index, increasing property, rent and event amounts."]],
    lottery:[["停在彩票亭时以现金 1,000 买一个 1–36 号码，每个号码每期只能被一名玩家持有，每次最多买五张。","At a lottery booth, pay 1,000 cash for one number from 1–36. Each number has one owner per draw; up to five tickets per visit."],["每月 15 日开奖；中奖者获得全部奖池。无人中奖，奖金保留到下月；每次开奖后所有旧票作废。","A draw takes place on the 15th each month. The winner takes the jackpot; no winner means it rolls over. All old tickets expire after a draw."],["本馆起始奖池 20,000，票款和多数罚款进入奖池。号码范围、购买上限和奖池底额为本馆设定，全部使用虚拟游戏币。","The club jackpot starts at 20,000, funded by tickets and most fines. Number range, purchase limit and starting jackpot are club settings. All currency is virtual."]]
  };
  return{COLORS,gods,cards,stockNames,tiles,streets,rules,MAX_CARDS:20};
});
