"use strict";
const D = require("./catan-cities-data");
const sum = a => a.reduce((x,y) => x+y,0);
const fail = (ok, message = "请选择可用操作 / Choose an available action") => { if (!ok) throw Error(message); };
const knights = (g,id) => g.board.vertices.filter(v => v.knight && (id == null || v.knight.owner === id));
const cities = (g,id) => g.board.vertices.filter(v => v.owner === id && v.level === 2);
const empty = v => v.owner < 0 && !v.knight;
const touches = (g,v,id) => v.edges.some(e => g.board.edges[e].owner === id);
const capacity = (g,id,rank) => knights(g,id).filter(v => v.knight.rank === rank).length < 2;
const cost = (r,n) => Array.from({length:8},(_,i) => i === r ? n : 0);
const knightCost = [0,0,1,0,1,0,0,0];
const titles = ["木材 / Lumber","砖 / Brick","羊毛 / Wool","麦 / Grain","矿 / Ore","纸 / Paper","布 / Cloth","币 / Coin"];
const branchName = i => D.branches[i].slice(0,2).join(" / ");
const cardName = key => D.cards[key].slice(2,4).join(" / ");
function initialize(g,rng,shuffle) {
  g.target = 13; g.deck = []; g.board.robber = -1; g.board.citiesKnights = true;
  g.bank = [19,19,19,19,19,12,12,12];
  g.cities = { ship:0, attacked:false, event:null, queue:[], after:"main", rollTotal:null, merchant:null, sequence:0,
    decks: [0,1,2].map(b => shuffle(Object.entries(D.cards).flatMap(([key,c]) => c[0] === b ? Array(c[1]).fill(key) : []),rng)),
    players: g.players.map(() => ({ levels:[0,0,0], cards:[], revealed:[], defenders:0 })),
    fleet:[], crane:0, medicine:0, harbor:[], alchemy:null, diplomacyPending:false };
  g.players.forEach(p => { p.resources = Array(8).fill(0); });
}
function points(g,id) {
  if (!g.cities) return 0;
  const p = g.cities.players[id];
  return p.revealed.length + p.defenders + cities(g,id).filter(v => v.metropolis != null).length * 2 + (g.cities.merchant?.owner === id ? 1 : 0);
}
function rate(g,id,r,base) {
  if (!g.cities) return base;
  const c = g.cities;
  return c.players[id].levels[1] >= 3 && r >= 5 || id === g.current && c.fleet.includes(r) || c.merchant?.owner === id && g.board.tiles[c.merchant.tile].resource === r ? 2 : base;
}
function reachable(g,id,start) {
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    const at = queue.shift(), v = g.board.vertices[at];
    if (at !== start && (v.owner >= 0 && v.owner !== id || v.knight && v.knight.owner !== id)) continue;
    for (const eId of v.edges) {
      const e = g.board.edges[eId], to = e.a === at ? e.b : e.a;
      if (e.owner === id && !seen.has(to)) { seen.add(to); queue.push(to); }
    }
  }
  seen.delete(start); return [...seen];
}
function moveSites(g,id,v) {
  return reachable(g,id,v.id).map(i => g.board.vertices[i]).filter(to => to.owner < 0 && (!to.knight || to.knight.owner !== id && to.knight.rank < v.knight.rank));
}
function relocate(g,vertex,extra = {}) {
  const v = g.board.vertices[vertex], knight = {...v.knight};
  const sites = reachable(g,knight.owner,vertex).filter(i => empty(g.board.vertices[i]));
  delete v.knight;
  if (sites.length) g.cities.queue.unshift({kind:"relocate", player:knight.owner, knight, sites, ...extra});
}
function draw(g,id,b,H) {
  const c = g.cities, key = c.decks[b].shift();
  if (!key) { H.log(g,`${branchName(b)}进步卡暂时用尽 / Progress deck empty`); return; }
  const p = c.players[id];
  if (["printing","constitution"].includes(key)) {
    p.revealed.push(key); H.log(g,`${g.players[id].name} · ${cardName(key)} +1 VP`);
  } else p.cards.push({id:++c.sequence,key});
  if (id !== g.current && p.cards.length > 4) c.queue.unshift({kind:"discardProgress",player:id});
}
function ordered(g) { return g.players.map((_,i) => (g.current+i)%g.players.length); }
function begin(g,items,after="main") {
  g.cities.queue.push(...items); g.cities.after = after; g.phase = "ckChoice"; g.trade = null;
}
function advance(g,H) {
  const c = g.cities;
  while (c.queue.length) {
    const q = c.queue[0];
    if (q.kind === "draw") { c.queue.shift(); draw(g,q.player,q.branch,H); continue; }
    if (!options(g,q.player,H).length) { c.queue.shift(); continue; }
    g.phase = "ckChoice"; return;
  }
  g.phase = c.after;
  if (c.rollTotal != null) { const n = c.rollTotal; c.rollTotal = null; g.phase = "main"; H.finishRoll(g,n); }
}
function attack(g,H) {
  const c = g.cities, strength = g.players.map(p => sum(knights(g,p.id).map(v => v.knight.active ? v.knight.rank : 0)));
  const enemy = g.board.vertices.filter(v => v.level === 2).length, defense = sum(strength);
  H.log(g,`蛮族入侵 / Barbarians: ${enemy} · 防守 / Defense: ${defense} · ${g.players.map((p,i) => `${p.name} ${strength[i]}`).join(" / ")}`);
  if (defense >= enemy) {
    const best = Math.max(...strength), winners = ordered(g).filter(id => strength[id] === best);
    if (winners.length === 1) { c.players[winners[0]].defenders++; H.log(g,`${g.players[winners[0]].name} 保卫卡坦 +1 分 / Defender of Catan +1 VP`); }
    else c.queue.push(...winners.map(player => ({kind:"reward",player})));
  } else {
    const eligible = g.players.filter(p => cities(g,p.id).some(v => v.metropolis == null));
    const lowest = Math.min(...eligible.map(p => strength[p.id]));
    c.queue.push(...ordered(g).filter(id => strength[id] === lowest && eligible.some(p => p.id === id)).map(player => ({kind:"pillage",player})));
  }
  knights(g).forEach(v => { v.knight.active = false; }); c.ship = 0;
  if (!c.attacked) { c.attacked = true; g.board.robber = g.board.tiles.find(t => t.resource === -1).id; }
}
function roll(g,rng,H) {
  const c = g.cities, event = Math.floor(rng()*6);
  c.event = event < 3 ? "ship" : ["science","trade","politics"][event-3];
  c.rollTotal = sum(g.dice); c.after = "main";
  if (event < 3) { c.ship++; H.log(g,`蛮族船前进 / Barbarian ship ${c.ship}/7`); if (c.ship === 7) attack(g,H); }
  else {
    const b = event-3, red = g.dice[1];
    H.log(g,`${branchName(b)} · 红骰 / Red die ${red}`);
    c.queue.push(...ordered(g).filter(id => c.players[id].levels[b] > 0 && red <= c.players[id].levels[b]+1).map(player => ({kind:"draw",player,branch:b})));
  }
  g.phase = "ckChoice"; advance(g,H);
}
function produce(g,number,H) {
  const demand = g.players.map(() => Array(8).fill(0)), before = g.players.map(p => sum(p.resources));
  for (const t of g.board.tiles.filter(t => t.number === number && t.id !== g.board.robber && t.resource >= 0)) for (const i of t.vertices) {
    const v = g.board.vertices[i]; if (v.owner < 0) continue;
    const commodity = ({0:5,2:6,4:7})[t.resource];
    demand[v.owner][t.resource] += v.level === 2 && commodity != null ? 1 : v.level;
    if (v.level === 2 && commodity != null) demand[v.owner][commodity]++;
  }
  g.bank.forEach((n,r) => {
    const wanted = sum(demand.map(d => d[r])), recipients = demand.filter(d => d[r]).length;
    demand.forEach((d,id) => { if (wanted <= n || recipients === 1) H.take(g,g.players[id],r,d[r],"production"); else if (d[r]) H.supplyShortage(g,id,r,d[r],0,"shared"); });
  });
  const items = ordered(g).filter(id => g.cities.players[id].levels[0] >= 3 && sum(g.players[id].resources) === before[id]).map(player => ({kind:"aqueduct",player}));
  if (items.length) { begin(g,items); advance(g,H); }
}
function upgradeChoices(g,id,H,add) {
  const c = g.cities, p = c.players[id], own = cities(g,id);
  if (!own.length) return;
  p.levels.forEach((level,b) => {
    if (level >= 5) return;
    const next = level+1, existing = g.board.vertices.find(v => v.metropolis === b);
    const claim = next >= 4 && (!existing || existing.owner !== id && next > c.players[existing.owner].levels[b]);
    if(next >= 4 && existing?.owner !== id && !own.some(v => v.metropolis == null)) return;
    if (claim && !own.some(v => v.metropolis == null)) return;
    const price = next - (c.crane ? 1 : 0);
    if (g.players[id].resources[5+b] < price) return;
    add(`upgrade:${b}`, `${branchName(b)} ${level} → ${next} · ${price} ${titles[5+b]}`, () => {
      H.pay(g,g.players[id],cost(5+b,price)); if(c.crane) c.crane--; p.levels[b]++;
      H.log(g,`${g.players[id].name} · ${branchName(b)} ${next}`);
      if (claim) { if(existing) delete existing.metropolis; begin(g,[{kind:"metropolis",player:id,branch:b}]); }
    },"improvement");
  });
}
function canPromote(g,id,v,override=false) {
  const k = v.knight;
  return k.rank < 3 && k.promoted !== g.turn && capacity(g,id,k.rank+1) && (override || k.rank === 1 || g.cities.players[id].levels[2] >= 3);
}
function activate(g,v) { if (!v.knight.active) { v.knight.active = true; v.knight.activated = g.turn; } }
function openRoads(g) {
  return g.board.edges.filter(e => e.owner >= 0 && ![e.a,e.b].some(i => {
    const v=g.board.vertices[i];
    return v.knight?.owner===e.owner && v.edges.filter(j=>g.board.edges[j].owner===e.owner).length===1;
  }) && [e.a,e.b].some(i => {
    const v = g.board.vertices[i];
    return v.owner !== e.owner && v.knight?.owner !== e.owner && v.edges.filter(j => g.board.edges[j].owner === e.owner).length === 1;
  }));
}
function cardPlayable(g,id,key,H) {
  const c = g.cities;
  if (key === "taxation") return c.attacked;
  if (key === "engineering") return cities(g,id).some(v => !v.wall) && cities(g,id).filter(v => v.wall).length < 3;
  if (key === "smithing") return knights(g,id).some(v => canPromote(g,id,v));
  if (key === "intrigue") return knights(g).some(v => v.knight.owner !== id && touches(g,v,id));
  if (key === "treason") return knights(g).some(v => v.knight.owner !== id);
  if (key === "espionage") return c.players.some((p,i) => i !== id && p.cards.length);
  if (key === "guild") return g.players.some(p => p.id !== id && H.score(g,p.id) > H.score(g,id) && sum(p.resources));
  if (key === "diplomacy") return openRoads(g).length > 0;
  if (key === "roads") return H.roadSites(g,id).length > 0;
  if (key === "merchant") return g.board.tiles.some(t => t.resource >= 0 && t.vertices.some(i => g.board.vertices[i].owner === id));
  return !["printing","constitution"].includes(key);
}
function play(g,id,key,H) {
  const c = g.cities, p = g.players[id];
  H.log(g,`${p.name} · ${cardName(key)}`);
  if (key === "crane") c.crane++;
  else if (key === "medicine") c.medicine++;
  else if (key === "harbor") c.harbor = g.players.filter(p => p.id !== id).map(p => p.id);
  else if (key === "encouragement") knights(g,id).forEach(v => activate(g,v));
  else if (["mining","irrigation"].includes(key)) {
    const r = key === "mining" ? 4 : 3;
    H.take(g,p,r,g.board.tiles.filter(t => t.resource === r && t.vertices.some(i => g.board.vertices[i].owner === id)).length*2);
  } else if (key === "roads") { g.freeRoads = 2; g.resumePhase = "main"; g.phase = "freeRoads"; }
  else if (key === "wedding" || key === "sabotage") {
    const own = H.score(g,id);
    begin(g,ordered(g).filter(i => i !== id && (key === "wedding" ? H.score(g,i) > own : H.score(g,i) >= own)).map(player => ({kind:"give",player,to:key === "wedding" ? id : -1,count:key === "wedding" ? Math.min(2,sum(g.players[player].resources)) : Math.floor(sum(g.players[player].resources)/2)})));
  } else begin(g,[{kind:key,player:id,remaining:key === "smithing" ? 2 : undefined}],key === "alchemy" ? "roll" : "main");
}
function options(g,id,H) {
  if (!g.cities || !g.players[id] || g.phase === "over") return [];
  const c = g.cities, own = c.players[id], p = g.players[id], out = [];
  const add = (key,label,run,group="choice",position=null,detail="") => out.push({key,label,run,group,position,detail});
  const vertex = (v,label,run,group) => add(`v:${v.id}`,label,run,group,{vertex:v.id});
  const resource = (from,to,callback) => { for(let r=from;r<to;r++) add(`r:${r}`,titles[r],() => callback(r)); };
  const q = g.phase === "ckChoice" ? c.queue[0] : null;
  if (g.phase === "ckChoice") {
    if (!q || q.player !== id) return out;
    const replace = item => c.queue.unshift(item);
    const knightDrop = (rank,active,sites=null) => {
      const vs = sites ? sites.map(i => g.board.vertices[i]).filter(empty) : g.board.vertices.filter(v => empty(v) && touches(g,v,id));
      vs.forEach(v => vertex(v,`放骑士 / Place knight ${rank}`,() => { v.knight = {owner:id,rank,active,activated:g.turn-1,promoted:-1}; }));
    };
    if (q.kind === "discardProgress") own.cards.forEach(card => add(`card:${card.id}`,cardName(card.key),() => { own.cards.splice(own.cards.indexOf(card),1); c.decks[D.cards[card.key][0]].push(card.key); }));
    else if (q.kind === "reward") c.decks.forEach((deck,b) => { if(deck.length) add(`b:${b}`,branchName(b),() => draw(g,id,b,H)); });
    else if (q.kind === "pillage") cities(g,id).filter(v => v.metropolis == null).forEach(v => vertex(v,"降为村庄 / Downgrade",() => { if (H.pieceCount(g,id,1) >= 5) v.fallen = true; v.level = 1; delete v.wall; H.log(g,`${p.name} 一座城市被毁 / loses a city`); }));
    else if (q.kind === "metropolis") cities(g,id).filter(v => v.metropolis == null).forEach(v => vertex(v,`都会 / Metropolis · ${branchName(q.branch)}`,() => { v.metropolis = q.branch; }));
    else if (q.kind === "relocate") q.sites.map(i => g.board.vertices[i]).filter(empty).forEach(v => vertex(v,"迁移骑士 / Relocate knight",() => { v.knight = q.knight; }));
    else if (q.kind === "moveKnight") {
      const from = g.board.vertices[q.from];
      moveSites(g,id,from).forEach(to => vertex(to,`移动 / Move ${q.from+1} → ${to.id+1}${to.knight ? " · 驱逐 / Displace" : ""}`,() => {
        if(to.knight) relocate(g,to.id);
        to.knight = from.knight; delete from.knight; to.knight.active = false;
      }));
      add("cancel","取消移动 / Cancel move",() => {});
    }
    else if (q.kind === "aqueduct") { for(let r=0;r<5;r++) if(g.bank[r]) add(`r:${r}`,titles[r],() => H.take(g,p,r)); }
    else if (q.kind === "give") {
      if (q.count > 0) p.resources.forEach((n,r) => { if(n) add(`r:${r}`,titles[r],() => { p.resources[r]--; if(q.to < 0) g.bank[r]++; else g.players[q.to].resources[r]++; if(q.count > 1) replace({...q,count:q.count-1}); }); });
    } else if (q.kind === "alchemy") {
      for(let a=1;a<=6;a++) for(let b=1;b<=6;b++) add(`dice:${a}:${b}`,`${a} + ${b} = ${a+b}`,() => { c.alchemy=[a,b]; });
    } else if (q.kind === "engineering") cities(g,id).filter(v => !v.wall).forEach(v => vertex(v,"免费城墙 / Free wall",() => {v.wall=true;}));
    else if (q.kind === "invention") {
      g.board.tiles.filter(t => t.number && ![2,6,8,12].includes(t.number) && t.id !== q.first).forEach(t => add(`tile:${t.id}`,`${t.number} · 地块 / Hex ${t.id+1}`,() => {
        if(q.first == null) replace({...q,first:t.id}); else { const other=g.board.tiles[q.first]; [t.number,other.number]=[other.number,t.number]; }
      },"choice",{tile:t.id}));
    } else if (q.kind === "smithing") {
      knights(g,id).filter(v => canPromote(g,id,v)).forEach(v => vertex(v,`晋升 / Promote ${v.knight.rank} → ${v.knight.rank+1}`,() => { v.knight.rank++; v.knight.promoted=g.turn; if(q.remaining>1) replace({...q,remaining:q.remaining-1}); }));
      add("done","完成 / Done",() => {});
    } else if (["guild","espionage","treason"].includes(q.kind)) {
      g.players.filter(x => x.id !== id && (q.kind === "guild" ? H.score(g,x.id)>H.score(g,id) && sum(x.resources) : q.kind === "espionage" ? c.players[x.id].cards.length : knights(g,x.id).length)).forEach(x => add(`player:${x.id}`,x.name,() => {
        replace(q.kind === "guild" ? {kind:"takeCards",player:id,target:x.id,remaining:2} : q.kind === "espionage" ? {kind:"takeProgress",player:id,target:x.id} : {kind:"removeKnight",player:x.id,to:id});
      }));
    } else if(q.kind === "takeCards") g.players[q.target].resources.forEach((n,r) => { if(n) add(`r:${r}`,`${titles[r]} × ${n}`,() => { g.players[q.target].resources[r]--; p.resources[r]++; if(q.remaining>1) replace({...q,remaining:q.remaining-1}); }); });
    else if(q.kind === "takeProgress") c.players[q.target].cards.forEach(card => add(`card:${card.id}`,cardName(card.key),() => { c.players[q.target].cards.splice(c.players[q.target].cards.indexOf(card),1); own.cards.push(card); }));
    else if(q.kind === "removeKnight") knights(g,id).forEach(v => vertex(v,"移除骑士 / Remove knight",() => { const k={...v.knight}; delete v.knight; replace({kind:"replaceRank",player:q.to,rank:k.rank,active:k.active}); }));
    else if(q.kind === "replaceRank") {
      for(let rank=1;rank<=q.rank;rank++) if(capacity(g,id,rank)) add(`rank:${rank}`,`等级 / Rank ${rank}`,() => replace({kind:"replaceKnight",player:id,rank,active:q.active}));
    } else if(q.kind === "replaceKnight") knightDrop(q.rank,q.active);
    else if(q.kind === "merchant") g.board.tiles.filter(t => t.resource>=0 && t.vertices.some(i => g.board.vertices[i].owner===id)).forEach(t => add(`tile:${t.id}`,`${titles[t.resource]} · 地块 / Hex ${t.id+1}`,() => { c.merchant={owner:id,tile:t.id}; },"choice",{tile:t.id}));
    else if(q.kind === "fleet") resource(0,8,r => { if(!c.fleet.includes(r)) c.fleet.push(r); });
    else if(["monopoly","tradeMonopoly"].includes(q.kind)) resource(q.kind === "monopoly" ? 0 : 5,q.kind === "monopoly" ? 5 : 8,r => { g.players.forEach(x => { if(x.id !== id) { const n=Math.min(x.resources[r],q.kind === "monopoly" ? 2 : 1); x.resources[r]-=n; p.resources[r]+=n; } }); });
    else if(q.kind === "intrigue") knights(g).filter(v => v.knight.owner !== id && touches(g,v,id)).forEach(v => vertex(v,"驱逐骑士 / Displace knight",() => relocate(g,v.id)));
    else if(q.kind === "taxation") g.board.tiles.filter(t => t.id !== g.board.robber).forEach(t => add(`tile:${t.id}`,`强盗 / Robber · ${t.id+1}`,() => {
      g.board.robber=t.id;
      const victims=[...new Set(t.vertices.map(i => g.board.vertices[i].owner))].filter(i => i>=0 && i!==id);
      for(const i of victims) { const hand=g.players[i].resources, n=sum(hand); if(!n) continue; let pick=Math.floor(H.random()*n),r=0; while(pick>=hand[r]) pick-=hand[r++]; hand[r]--; p.resources[r]++; H.recordRobbery(g,i,"theft"); }
    },"choice",{tile:t.id}));
    else if(q.kind === "diplomacy") openRoads(g).forEach(e => add(`edge:${e.id}`,`道路 / Road ${e.id+1} · ${g.players[e.owner].name}`,() => { const ownRoad=e.owner===id; e.owner=-1; if(ownRoad) { g.freeRoads=1; g.resumePhase="main"; c.after="freeRoads"; if(!H.roadSites(g,id).length) c.after="main"; c.diplomacyPending=c.after==="freeRoads"; } },"choice",{edge:e.id}));
    else if(q.kind === "harborPay") { for(let r=5;r<8;r++) if(p.resources[r]) add(`r:${r}`,titles[r],() => {p.resources[r]--;g.players[q.to].resources[r]++;p.resources[q.resource]++;g.players[q.to].resources[q.resource]--;}); }
    return out;
  }
  if(id !== g.current || !["roll","main"].includes(g.phase)) return out;
  own.cards.forEach(card => {
    if ((g.phase === "roll") !== (card.key === "alchemy") || !cardPlayable(g,id,card.key,H)) return;
    add(`play:${card.id}`,cardName(card.key),() => {
      own.cards.splice(own.cards.indexOf(card),1); c.decks[D.cards[card.key][0]].push(card.key); play(g,id,card.key,H);
    },"progress",null,D.cards[card.key].slice(4).join(" / "));
  });
  if(g.phase !== "main") return out;
  if(own.cards.length>4) own.cards.forEach(card => add(`discard:${card.id}`,`弃掉 / Discard ${cardName(card.key)}`,() => {own.cards.splice(own.cards.indexOf(card),1);c.decks[D.cards[card.key][0]].push(card.key);},"discard"));
  upgradeChoices(g,id,H,add);
  if(H.affordable(p,knightCost) && capacity(g,id,1)) g.board.vertices.filter(v => empty(v) && touches(g,v,id)).forEach(v => add(`recruit:${v.id}`,"招募骑士 / Recruit · 羊＋矿 / Wool + Ore",() => {H.pay(g,p,knightCost);v.knight={owner:id,rank:1,active:false,activated:-1,promoted:-1};},"recruit",{vertex:v.id}));
  knights(g,id).forEach(v => {
    const k=v.knight;
    if(!k.active && p.resources[3]) add(`activate:${v.id}`,`激活 / Activate · ${v.id+1} · 1 麦 / Grain`,() => {H.pay(g,p,cost(3,1));activate(g,v);},"activate",{vertex:v.id});
    if(canPromote(g,id,v) && H.affordable(p,knightCost)) add(`promote:${v.id}`,`晋升 / Promote ${k.rank} → ${k.rank+1} · 羊＋矿 / Wool + Ore`,() => {H.pay(g,p,knightCost);k.rank++;k.promoted=g.turn;},"promote",{vertex:v.id});
    if(!k.active || k.activated>=g.turn) return;
    if(moveSites(g,id,v).length) add(`move:${v.id}`,`移动骑士 / Move knight · ${v.id+1}`,() => begin(g,[{kind:"moveKnight",player:id,from:v.id}]),"move",{vertex:v.id});
    if(c.attacked && v.tiles.includes(g.board.robber)) add(`chase:${v.id}`,"驱赶强盗 / Chase robber",() => {k.active=false;g.phase="robber";g.resumePhase="main";},"chase",{vertex:v.id});
  });
  if(p.resources[1]>=2 && cities(g,id).filter(v => v.wall).length<3) cities(g,id).filter(v => !v.wall).forEach(v => add(`wall:${v.id}`,"建城墙 / Wall · 2 砖 / Brick",() => {H.pay(g,p,cost(1,2));v.wall=true;},"wall",{vertex:v.id}));
  c.harbor.forEach(target => { for(let r=0;r<5;r++) if(p.resources[r]) add(`harbor:${target}:${r}`,`${g.players[target].name} · 提供 / Give ${titles[r]}`,() => { c.harbor=c.harbor.filter(i=>i!==target); if(sum(g.players[target].resources.slice(5))) begin(g,[{kind:"harborPay",player:target,to:id,resource:r}]); else H.log(g,`${g.players[target].name} 没有商品 / has no commodities`); },"harbor"); });
  return out;
}
function legal(g,id,H) {
  return options(g,id,H).map(({run,...o}) => o);
}
function act(g,id,a,H) {
  if(!g.cities || a.type !== "ck") return false;
  const option = options(g,id,H).find(o=>o.key===a.choice); fail(option);
  if(g.phase === "ckChoice") g.cities.queue.shift();
  option.run();
  if(g.phase === "ckChoice") advance(g,H);
  H.updateAwards(g); return true;
}
function publicState(g,id) {
  if(!g.cities) return null;
  const c=g.cities,q=c.queue[0];
  return {ship:c.ship,attacked:c.attacked,event:c.event,merchant:c.merchant,medicine:c.medicine,deckCounts:c.decks.map(d=>d.length),
    choice:q ? {kind:q.kind,player:q.player,count:q.count,...(q.kind==="moveKnight"?{from:q.from}:{})} : null,
    players:c.players.map((p,i)=>({levels:p.levels,revealed:p.revealed,defenders:p.defenders,count:p.cards.length,cards:i===id||g.phase==="over"?p.cards:null,strength:sum(knights(g,i).map(v=>v.knight.active?v.knight.rank:0))}))};
}
function resetTurn(g) { if(g.cities) Object.assign(g.cities,{fleet:[],crane:0,medicine:0,harbor:[],alchemy:null}); }
function bot(g,id,H) {
  if(!g.cities) return null;
  const choices=options(g,id,H);
  if(g.phase === "ckChoice") return choices.length?{type:"ck",choice:choices[0].key}:null;
  if(g.phase === "main" && id===g.current) {
    const priority={improvement:10,progress:9,discard:1,activate:8,recruit:knights(g,id).length<2?7:0,promote:6,wall:2,chase:4,harbor:3};
    const pick=choices.filter(o=>priority[o.group]>0 && !(o.group==="progress" && ["crane","medicine"].includes(g.cities.players[id].cards.find(c=>`play:${c.id}`===o.key)?.key) && !cities(g,id).length)).sort((a,b)=>priority[b.group]-priority[a.group])[0];
    if(pick) return {type:"ck",choice:pick.key};
  }
  if(g.phase === "roll") { const pick=choices.find(o=>o.group==="progress"); if(pick)return{type:"ck",choice:pick.key}; }
  return null;
}
function validate(g) {
  const c=g.cities,n=g.players.length,int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b,actor=x=>int(x,0,n-1),arr=(x,max)=>Array.isArray(x)&&x.length<=max;
  fail(n>=3&&n<=4&&g.target===13&&g.deck.length===0&&c&&int(g.turn,0,10000000)&&g.board.tiles.length===19);
  fail(int(c.ship,0,6)&&typeof c.attacked==="boolean"&&[null,"ship","science","trade","politics"].includes(c.event));
  fail(arr(c.players,n)&&c.players.length===n&&arr(c.decks,3)&&c.decks.length===3&&int(c.sequence,0,10000000));
  const pool=[],ids=[];
  c.decks.forEach((deck,b)=>{fail(arr(deck,18)&&deck.every(k=>D.cards[k]?.[0]===b));pool.push(...deck);});
  c.players.forEach(p=>{fail(arr(p.levels,3)&&p.levels.length===3&&p.levels.every(x=>int(x,0,5))&&arr(p.cards,54)&&arr(p.revealed,2)&&int(p.defenders,0,100000));p.cards.forEach(card=>{fail(card&&int(card.id,1,c.sequence)&&D.cards[card.key]&&!['printing','constitution'].includes(card.key));pool.push(card.key);ids.push(card.id);});fail(p.revealed.every(k=>['printing','constitution'].includes(k)));pool.push(...p.revealed);});
  fail(new Set(ids).size===ids.length);
  for(const [key,card] of Object.entries(D.cards))fail(pool.filter(k=>k===key).length===card[1]);
  fail(g.bank.every((x,r)=>int(x,0,r<5?19:12))&&g.players.every(p=>p.resources.every((x,r)=>int(x,0,r<5?19:12))));
  g.bank.forEach((x,r)=>fail(x+sum(g.players.map(p=>p.resources[r]))===(r<5?19:12)));
  const vertex=i=>int(i,0,g.board.vertices.length-1),tile=i=>int(i,0,g.board.tiles.length-1);
  const checkKnight=k=>fail(k&&actor(k.owner)&&int(k.rank,1,3)&&typeof k.active==='boolean'&&int(k.activated,-1,g.turn)&&int(k.promoted,-1,g.turn));
  const metros=[];
  g.board.vertices.forEach(v=>{if(v.knight){fail(v.owner<0);checkKnight(v.knight);}if(v.wall)fail(v.level===2);if(v.metropolis!=null){fail(int(v.metropolis,0,2)&&v.level===2&&c.players[v.owner].levels[v.metropolis]>=4);metros.push(v.metropolis);}if(v.fallen)fail(v.level===1);});
  fail(new Set(metros).size===metros.length);
  for(let i=0;i<n;i++){for(let rank=1;rank<=3;rank++)fail(knights(g,i).filter(v=>v.knight.rank===rank).length<=2);fail(cities(g,i).filter(v=>v.wall).length<=3);}
  fail(c.merchant===null||actor(c.merchant.owner)&&tile(c.merchant.tile)&&g.board.tiles[c.merchant.tile].resource>=0);
  fail(arr(c.fleet,8)&&c.fleet.every(x=>int(x,0,7))&&int(c.crane,0,2)&&int(c.medicine,0,2)&&arr(c.harbor,3)&&c.harbor.every(actor));
  fail(c.alchemy===null||arr(c.alchemy,2)&&c.alchemy.length===2&&c.alchemy.every(x=>int(x,1,6)));
  fail(c.rollTotal===null||int(c.rollTotal,2,12));fail(['roll','main','freeRoads'].includes(c.after));
  fail(c.diplomacyPending==null||typeof c.diplomacyPending==='boolean');if(c.diplomacyPending)fail(g.phase==='freeRoads'&&g.freeRoads===1);
  const kinds=['draw','discardProgress','reward','pillage','metropolis','relocate','moveKnight','aqueduct','give','alchemy','engineering','invention','smithing','guild','espionage','treason','takeCards','takeProgress','removeKnight','replaceRank','replaceKnight','merchant','fleet','monopoly','tradeMonopoly','intrigue','taxation','diplomacy','harborPay'];
  fail(arr(c.queue,20));c.queue.forEach(q=>{fail(q&&kinds.includes(q.kind)&&actor(q.player));if(q.branch!=null)fail(int(q.branch,0,2));if(q.target!=null)fail(actor(q.target));if(q.to!=null)fail(q.to===-1||actor(q.to));if(q.count!=null)fail(int(q.count,0,100));if(q.remaining!=null)fail(int(q.remaining,1,2));if(q.first!=null)fail(tile(q.first));if(q.rank!=null)fail(int(q.rank,1,3));if(q.resource!=null)fail(int(q.resource,0,4));if(q.knight)checkKnight(q.knight);if(q.kind==='relocate')fail(arr(q.sites,300)&&q.sites.every(vertex)&&q.knight);});
  c.queue.forEach(q=>{
    if(['draw','metropolis'].includes(q.kind)) fail(int(q.branch,0,2));
    if(['takeCards','takeProgress'].includes(q.kind)) fail(actor(q.target)&&q.target!==q.player);
    if(['smithing','takeCards'].includes(q.kind)) fail(int(q.remaining,1,2));
    if(q.kind==='give') fail((q.to===-1||actor(q.to))&&int(q.count,0,100));
    if(['removeKnight','harborPay'].includes(q.kind)) fail(actor(q.to)&&q.to!==q.player);
    if(q.kind==='harborPay') fail(int(q.resource,0,4)&&g.players[q.to].resources[q.resource]>0);
    if(['replaceRank','replaceKnight'].includes(q.kind)) fail(int(q.rank,1,3)&&typeof q.active==='boolean');
    if(q.kind==='relocate') fail(q.knight.owner===q.player);
    if(q.kind==='moveKnight') fail(vertex(q.from)&&g.board.vertices[q.from].knight?.owner===q.player&&g.board.vertices[q.from].knight.active&&g.board.vertices[q.from].knight.activated<g.turn);
  });
  fail(g.phase!=='ckChoice'||c.queue.length>0);
}
module.exports={initialize,points,rate,roll,produce,legal,act,publicState,resetTurn,bot,knights,cities,titles,resources:D.resources,validate};
