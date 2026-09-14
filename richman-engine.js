"use strict";
const D=require("./richman-data");
const requireRule=(ok,message)=>{if(!ok)throw Error(message);};
const rand=(rng,n)=>Math.min(n-1,Math.floor(rng()*n));
const money=(n)=>Math.max(0,Math.round(n));
function dateInfo(g){const d=new Date(Date.UTC(2026,0,g.day));return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,date:d.getUTCDate(),weekday:d.getUTCDay(),monthEnd:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()===d.getUTCDate()};}
function log(g,zh,en){g.log.push({id:++g.seq,text:zh,en});g.log=g.log.slice(-70);}
function value(g,t){return money(t.price*(1+.6*t.level)*g.index);}
function assets(g,p){return p.cash+p.deposit+p.shares.reduce((v,n,i)=>v+n*g.stocks[i].price,0)+g.tiles.filter(t=>t.owner===p.id).reduce((s,t)=>s+value(g,t),0);}
function activeGod(g,p){return p.god&&p.god.until>g.day?p.god.type:null;}
function purchasePrice(g,p,t){const god=activeGod(g,p);return god==="luck"?0:money(t.price*g.index*(god==="luckSmall"?.5:1));}
function rent(g,t){const owner=g.players[t.owner];if(!owner||owner.out||owner.restUntil>g.day||owner.sealUntil>g.day)return 0;return money(g.tiles.filter(x=>x.owner===t.owner&&x.street===t.street).reduce((sum,x)=>sum+x.price*.08*[1,2,4,7,11,16][x.level],0)*g.index*(owner.raiseUntil>g.day?2:1));}
function addCard(g,p,card,rng){if(p.cards.length>=D.MAX_CARDS)return;const names=Object.keys(D.cards);p.cards.push(card||names[rand(rng,names.length)]);}
function createGame(names,options={},rng=Math.random){
  requireRule(names.length>=2&&names.length<=6,"需要 2–6 人 / Need 2–6 players");
  const funds=[20000,50000,100000].includes(options.funds)?options.funds:50000;
  const g={players:names.map((name,id)=>({id,name,cash:funds/2,deposit:funds/2,points:100,pos:Math.floor(id*36/names.length),direction:1,cards:[],shares:D.stockNames.map(()=>0),vehicle:1,god:null,out:false,restUntil:0,restReason:"",sealUntil:0,raiseUntil:0,slowUntil:0,stay:false,controlled:0,stockTrades:0,aiTurn:-1})),
    tiles:D.tiles.map(t=>({...t,owner:-1,level:0})),stocks:D.stockNames.map(([name,en],i)=>({id:i,name,en,price:40+i*12,previous:40+i*12,history:[40+i*12],force:0,forceDays:0,limit:0})),
    gods:["wealthSmall","luckSmall","poorSmall","badSmall","angel","land"].map((type,i)=>({type,pos:3+i*6})),day:1,turn:1,current:0,phase:"roll",remaining:0,dice:[],lastMove:null,moveId:0,log:[],seq:0,revision:0,index:1,initialAverage:funds,limitDays:[30,60,90].includes(options.days)?options.days:0,lottery:{pool:20000,tickets:{},draw:null},visitPurchases:0,winners:[],reason:""};
  for(const p of g.players){p.cards=["dice","dismiss","free"];addCard(g,p,null,rng);addCard(g,p,null,rng);}
  log(g,"晴湾开局，祝好运！","Welcome to Sunny Bay!");return g;
}
function defend(g,p,kind){if(!p.cards.includes("pardon"))return false;p.cards.splice(p.cards.indexOf("pardon"),1);log(g,`${p.name} 使用免罪卡抵消${kind}`,`${p.name} blocks the effect with Amnesty`);return true;}
function clearGod(g,p,rng){if(!p.god)return;const type=p.god.type;const pairs={wealth:"wealthSmall",wealthSmall:"wealth",luck:"luckSmall",luckSmall:"luck",poor:"poorSmall",poorSmall:"poor",bad:"badSmall",badSmall:"bad",angel:"devil",devil:"angel"};p.god=null;if(g.gods.length<8)g.gods.push({type:pairs[type]||Object.keys(D.gods)[rand(rng,12)],pos:rand(rng,36)});}
function checkWin(g){
  const live=g.players.filter(p=>!p.out);
  if(live.length<=1){g.phase="over";g.winners=live.map(p=>p.id);g.reason="其他玩家均已破产 / All opponents bankrupt";}
  else if(g.limitDays&&g.day>g.limitDays){const top=Math.max(...live.map(p=>assets(g,p)));g.phase="over";g.winners=live.filter(p=>assets(g,p)===top).map(p=>p.id);g.reason="达到设定天数，按总资产结算 / Day limit: highest net worth wins";}
}
// Forced payments draw on liquid assets first, then sell property at half value.
function pay(g,id,amount,to=-1,waiver=false){
  const p=g.players[id];if(p.out)return 0;amount=money(amount);
  if(waiver&&amount>0&&(amount>=2000||amount>p.cash)&&p.cards.includes("free")){p.cards.splice(p.cards.indexOf("free"),1);log(g,`${p.name} 使用免费卡免付 ${amount}`,`${p.name} waives ${amount} with a Rent Waiver`);return 0;}
  let deficit=amount-p.cash;
  if(deficit>0){const n=Math.min(deficit,p.deposit);p.deposit-=n;p.cash+=n;}
  for(const s of g.stocks){deficit=amount-p.cash;if(deficit<=0)break;const n=Math.min(p.shares[s.id],Math.ceil(deficit/s.price));p.shares[s.id]-=n;p.cash+=n*s.price;}
  for(const t of g.tiles.filter(t=>t.owner===id).sort((a,b)=>value(g,a)-value(g,b))){if(p.cash>=amount)break;p.cash+=Math.floor(value(g,t)/2);t.owner=-1;t.level=0;log(g,`${p.name} 变卖 ${t.name}`,`${p.name} liquidates ${t.en}`);}
  const paid=Math.min(p.cash,amount);p.cash-=paid;if(to>=0&&!g.players[to].out)g.players[to].cash+=paid;else g.lottery.pool+=paid;
  if(paid<amount){p.out=true;p.cards=[];p.god=null;log(g,`${p.name} 破产`,`${p.name} is bankrupt`);checkWin(g);}
  return paid;
}
function attachGod(g,p,type,rng){
  if(p.out)return;clearGod(g,p,rng);p.god={type,until:g.day+D.gods[type].days};log(g,`${p.name} 遇到${D.gods[type].name}`,`${D.gods[type].en} joins ${p.name}`);
  if(type==="wealth")p.cash+=3000*g.index;
  if(type==="wealthSmall")for(const other of g.players)if(other.id!==p.id&&!other.out)pay(g,other.id,300*g.index,p.id);
  if(type==="poor")pay(g,p.id,3000*g.index);
  if(type==="poorSmall")for(const other of g.players)if(other.id!==p.id&&!other.out)pay(g,p.id,300*g.index,other.id);
  if(type==="luck"||type==="luckSmall"){addCard(g,p,null,rng);if(type==="luck")addCard(g,p,null,rng);}
  if(type==="badSmall"&&p.cards.length)p.cards.splice(rand(rng,p.cards.length),1);
  if(type==="bad")p.cards.splice(0,Math.ceil(p.cards.length/2));
  if(type==="death")p.cards=[];
}
function nextDay(g,rng){
  g.day++;const d=dateInfo(g);
  for(const p of g.players){p.stockTrades=0;if(p.god?.until<=g.day)clearGod(g,p,rng);}
  if(d.weekday!==0)for(const s of g.stocks){s.previous=s.price;const change=s.forceDays?s.force*10:rand(rng,21)-10;s.price=Math.max(10,Math.min(Math.floor(s.previous*1.1),Math.max(Math.ceil(s.previous*.9),money(s.previous*(1+change/100)))));s.limit=change===10?1:change===-10?-1:0;s.history.push(s.price);s.history=s.history.slice(-30);if(s.forceDays>0&&!--s.forceDays)s.force=0;}
  if(d.date===15){
    for(const p of g.players)if(!p.out)p.deposit+=money(p.shares.reduce((v,n,i)=>v+n*g.stocks[i].price,0)*.03);
    const number=rand(rng,36)+1,owner=g.lottery.tickets[number],win=Number.isInteger(owner)&&!g.players[owner].out;
    g.lottery.draw={day:g.day,number,winner:win?owner:-1,prize:win?g.lottery.pool:0};
    if(win){g.players[owner].cash+=g.lottery.pool;log(g,`${g.players[owner].name} 彩票 ${number} 号中奖 ${g.lottery.pool}`,`${g.players[owner].name} wins ${g.lottery.pool} with ticket ${number}`);g.lottery.pool=20000;}else log(g,`彩票开出 ${number}，无人中奖，奖池累积`,`Lottery ${number}: no winner; jackpot rolls over`);
    g.lottery.tickets={};
  }
  if(d.monthEnd){for(const p of g.players)if(!p.out)p.deposit+=money(p.deposit*.1);log(g,"月底存款利息已到账","Month-end deposit interest paid");}
  const average=g.players.reduce((sum,p)=>sum+assets(g,p),0)/g.players.length;
  g.index=Math.max(1,1+Math.floor(Math.log2(Math.max(1,average/g.initialAverage))));checkWin(g);
}
function endTurn(g,rng){
  if(g.phase==="over")return;
  let next=g.current;
  do{next++;if(next>=g.players.length){next=0;nextDay(g,rng);if(g.phase==="over")return;}}while(g.players[next].out);
  g.current=next;g.turn++;g.dice=[];g.remaining=0;g.phase=g.players[next].restUntil>g.day?"rest":"roll";
}
function fate(g,p,news,rng){
  const god=activeGod(g,p);let n=rand(rng,6);if(god==="luck"||god==="luckSmall")n=[0,2,4][rand(rng,3)];
  const amount=(news?2000:1200)*g.index;
  if(n===0){p.cash+=amount;log(g,`${p.name} 收到奖金 ${amount}`,`${p.name} receives a bonus of ${amount}`);}
  if(n===1){pay(g,p.id,amount*(god==="death"?2:1),-1,true);log(g,`${p.name} 遇到意外支出`,`${p.name} faces an unexpected bill`);}
  if(n===2){p.points+=40;addCard(g,p,null,rng);log(g,`${p.name} 得到点券与卡片`,`${p.name} receives points and a card`);}
  if(n===3){const t=g.tiles.find(t=>t.owner===p.id&&t.level>0);if(t){t.level--;log(g,`${t.name} 因维修降低一级`,`${t.en} loses a level for repairs`);}else p.points+=20;}
  if(n===4){p.deposit+=amount;log(g,`${p.name} 投资回报存入银行`,`${p.name} receives an investment bonus in the bank`);}
  if(n===5)attachGod(g,p,Object.keys(D.gods)[rand(rng,12)],rng);
}
function land(g,p,rng){
  const t=g.tiles[p.pos];g.visitPurchases=0;
  if(t.type==="land"){
    if(t.owner>=0&&t.owner!==p.id){const base=rent(g,t),god=activeGod(g,p),factor=god==="wealth"?0:god==="wealthSmall"?.5:god==="poor"?2:god==="poorSmall"?1.5:1;const amount=pay(g,p.id,base*factor,t.owner,true);log(g,`${p.name} 支付租金 ${amount}`,`${p.name} pays ${amount} in rent`);if(g.phase==="over"||p.out)return;}
    g.phase=(t.owner<0||(t.owner===p.id&&t.level<5))?"property":"end";
  }else if(t.type==="bank")g.phase=dateInfo(g).weekday===0?"end":"bank";
  else if(t.type==="shop"||t.type==="lottery")g.phase=t.type;
  else {if(t.type!=="points")fate(g,p,t.type==="news",rng);if(!p.out&&g.phase!=="over")g.phase="end";}
}
function walk(g,p,rng){
  const path=[];g.phase="moving";
  while(g.remaining>0&&!p.out&&g.phase!=="over"){
    p.pos=(p.pos+p.direction+36)%36;g.remaining--;path.push(p.pos);const t=g.tiles[p.pos];
    const deity=g.gods.findIndex(x=>x.pos===p.pos);if(deity>=0){const [spirit]=g.gods.splice(deity,1);attachGod(g,p,spirit.type,rng);}
    if(p.out||g.phase==="over")break;
    const god=activeGod(g,p);if(t.type==="land"){
      if(god==="land"&&t.owner!==p.id){t.owner=p.id;log(g,`${p.name} 的土地公占领 ${t.name}`,`${p.name}'s guardian claims ${t.en}`);}
      if(t.owner>=0&&god==="angel")t.level=Math.min(5,t.level+1);
      if(t.owner>=0&&god==="devil")t.level=Math.max(0,t.level-1);
    }
    if(t.type==="points")p.points+=30;
    if(p.pos%6===2)addCard(g,p,null,rng);
    if(t.type==="bank"&&dateInfo(g).weekday!==0){g.phase="bank";break;}
  }
  if(path.length)g.lastMove={id:++g.moveId,player:p.id,path};
  if(g.phase==="over")return;
  if(p.out){endTurn(g,rng);return;}
  if(g.phase!=="bank"&&g.remaining===0)land(g,p,rng);
}
function cardTargets(g,id,key){
  const p=g.players[id],c=D.cards[key];if(!c||!p.cards.includes(key)||p.out||g.current!==id||!["roll","end","property"].includes(g.phase))return [];
  const type=c[4];if(type==="auto")return [];
  if(type==="none"||type==="self")return key==="invite"&&!g.gods.length?[]:[id];
  if(type==="selfGod")return p.god?[id]:[];
  if(type==="step")return g.phase==="roll"?[1,2,3,4,5,6]:[];
  if(type==="stock")return g.stocks.map(s=>s.id);
  if(type==="here"){const t=g.tiles[p.pos];return t.type==="land"&&t.owner>=0&&t.owner!==id&&p.cash>=value(g,t)?[t.id]:[];}
  if(type==="player"||type==="opponent")return g.players.filter(x=>!x.out&&(type==="player"||x.id!==id)&&(key!=="steal"||x.cards.length)).map(x=>x.id);
  const here=g.tiles[p.pos];
  if((key==="swap"||key==="swapHouse")&&(here.type!=="land"||here.owner!==id))return [];
  return g.tiles.filter(t=>t.type==="land"&&t.owner>=0&&(!["swap","swapHouse"].includes(key)||t.id!==p.pos)&&(!["remove","monster"].includes(key)||t.level>0)).map(t=>t.id);
}
function useCard(g,p,a,rng){
  const key=a.card,c=D.cards[key],targets=cardTargets(g,p.id,key);requireRule(c&&targets.length,"此时不能使用该卡 / Card not available now");
  const target=["none","self","selfGod","here"].includes(c[4])?targets[0]:a.target;
  requireRule(targets.includes(target),"请选择有效目标 / Choose a valid target");
  p.cards.splice(p.cards.indexOf(key),1);const other=g.players[target],t=g.tiles[target],here=g.tiles[p.pos];
  log(g,`${p.name} 使用${c[0]}`,`${p.name} uses ${c[1]}`);
  if(["jail","turtle","tax"].includes(key)&&other.id!==p.id&&defend(g,other,c[0]))return;
  if(key==="dice")p.controlled=target;
  if(key==="reverse")other.direction*=-1;
  if(key==="stop")other.stay=true;
  if(key==="turtle")other.slowUntil=g.day+3;
  if(key==="buy"){const owner=here.owner,cost=value(g,here);p.cash-=cost;g.players[owner].cash+=cost;here.owner=p.id;}
  if(key==="swap"){const owner=t.owner;t.owner=here.owner;here.owner=owner;}
  if(key==="swapHouse"){const level=t.level;t.level=here.level;here.level=level;}
  if(key==="build"||key==="destroy")for(const tile of g.tiles)if(tile.street===t.street&&tile.owner>=0)tile.level=key==="build"?Math.min(5,tile.level+1):0;
  if(key==="monster")t.level=0;if(key==="remove")t.level=Math.max(0,t.level-1);
  if(key==="steal"){const i=rand(rng,other.cards.length);addCard(g,p,other.cards.splice(i,1)[0],rng);}
  if(key==="jail"){other.restUntil=Math.max(other.restUntil,g.day+5);other.restReason="入狱 / Jail";}
  if(key==="sleep")for(const x of g.players)if(x.id!==p.id&&!x.out&&!defend(g,x,c[0])){x.restUntil=Math.max(x.restUntil,g.day+5);x.restReason="冬眠 / Hibernation";}
  if(key==="dismiss")clearGod(g,p,rng);
  if(key==="invite"){const best=g.gods.reduce((a,b)=>Math.min((a.pos-p.pos+36)%36,(p.pos-a.pos+36)%36)<=Math.min((b.pos-p.pos+36)%36,(p.pos-b.pos+36)%36)?a:b);g.gods.splice(g.gods.indexOf(best),1);attachGod(g,p,best.type,rng);}
  if(key==="red"||key==="black"){const s=g.stocks[target],sign=key==="red"?1:-1;if(s.force&&s.force!==sign){s.force=0;s.forceDays=0;}else{s.force=sign;s.forceDays=3;}}
  if(key==="tax")pay(g,other.id,money(other.cash*.2));
  if(key==="raise"){p.raiseUntil=g.day+5;p.sealUntil=0;}if(key==="seal"){other.sealUntil=g.day+5;other.raiseUntil=0;}
  if(key==="equal"||key==="pair"){const list=key==="equal"?g.players.filter(x=>!x.out):[p,other],sum=list.reduce((s,x)=>s+x.cash,0),base=Math.floor(sum/list.length);list.forEach((x,i)=>x.cash=base+(i<sum%list.length?1:0));}
  if(key==="bike")p.vehicle=Math.max(p.vehicle,2);if(key==="car")p.vehicle=3;
  if(g.phase==="property"&&(here.owner!==p.id&&here.owner>=0||here.level>=5))g.phase="end";
  if(p.out&&g.phase!=="over")endTurn(g,rng);
}
function internalAction(g,id,a,rng){
  const p=g.players[id];requireRule(p&&!p.out&&g.phase!=="over","你已破产或本局已结束 / Player out or game over");
  if(a.type==="stock"){
    requireRule(dateInfo(g).weekday!==0,"周日股市休市 / Market closed on Sundays");const s=g.stocks[a.stock];
    requireRule(s&&["buy","sell"].includes(a.side)&&Number.isInteger(a.quantity)&&a.quantity>0&&a.quantity<=10000,"交易数量无效 / Invalid share order");
    requireRule(a.quote===s.price,"股价已变化，请重新确认 / Price changed; confirm again");requireRule(p.stockTrades<20,"今日交易次数已用完 / Daily trade limit reached");
    const cost=s.price*a.quantity;
    if(a.side==="buy"){requireRule(s.limit!==1&&p.deposit>=cost,"涨停无法买入或存款不足 / Limit-up or insufficient deposits");p.deposit-=cost;p.shares[s.id]+=a.quantity;}
    else{requireRule(s.limit!==-1&&p.shares[s.id]>=a.quantity,"跌停无法卖出或持股不足 / Limit-down or insufficient shares");p.shares[s.id]-=a.quantity;p.deposit+=cost;}
    p.stockTrades++;log(g,`${p.name} ${a.side==="buy"?"买入":"卖出"} ${s.name} ${a.quantity} 股`,`${p.name} ${a.side}s ${a.quantity} shares of ${s.en}`);return;
  }
  requireRule(id===g.current,"还没轮到你 / Not your turn");
  if(a.type==="card"){useCard(g,p,a,rng);return;}
  if(a.type==="roll"){
    requireRule(g.phase==="roll","现在不能掷骰 / Cannot roll now");const count=a.dice||1;requireRule(Number.isInteger(count)&&count>=1&&count<=p.vehicle,"骰子数量无效 / Invalid dice count");
    g.dice=Array.from({length:count},()=>rand(rng,6)+1);g.remaining=p.stay?0:p.slowUntil>g.day?1:p.controlled||g.dice.reduce((n,x)=>n+x,0);if(p.controlled)g.dice=[p.controlled];p.controlled=0;p.stay=false;
    log(g,`${p.name} 前进 ${g.remaining} 步`,`${p.name} moves ${g.remaining} steps`);walk(g,p,rng);return;
  }
  if(a.type==="bank"){
    requireRule(g.phase==="bank"&&dateInfo(g).weekday!==0,"只有经过营业银行时可存取 / Visit an open bank first");const amount=a.amount;
    requireRule(Number.isSafeInteger(amount)&&amount>0&&["deposit","withdraw"].includes(a.direction),"金额无效 / Invalid amount");
    const from=a.direction==="deposit"?"cash":"deposit",to=from==="cash"?"deposit":"cash";requireRule(p[from]>=amount,"余额不足 / Insufficient balance");p[from]-=amount;p[to]+=amount;return;
  }
  if(a.type==="buy"||a.type==="upgrade"){
    const t=g.tiles[p.pos];requireRule(g.phase==="property"&&t.type==="land","当前不能建造 / No property decision");
    requireRule(a.type==="buy"?t.owner===-1:t.owner===id&&t.level<5,"不能购买或升级该土地 / Invalid property");
    const cost=a.type==="buy"?purchasePrice(g,p,t):money(t.price*.6*g.index);requireRule(p.cash>=cost,"现金不足，可先到银行取款 / Not enough cash");p.cash-=cost;
    const god=activeGod(g,p),fails=god==="bad"||god==="badSmall"&&rng()<.5;
    if(fails)log(g,`${p.name} 被衰神影响，投资失败`,`${p.name}'s investment fails under Misfortune`);
    else {if(a.type==="buy")t.owner=id;else t.level=Math.min(5,t.level+(["luck","luckSmall"].includes(god)?2:1));log(g,`${p.name} ${a.type==="buy"?"购入":"升级"} ${t.name}`,`${p.name} ${a.type==="buy"?"buys":"upgrades"} ${t.en}`);}
    g.phase="end";return;
  }
  if(a.type==="sellLand"){requireRule(["roll","end","property","bank"].includes(g.phase),"现在不能变卖 / Cannot sell now");const t=g.tiles[a.tile];requireRule(t?.owner===id,"不是你的土地 / Not your property");p.cash+=Math.floor(value(g,t)/2);t.owner=-1;t.level=0;log(g,`${p.name} 变卖 ${t.name}`,`${p.name} sells ${t.en}`);return;}
  if(a.type==="shop"){
    const c=D.cards[a.card];requireRule(g.phase==="shop"&&c,"请先进入卡片商店 / Visit a card shop");
    if(a.sell){requireRule(p.cards.includes(a.card),"没有这张卡 / Card not owned");p.cards.splice(p.cards.indexOf(a.card),1);p.points+=Math.floor(c[3]/2);}
    else{requireRule(p.points>=c[3]&&p.cards.length<D.MAX_CARDS,"点券不足或卡包已满 / Not enough points or hand full");p.points-=c[3];addCard(g,p,a.card,rng);}return;
  }
  if(a.type==="lottery"){
    requireRule(g.phase==="lottery"&&Number.isInteger(a.number)&&a.number>=1&&a.number<=36,"请选择有效彩票号码 / Choose a valid ticket");
    requireRule(!Object.hasOwn(g.lottery.tickets,a.number)&&g.visitPurchases<5&&p.cash>=1000,"号码已售、现金不足或达到购买上限 / Sold, insufficient cash or visit limit");
    p.cash-=1000;g.lottery.pool+=1000;g.lottery.tickets[a.number]=id;g.visitPurchases++;return;
  }
  if(a.type==="done"){
    requireRule(["property","end","bank","shop","lottery","rest"].includes(g.phase),"请先完成行动 / Complete your action first");
    if(g.phase==="bank"&&g.remaining>0)walk(g,p,rng);else if(["bank","shop","lottery","property"].includes(g.phase))g.phase="end";else endTurn(g,rng);return;
  }
  throw Error("未知操作 / Unknown action");
}
function apply(g,id,a,rng=Math.random){const draft=structuredClone(g);internalAction(draft,id,a,rng);if(draft.phase!=="over"&&draft.players[draft.current].out)endTurn(draft,rng);draft.revision++;Object.assign(g,draft);return g;}
function snapshot(g,id){
  const s=structuredClone(g);s.players.forEach((p)=>{p.netWorth=assets(g,p);p.cardCount=p.cards.length;p.stockValue=p.shares.reduce((n,q,i)=>n+q*g.stocks[i].price,0);delete p.aiTurn;p.cards=p.id===id?p.cards:null;p.shares=p.id===id?p.shares:null;});
  s.legal={cards:{},canStock:g.phase!=="over"&&!g.players[id]?.out&&dateInfo(g).weekday!==0};
  if(g.players[id])for(const key of new Set(g.players[id].cards))s.legal.cards[key]=cardTargets(g,id,key);
  if(g.players[id])s.buyPrice=purchasePrice(g,g.players[id],g.tiles[g.players[id].pos]);return s;
}
function botAction(g,id,level="normal",rng=Math.random){
  const p=g.players[id],t=g.tiles[p.pos],rich=p.cash>12000*g.index;
  if(g.phase==="roll"&&p.aiTurn!==g.turn){
    p.aiTurn=g.turn;
    if(level==="hard"){
      if(p.god&&!D.gods[p.god.type].good&&cardTargets(g,id,"dismiss").length)return{type:"card",card:"dismiss"};
      const richer=g.players.filter(x=>x.id!==id&&!x.out).sort((a,b)=>b.cash-a.cash)[0];
      if(richer&&richer.cash>p.cash*1.5&&richer.cash>12000&&cardTargets(g,id,"pair").includes(richer.id))return{type:"card",card:"pair",target:richer.id};
      const held=p.shares.indexOf(Math.max(...p.shares));
      if(p.shares[held]>20&&cardTargets(g,id,"red").includes(held)&&g.stocks[held].forceDays===0)return{type:"card",card:"red",target:held};
      if(richer&&richer.cash>20000&&cardTargets(g,id,"tax").includes(richer.id))return{type:"card",card:"tax",target:richer.id};
      if(cardTargets(g,id,"dice").length){
        const choices=Array.from({length:6},(_,i)=>{const step=i+1,tile=g.tiles[(p.pos+p.direction*step+36)%36],deity=g.gods.find(d=>d.pos===tile.id);let score=tile.type==="bank"&&p.cash<7000?12:tile.type==="land"&&tile.owner<0&&p.cash>tile.price+2500?8:tile.type==="land"&&tile.owner===id?5:tile.type==="shop"?3:0;
          if(tile.owner>=0&&tile.owner!==id)score-=rent(g,tile)/500;if(deity)score+=D.gods[deity.type].good?9:-12;return{step,score};}).sort((a,b)=>b.score-a.score);
        if(choices[0].score>=8)return{type:"card",card:"dice",target:choices[0].step};
      }
    }
    if(level!=="easy"){
      const prefer=p.god&&!D.gods[p.god.type].good?"dismiss":p.cards.includes("buy")&&rich?"buy":!p.god&&p.cards.includes("invite")?"invite":"build";
      const targets=cardTargets(g,id,prefer);if(targets.length){const target=prefer==="build"?targets.sort((a,b)=>g.tiles.filter(t=>t.street===g.tiles[b].street&&t.owner===id).length-g.tiles.filter(t=>t.street===g.tiles[a].street&&t.owner===id).length)[0]:targets[0];return{type:"card",card:prefer,target};}
      if(dateInfo(g).weekday!==0&&p.deposit>18000&&p.stockTrades<20){const s=g.stocks.filter(x=>x.limit!==1&&x.price<=p.deposit*.1).sort((a,b)=>a.price/a.history[0]-b.price/b.history[0])[0];if(s)return{type:"stock",stock:s.id,side:"buy",quantity:Math.min(25,Math.floor(p.deposit*.1/s.price)),quote:s.price};}
    }
  }
  if(g.phase==="roll")return{type:"roll",dice:level==="easy"?1:p.vehicle};
  if(g.phase==="bank"){if(p.cash<7000&&p.deposit>5000)return{type:"bank",direction:"withdraw",amount:Math.min(15000,p.deposit)};if(p.cash>26000)return{type:"bank",direction:"deposit",amount:p.cash-18000};return{type:"done"};}
  if(g.phase==="property"){const cost=t.owner<0?purchasePrice(g,p,t):money(t.price*.6*g.index);return p.cash-cost>2500&&activeGod(g,p)!=="bad"?{type:t.owner<0?"buy":"upgrade"}:{type:"done"};}
  if(g.phase==="lottery"&&g.visitPurchases<1&&rich){const nums=Array.from({length:36},(_,i)=>i+1).filter(n=>!Object.hasOwn(g.lottery.tickets,n));if(nums.length)return{type:"lottery",number:nums[rand(rng,nums.length)]};}
  if(g.phase==="shop"&&p.cards.length<7&&p.points>=35)return{type:"shop",card:p.cards.includes("dismiss")?"free":"dismiss"};
  return{type:"done"};
}
module.exports={createGame,apply,snapshot,botAction,dateInfo,cardTargets,assets,value,rent,purchasePrice,attachGod,nextDay,pay,requireRule};
