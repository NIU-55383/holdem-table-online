"use strict";
window.CatanCitiesUI = (() => {
  const D=window.CatanCitiesData, B=window.CatanBoard, esc=B.escape;
  const art=(name,cls="")=>name==="cloth"?window.CatanScenarioUI.art("cloth",cls):`<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><use href="catan-cities-art.svg#${name}"/></svg>`;
  const info={
    eventDie:["事件骰 / Event die","与黄骰、红骰一起掷。六个面中，三个是蛮族船：船前进 1 格；另外三个分别是科学（绿）、贸易（黄）、政治（蓝）。掷到彩色城堡时，所有玩家检查自己的对应改良等级：至少一级，且红骰点数不大于等级 + 1，就各抽一张该类进步卡。先结算事件，再按两颗数字骰之和生产资源或处理七点。","Roll it with the yellow and red dice. Three faces show the barbarian ship: advance the fleet 1 space. The other faces are Science (green), Trade (yellow) and Politics (blue). For a colored castle, every player with at least level 1 in that branch draws one matching progress card if the red die is no greater than their level + 1. Resolve the event before production or seven, which use the sum of the two number dice."],
    barbarians:["蛮族船 / Barbarian ship","每位玩家掷事件骰时，若出现蛮族船，船前进 1 格；累计前进 7 格便入侵。剩余格数不是剩余回合数。","Whenever any player rolls the ship on the event die, the fleet advances 1 space. It attacks after 7 advances. The remaining spaces are not a countdown of turns."],
    paper:["纸 / Paper","森林生产时，每座相邻城市（含都会）领 1 木材 + 1 纸；村庄只领木材。纸用于科学改良，也可通过交易获得。","When a forest produces, each adjacent city (including a metropolis) receives 1 lumber + 1 paper; settlements receive only lumber. Paper pays for science improvements and can also be obtained through trading."],
    cloth:["布 / Cloth","牧场生产时，每座相邻城市（含都会）领 1 羊毛 + 1 布；村庄只领羊毛。布用于贸易改良，也可通过交易获得。","When a pasture produces, each adjacent city (including a metropolis) receives 1 wool + 1 cloth; settlements receive only wool. Cloth pays for trade improvements and can also be obtained through trading."],
    coin:["币 / Coin","山地生产时，每座相邻城市（含都会）领 1 矿石 + 1 币；村庄只领矿石。币用于政治改良，也可通过交易获得。","When a mountain produces, each adjacent city (including a metropolis) receives 1 ore + 1 coin; settlements receive only ore. Coin pays for politics improvements and can also be obtained through trading."],
    knight:["骑士 / Knights","已激活骑士按等级提供 1、2、3 点防守力，抵御蛮族；骑士不生产资源、不加分。招募或晋升花羊毛 + 矿石，激活花 1 麦子。新激活的骑士能防守，但须等下一个自己的回合才能移动或驱赶。之后可沿自己的道路移动、驱逐较弱骑士，或驱赶相邻强盗并偷一张；行动后失活，同一回合不能再行动。","Active knights contribute strength 1, 2 or 3 against barbarians; they produce nothing and score no VP. Recruit or promote for wool + ore; activate for 1 grain. Newly activated knights can defend but must wait until your next turn to move or chase. They may then move along your roads, displace a weaker knight, or chase an adjacent robber and steal a card. Acting deactivates them; they cannot act again that turn."],
    merchant:["商人 / Merchant","商人外圈颜色表示归属。控制者得 1 分，并可将该地块的资源按 2:1 与银行交换。打出商人进步卡，把它放到自己建筑旁的资源地块；别人打出商人卡可以夺走它，原主人的加分和兑换能力随之失去。","The merchant's ring shows its owner. Its controller gains 1 VP and may trade this hex's resource with the bank at 2:1. Play a Merchant card to place it beside your building. Another player's Merchant card can take it, removing your point and trading benefit."],
    wall:["城墙 / City wall","每道城墙把掷七时的免弃牌上限提高 2 张：7 → 9 → 11 → 13。每城最多一道，每人最多三道。城墙不加分，也不抵挡蛮族；城市降级时一并移除。","Each wall raises your hand limit before discarding on seven by 2: 7 → 9 → 11 → 13. One per city, up to three per player. Walls score no VP and do not stop barbarians; they are removed when their city is downgraded."],
    metropolis:["都会 / Metropolis","都会是额外加 2 分的城市，共值 4 分，生产不变，不会被蛮族降级。每条改良路线首个升到四级者得到都会。若对手比你先将同一项改良升到五级，就会拿走你的都会标记和额外 2 分，把标记放到自己的城市上；你的城市仍归你。你先升到五级，则能保住这类都会，别人之后升到五级也抢不走。","A metropolis is a city worth 2 extra VP, for 4 total. Its production is unchanged and barbarians cannot downgrade it. The first player to level 4 in a branch claims it. If an opponent reaches level 5 in that same branch before you, they move your metropolis marker to their own city and take its 2 bonus VP from you. Your city remains yours. If you reach level 5 first, you keep that metropolis even when others later reach level 5."]
  };
  const eventFaces={ship:{label:["蛮族","Ship"],icon:"barbarians",info:"barbarians"}};
  D.branches.forEach(([zh,en,,color])=>{
    const key=en.toLowerCase(),name=`event-${key}`;
    eventFaces[key]={label:[zh,en],icon:"metropolis",info:name,color};
    info[name]=[`${zh}事件 / ${en} event`,`所有玩家检查${zh}改良等级。至少一级，且红骰点数不大于改良等级 + 1，就抽一张${zh}进步卡。一级对应红骰 1–2，二级对应 1–3，依此类推；没有该类改良则不抽牌。此骰面出现概率为 1/6。`,`Every player checks their ${en.toLowerCase()} improvement. With at least level 1, draw one ${en.toLowerCase()} progress card if the red die is no greater than your level + 1. Level 1 qualifies on red 1–2, level 2 on 1–3, and so on. No improvement means no card. This face has a 1/6 chance.`];
  });
  const abilities=[
    ["三级获得水渠：非七点的生产中，若你完全没有领到资源或商品，可任选 1 张普通资源。","At level 3, Aqueduct gives you 1 normal resource of your choice when a non-seven production gives you no resources or commodities."],
    ["三级可将任意两张同种商品（纸、布或币），换银行一张资源或商品；普通资源不会因此变成 2:1。","At level 3, trade 2 identical commodities (paper, cloth or coin) for 1 bank resource or commodity. This does not give normal resources a 2:1 rate."],
    ["三级解锁三级骑士的晋升资格；不会自动升级骑士，晋升仍需支付 1 羊毛 + 1 矿石。三级骑士激活后提供 3 点防守力。","Level 3 unlocks promotion to mighty (rank-3) knights. It does not promote them automatically: still pay 1 wool + 1 ore. An active mighty knight provides 3 defense strength."]
  ];
  D.branches.forEach(([zh,en,resource],i)=>{
    const commodity=["纸","布","币"][i];
    info[en.toLowerCase()]=[`${zh}改良 / ${en} improvements`,
      `用${commodity}提升${zh}。升到几级就支付几张${commodity}，最多五级，且必须拥有城市。${abilities[i][0]}达到一级起，事件骰出现对应颜色、红骰不大于改良等级 + 1 时，可抽该类进步卡；等级越高，可抽牌的红骰点数越多。首个四级者可在一座空闲城市放置都会，额外加 2 分。若对手比你先将同一项改良升到五级，就会拿走你的都会标记和额外 2 分，把标记放到自己的城市上；你的城市仍归你。你先升到五级，则能保住这类都会，别人之后升到五级也抢不走。`,
      `Spend ${resource} to improve ${en.toLowerCase()}. Pay the new level in ${resource}, up to level 5; you must own a city. ${abilities[i][1]} From level 1, the matching event color and a red die no greater than your level + 1 give you a progress card. Higher levels qualify on more red-die results. First to level 4 may place the metropolis on a free city for +2 VP. If an opponent reaches level 5 in that same branch before you, they move your metropolis marker to their own city and take its 2 bonus VP from you. Your city remains yours. If you reach level 5 first, you keep that metropolis even when others later reach level 5.`];
  });
  function eventDie(event){
    const face=eventFaces[event],label=face?face.label.join(" / "):"未掷骰 / Not rolled";
    return `<button type="button" class="cities-event-die" data-event="${face?event:""}" data-cities-info="${face?.info||"eventDie"}" title="事件骰 / Event die · ${label}" aria-label="事件骰 / Event die · ${label} · 说明 / Info"><span class="die" aria-hidden="true"${face?.color?` style="color:${face.color}"`:""}>${face?art(face.icon):"?"}</span><span class="cities-event-caption" aria-hidden="true">${face?face.label[0]:"事件骰"}<small>${face?face.label[1]:"Event die"}</small></span></button>`;
  }
  const infoButton=(name,cls="")=>`<button type="button" class="cities-info-button ${cls}" data-cities-info="${name}" title="${info[name][0]}" aria-label="${info[name][0]} · 说明 / Info">${art(name)}</button>`;
  const helpButton=name=>`<button type="button" class="cities-info-button cities-action-help" data-cities-info="${name}" title="${info[name][0]}" aria-label="${info[name][0]} · 说明 / Info"><i data-lucide="circle-help" aria-hidden="true"></i></button>`;
  function showInfo(name){
    const entry=info[name];if(!entry)return;
    let dialog=document.getElementById("citiesInfoDialog");
    if(!dialog){dialog=document.createElement("dialog");dialog.id="citiesInfoDialog";dialog.className="cities-dialog cities-info-dialog";dialog.setAttribute("aria-labelledby","citiesInfoTitle");dialog.innerHTML='<div class="dialog-heading"><h2 id="citiesInfoTitle"></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div class="cities-info-body" tabindex="0"></div>';document.body.append(dialog);dialog.querySelector("[data-close]").onclick=()=>dialog.close();}
    const paragraphs=[entry.slice(1)];
    if(name==="barbarians")paragraphs.push(D.rules.find(([title])=>title==="蛮族入侵 / Barbarian Attack").slice(1));
    dialog.querySelector("h2").textContent=entry[0];dialog.querySelector(".cities-info-body").innerHTML=paragraphs.map(([zh,en])=>`<p>${esc(zh)}<small>${esc(en)}</small></p>`).join("");
    if(!dialog.open)dialog.showModal();dialog.querySelector(".cities-info-body").scrollTop=0;
  }
  function explain(e){const target=e.target.closest("[data-cities-info]");if(!target)return;if(e.type==="keydown"&&(!["Enter"," "].includes(e.key)||target.tagName.toLowerCase()==="button"))return;e.preventDefault();e.stopImmediatePropagation();showInfo(target.dataset.citiesInfo);}
  document.addEventListener("click",explain,true);document.addEventListener("keydown",explain,true);
  const groups={improvement:["城市改良","Improvements","metropolis"],recruit:["招募","Recruit","knight"],activate:["激活","Activate","knight"],promote:["晋升","Promote","knight"],move:["移动骑士","Move knight","knight"],chase:["驱赶强盗","Chase robber","knight"],wall:["城墙","Walls","wall"],harbor:["商业港","Commercial Harbor","coin"],discard:["弃进步卡","Discard progress","paper"]};
  const choices={discardProgress:["进步卡超过上限，选择弃掉一张","Above the hand limit: discard a progress card"],reward:["防守贡献并列，选择进步卡类别","Tied defense: choose a progress deck"],pillage:["防守失败，选择降级的城市","Defense failed: choose a city to downgrade"],metropolis:["选择都会所在的城市","Choose the metropolis city"],relocate:["选择骑士迁移的位置","Choose where to relocate your knight"],aqueduct:["水渠：任选一张资源","Aqueduct: choose one resource"],give:["选择要交出的物资","Choose cards to give up"],alchemy:["指定黄骰与红骰","Choose yellow and red dice"],engineering:["选择城市建墙","Choose a city for a wall"],invention:["依次选择两枚数字","Select two number discs in order"],smithing:["选择要晋升的骑士","Choose a knight to promote"],guild:["选择分数更高的对手","Choose a higher-scoring opponent"],espionage:["选择查看谁的进步卡","Choose whose progress cards to inspect"],treason:["选择一名对手","Choose an opponent"],takeCards:["选择拿走的物资","Choose cards to take"],takeProgress:["选择拿走的进步卡","Choose a progress card to take"],removeKnight:["选择移除一名骑士","Choose a knight to remove"],replaceRank:["选择新骑士的等级","Choose the replacement rank"],replaceKnight:["放置替代骑士","Place the replacement knight"],merchant:["选择商人地块","Choose the merchant hex"],fleet:["选择本回合 2:1 兑换的物资","Choose this turn's 2:1 item"],monopoly:["选择垄断资源","Choose a resource"],tradeMonopoly:["选择垄断商品","Choose a commodity"],intrigue:["选择要驱逐的骑士","Choose a knight to displace"],taxation:["移动强盗，从每名相邻对手各偷一张","Move the robber; steal once from each adjacent opponent"],diplomacy:["选择开放道路","Choose an open road"],harborPay:["商业港：选择交换的商品","Commercial Harbor: choose a commodity to exchange"]};
  function buildingCosts() {
    const rows=[
      ["road","道路 / Road",[0,1]], ["settlement","村庄 / Settlement",[0,1,2,3]],
      ["city","升级城市 / Upgrade city",[3,3,4,4,4]], ["wall","城墙 / City wall",[1,1]],
      ["recruit","招募骑士 / Recruit knight",[2,4]], ["activate","激活骑士 / Activate knight",[3]],
      ["promote","晋升骑士 / Promote knight",[2,4]],
      ...D.branches.map((b,i)=>[b[1].toLowerCase(),`${b[0]} / ${b[1]}`,[i+5]])
    ];
    const names=["木材 / Lumber","砖块 / Brick","羊毛 / Wool","麦子 / Grain","矿石 / Ore","纸 / Paper","布 / Cloth","币 / Coin"];
    return `<section id="citiesBuildingCosts"><h3>建造费用 <small>Build costs</small></h3><div class="building-costs">${rows.map(([key,label,resources])=>{
      const improvement=resources[0]>=5,description=resources.map(r=>names[r]).join(", ")+(improvement?" × 1–5":"");
      return `<div class="cost-row" data-cost="${key}"><span>${label}</span><div class="cost-resources" role="group" aria-label="${esc(description)}" title="${esc(description)}">${resources.map(r=>r>=5?infoButton(D.resources[r]):`<svg viewBox="0 0 48 48" aria-hidden="true">${B.icon(D.resources[r])}</svg>`).join("")}${improvement?"<b>× 1–5</b>":""}</div></div>`;
    }).join("")}</div><p>城市改良升至第几级，就支付几张对应商品。<small>Pay the new level in the matching commodity for each city improvement.</small></p><p>每人最多 5 个村庄、4 座城市、15 条道路、3 道城墙；骑士每级各 2 名。<small>Per player: 5 settlements, 4 cities, 15 roads, 3 walls and 2 knights of each rank.</small></p></section>`;
  }
  function rules(focusCosts=false) {
    let dialog=document.getElementById("citiesRules");
    if(!dialog){dialog=document.createElement("dialog");dialog.id="citiesRules";dialog.dataset.rulesDialog="";dialog.innerHTML='<div class="dialog-heading"><h2>城市与骑士<small>Cities &amp; Knights</small></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div data-rules-body></div>';document.body.append(dialog);dialog.querySelector("[data-close]").onclick=()=>dialog.close();}
    dialog.querySelector("h2").innerHTML=focusCosts?"建造费用<small>城市与骑士 / Cities &amp; Knights · Build costs</small>":"城市与骑士<small>Cities &amp; Knights</small>";
    dialog.querySelector("[data-rules-body]").innerHTML=buildingCosts()+D.rules.map(([title,zh,en])=>`<section><h3>${esc(title)}</h3><p>${esc(zh)}<small>${esc(en)}</small></p></section>`).join("")+`<h3>进步卡清单 / Progress cards</h3><div class="cities-rule-cards">${Object.values(D.cards).map(c=>`<section style="--branch:${D.branches[c[0]][3]}"><h4>${esc(c[2])} / ${esc(c[3])} × ${c[1]}</h4><p>${esc(c[4])}<small>${esc(c[5])}</small></p></section>`).join("")}</div><a href="${D.source}" target="_blank" rel="noopener">官方 2025 规则 / Official 2025 Rulebook</a>`;
    window.BoardGameRules.prepare(dialog); dialog.showModal();dialog.querySelector("[data-rules-body]").scrollTop=0;
  }
  function mount(send,redraw) {
    choices.moveKnight=["选择骑士目的地","Choose the knight's destination"];
    let group="",revision="",room=null,moveSource=null;
    const panel=document.createElement("section");panel.id="citiesPanel";panel.hidden=true;document.getElementById("scenarioPanel").before(panel);
    const fleet=document.createElement("button");fleet.id="citiesFleet";fleet.type="button";fleet.hidden=true;fleet.dataset.citiesInfo="barbarians";
    fleet.innerHTML='<span class="cities-fleet-heading"><span><strong>蛮族船</strong><small>Barbarian ship</small></span><span class="cities-fleet-state" aria-live="polite"></span><i data-lucide="circle-help" aria-hidden="true"></i></span><span class="cities-fleet-route" aria-hidden="true">'+Array.from({length:8},(_,i)=>`<span class="cities-fleet-stop" data-step="${i}"><b>${i}</b></span>`).join("")+art("barbarians","cities-fleet-ship")+'</span><span class="cities-fleet-ends" aria-hidden="true"><span>起点 / Start</span><span>入侵 / Attack</span></span>';
    document.getElementById("boardViewport").before(fleet);
    const dialog=document.createElement("dialog");dialog.className="cities-dialog";dialog.innerHTML='<div class="dialog-heading"><h2></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><p></p><div class="cities-dialog-actions"><button data-play class="primary">使用 / Play</button></div>';document.body.append(dialog);
    dialog.querySelector("[data-close]").onclick=()=>dialog.close();
    const available=()=>room?.game?.legal.citiesKnights||[];
    const blocked=()=>!room || room.control?.paused || panel.dataset.pending==="true";
    function selectGroup(next) {
      group=next;render(room,panel.dataset.pending==="true");redraw();
    }
    function choose(key){const o=available().find(x=>x.key===key);if(o)confirm(o);}
    function confirm(o) {
      if(blocked())return;
      dialog.querySelector("h2").textContent=o.label;
      dialog.querySelector("p").textContent=o.detail||"";
      const key=revision;
      dialog.querySelector("[data-play]").onclick=()=>{if(key===revision && available().some(x=>x.key===o.key)&&!blocked())send({type:"ck",choice:o.key});dialog.close();};
      dialog.showModal();
    }
    panel.onclick=e=>{
      const b=e.target.closest("button");if(!b||b.disabled)return;
      if(b.dataset.group){selectGroup(group===b.dataset.group?"":b.dataset.group);return;}
      if(b.hasAttribute("data-cities-rules")){rules();return;}
      if(b.dataset.card){const card=D.cards[b.dataset.card],o=available().find(x=>x.key===b.dataset.choice);if(o)confirm(o);else{dialog.querySelector("h2").textContent=card.slice(2,4).join(" / ");dialog.querySelector("p").textContent=card.slice(4).join(" / ");dialog.querySelector("[data-play]").disabled=true;dialog.showModal();}return;}
      const o=available().find(x=>x.key===b.dataset.choice);if(o){if(o.group==="choice")send({type:"ck",choice:o.key});else confirm(o);}
    };
    dialog.addEventListener("close",()=>{dialog.querySelector("[data-play]").disabled=false;});
    function boardClick(e) {
      const target=e.target.closest("[data-ck-choice]");if(!target||blocked())return;
      if(e.type==="keydown" && !["Enter"," "].includes(e.key))return;
      e.preventDefault();e.stopImmediatePropagation();const o=available().find(x=>x.key===target.dataset.ckChoice);
      if(!o)return;
      if(o.group==="move")moveSource=o.position.vertex;
      if(["wall","recruit","activate","promote","move"].includes(o.group) || ["engineering","pillage","smithing","moveKnight","relocate"].includes(room.game.citiesKnights.choice?.kind))send({type:"ck",choice:o.key});
      else confirm(o);
    }
    document.getElementById("board").addEventListener("click",boardClick,true);document.getElementById("board").addEventListener("keydown",boardClick,true);
    function render(r,pending=false){
      room=r;const g=r?.game,c=g?.citiesKnights;panel.hidden=!c;fleet.hidden=!c;panel.dataset.pending=String(pending);if(!c)return;
      const resolving=["pillage","reward"].includes(c.choice?.kind),position=resolving?7:c.ship,remaining=7-position;
      const zh=resolving?"蛮族入侵，正在结算":`距入侵还差 ${remaining} 格`,en=resolving?"Barbarian attack: resolving":`${remaining} ${remaining===1?"advance":"advances"} until attack`;
      if(fleet.dataset.position!==String(position)||fleet.dataset.resolving!==String(resolving)){
        fleet.dataset.position=String(position);fleet.dataset.urgent=String(remaining<=2);fleet.dataset.resolving=String(resolving);fleet.style.setProperty("--fleet-position",position);
        fleet.setAttribute("aria-label",`蛮族船 / Barbarian ship · ${zh} / ${en} · 规则 / Rules`);
        fleet.querySelector(".cities-fleet-state").innerHTML=`<strong>${zh}</strong><small>${en}</small>`;
        fleet.querySelectorAll("[data-step]").forEach(stop=>{stop.classList.toggle("passed",Number(stop.dataset.step)<position);stop.classList.toggle("current",Number(stop.dataset.step)===position);});
      }
      if(c.choice?.kind==="moveKnight"){if(c.choice.from!=null)moveSource=c.choice.from;}else if(!pending)moveSource=null;
      const key=`${r.code}:${r.you}:${g.revision}`;if(key!==revision){revision=key;group="";if(dialog.open)dialog.close();}
      const all=available(), q=c.choice, opts=q?.player===r.you?all:all.filter(o=>o.group===group);
      const heading=q?choices[q.kind]||[q.kind,q.kind]:groups[group]?.slice(0,2);
      const disabled=pending||r.control?.paused;
      const iconEvent=c.event==="ship"?"蛮族船 / Barbarians":({science:"科学 / Science",trade:"贸易 / Trade",politics:"政治 / Politics"})[c.event]||"事件骰 / Event die";
      const players=c.players.map((p,i)=>{
        const levels=p.levels.map((n,b)=>{
          const [zh,en]=D.branches[b],label=`${zh}改良等级：${n} / 5 · ${en} level: ${n} / 5`;
          return `<span class="cities-level" title="${label}" aria-label="${label}">${infoButton(en.toLowerCase())}<span class="cities-level-value" aria-hidden="true"><b>${n}级</b><small>Lv ${n}</small></span></span>`;
        }).join("");
        return `<div class="cities-player"><span style="border-left:3px solid ${B.COLORS[i]};padding-left:6px">${esc(g.players[i].name)}${p.defenders?` · +${p.defenders} VP`:""}</span>${levels}<span class="cities-strength" title="已激活骑士强度 / Active knight strength" aria-label="已激活骑士强度 / Active knight strength: ${p.strength}">${infoButton("knight")}<b>${p.strength}</b></span></div>`;
      }).join("");
      panel.innerHTML=`<div class="cities-status"><h3 class="cities-heading">城市与骑士 <small>Cities &amp; Knights</small><button class="icon-button" data-cities-rules title="规则 / Rules" aria-label="规则 / Rules"><i data-lucide="book-open" aria-hidden="true"></i></button></h3><div class="cities-event">${iconEvent}<small>${c.attacked?"强盗已入场 / Robber active":"首次入侵前无强盗 / Robber waits for first attack"}</small></div>${players}</div>
        <div class="cities-progress">${c.players[r.you].cards.map(card=>{const d=D.cards[card.key],o=all.find(x=>x.key===`play:${card.id}`);return `<button data-card="${card.key}" data-choice="${o?.key||""}" style="--branch:${D.branches[d[0]][3]}" ${disabled?"disabled":""}>${esc(d[2])}<small>${esc(d[3])}${o?" · 可用 / Ready":""}</small></button>`;}).join("")}</div>
        <div class="cities-controls">${Object.entries(groups).filter(([key])=>!["wall","recruit","activate","promote","improvement","move"].includes(key)&&all.some(o=>o.group===key)).map(([key,n])=>`<button data-group="${key}" class="secondary ${group===key?"selected":""}" ${disabled?"disabled":""}>${art(n[2])}<span>${n[0]}<small>${n[1]}</small></span></button>`).join("")}</div>
        ${heading?`<div class="cities-choice" aria-live="polite"><h3>${esc(heading.join(" / "))}${q?` · ${esc(g.players[q.player].name)}`:""}</h3><div class="cities-choice-list">${opts.filter(o=>!o.position).map(o=>`<button data-choice="${esc(o.key)}" ${disabled?"disabled":""}>${esc(o.label)}</button>`).join("")}</div></div>`:""}`;
      window.lucide?.createIcons();
    }
    function overlay(board){
      const svg=board.querySelector("svg");if(!svg)return;svg.querySelector(".cities-overlay")?.remove();
      if(!room?.game?.citiesKnights)return;
      const g=room.game, c=g.citiesKnights, q=c.choice;
      const opts=blocked()?[]:q?.player===room.you?available():available().filter(o=>o.group===group);
      const pieces=g.board.vertices.filter(v=>v.knight||v.wall||v.metropolis!=null).map(v=>{
        const k=v.knight;
        if(k)return `<g><circle cx="${v.x}" cy="${v.y-4}" r="18" fill="${k.active?"#fff0ad":"#b4c6c8"}" stroke="${B.COLORS[k.owner]}" stroke-width="3"/><use href="catan-cities-art.svg#knight" x="${v.x-16}" y="${v.y-25}" width="32" height="32" style="color:${B.COLORS[k.owner]}"/><text class="cities-knight-number" x="${v.x}" y="${v.y+13}" text-anchor="middle">${k.rank}</text><title>${k.rank} · ${k.active?"已激活 / Active":"未激活 / Inactive"}</title></g>`;
        return `${v.wall?`<path d="M${v.x-17} ${v.y+4}h34" stroke="#f7e4a0" stroke-width="8"/><path d="M${v.x-17} ${v.y+4}h34" stroke="#658c9d" stroke-width="4"/>`:""}${v.metropolis!=null?`<use href="catan-cities-art.svg#metropolis" x="${v.x-19}" y="${v.y-30}" width="38" height="38" style="color:${B.COLORS[v.owner]}"/>`:""}`;
      }).join("");
      const merchant=c.merchant?(()=>{const t=g.board.tiles[c.merchant.tile];return `<g data-cities-info="merchant" role="button" tabindex="0" aria-label="商人说明 / About the merchant"><circle cx="${t.x+23}" cy="${t.y-22}" r="18" fill="transparent"/><circle cx="${t.x+23}" cy="${t.y-22}" r="14" fill="${B.COLORS[c.merchant.owner]}" stroke="#2d5365" stroke-width="2"/><use href="catan-cities-art.svg#merchant" x="${t.x+10}" y="${t.y-35}" width="26" height="26"/></g>`;})():"";
      const targets=opts.filter(o=>o.position).map(o=>{
        const pos=o.position,t=pos.tile!=null?g.board.tiles[pos.tile]:pos.vertex!=null?g.board.vertices[pos.vertex]:(()=>{const e=g.board.edges[pos.edge],a=g.board.vertices[e.a],b=g.board.vertices[e.b];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};})();
        return `<g class="cities-board-target ${o.group==="move"?"cities-knight-move-target":""}" data-ck-choice="${esc(o.key)}" role="button" tabindex="0" aria-label="${esc(o.label)}">${o.group==="move"?`<circle cx="${t.x}" cy="${t.y-4}" r="22" fill="transparent" stroke="#ffe17a" stroke-width="4"/>`:`<circle cx="${t.x}" cy="${t.y}" r="17" fill="#fff5c9" stroke="#1f6b85" stroke-width="3"/><text x="${t.x}" y="${t.y+5}" font-size="15" text-anchor="middle" fill="#20516a">+</text>`}<title>${esc(o.label)}</title></g>`;
      }).join("");
      const source=q?.kind==="moveKnight"&&q.player===room.you&&moveSource!=null&&opts.some(o=>o.key==="cancel")?g.board.vertices[moveSource]:null;
      const cancel=source?`<g class="cities-board-target cities-knight-selected" data-ck-choice="cancel" role="button" tabindex="0" aria-label="取消移动 / Cancel move"><circle cx="${source.x}" cy="${source.y-4}" r="22" fill="transparent" stroke="#ffe17a" stroke-width="4"/><title>取消移动 / Cancel move</title></g>`:"";
      svg.insertAdjacentHTML("beforeend",`<g class="cities-overlay">${pieces}${merchant}${targets}${cancel}</g>`);
      svg.querySelectorAll('.cities-overlay use[href$="#knight"],.cities-overlay use[href$="#metropolis"],.cities-overlay > path').forEach(el=>{
        const name=el.tagName.toLowerCase()==="path"?"wall":el.getAttribute("href").split("#")[1];let target=name==="knight"?el.parentElement:el;
        if(name==="wall"){
          if(el.getAttribute("stroke-width")!=="8")return;
          const line=el.nextElementSibling,bounds=el.getBBox(),hit=document.createElementNS("http://www.w3.org/2000/svg","rect");
          hit.setAttribute("x",bounds.x-2);hit.setAttribute("y",bounds.y-10);hit.setAttribute("width",bounds.width+4);hit.setAttribute("height","20");hit.setAttribute("fill","transparent");
          target=document.createElementNS("http://www.w3.org/2000/svg","g");el.before(target);target.append(hit,el,line);
        }
        target.dataset.citiesInfo=name;target.setAttribute("role","button");target.setAttribute("tabindex","0");target.setAttribute("aria-label",`${info[name][0]} · 说明 / Info`);
      });
    }
    return {render,overlay,selectGroup,choose,get selectedGroup(){return group;}};
  }
  return {art,infoButton,helpButton,showInfo,eventDie,rules,mount};
})();
