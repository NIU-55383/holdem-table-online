"use strict";
window.CatanCitiesUI = (() => {
  const D=window.CatanCitiesData, B=window.CatanBoard, esc=B.escape;
  const art=(name,cls="")=>name==="cloth"?window.CatanScenarioUI.art("cloth",cls):`<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><use href="catan-cities-art.svg#${name}"/></svg>`;
  const branchKey=branch=>D.branches[branch][1].toLowerCase();
  let activeMapId="cities";
  const setMap=id=>{activeMapId=id;};
  const combinedMap=()=>window.CatanMaps.get(activeMapId)?.cities ? window.CatanMaps.get(activeMapId) : null;
  const cardDetails=key=>[...D.cardDetails[key],...(combinedMap()?D.combinedCardDetails[key]||[]:[])];
  function contextualItems(items){
    if(!combinedMap())return items;
    return items.map(item=>item.map((text,i)=>{
      if(i<2||typeof text!=="string")return text;
      let value=text.replace("达到 13 分",`达到 ${combinedMap().target} 分`).replace("Reach 13 VP",`Reach ${combinedMap().target} VP`);
      value=value.replaceAll("强盗放到沙漠","强盗和海盗放到本图规定的起始位置").replaceAll("首次入侵时才放到沙漠","首次入侵时与海盗一起放到本图规定的起始位置").replaceAll("强盗不在棋盘上","强盗和海盗均不在棋盘上");
      value=value.replaceAll("puts the robber in the desert","places the robber and pirate at their scenario starting positions").replaceAll("The robber stays off the board","The robber and pirate stay off the board").replaceAll("when it enters the desert","when both enter at their scenario starting positions");
      value=value.replaceAll("1 条相连道路","1 条相连道路或 1 艘相连船").replaceAll("1 connected road","1 connected road or ship").replaceAll("沿自己连续相连的道路","沿自己连续相连的道路或船").replaceAll("沿自己的道路选择","沿自己的道路或船选择").replaceAll("along your connected roads","along your connected roads and ships").replaceAll("along their own roads","along their own roads and ships");
      return value;
    }));
  }
  function combinedSection(){return combinedMap()?'<section data-cities-rule="combined"><h3>城市与骑士＋航海家 / Cities &amp; Knights + Seafarers</h3><ul class="cities-info-list">'+D.combinedRules.map(([zh,en])=>`<li><p>${esc(zh)}<small>${esc(en)}</small></p></li>`).join("")+'</ul></section>':"";}
  const cardArt=key=>`<svg class="cities-card-art" viewBox="0 0 48 48" aria-hidden="true"><use href="catan-progress-art.svg#${key}"/></svg>`;
  const cardCategory=branch=>`<span class="cities-card-category">${art(branchKey(branch))}<span>${D.branches[branch][0]} / ${D.branches[branch][1]}</span></span>`;
  function progressCatalog(){
    return `<div class="cities-progress-catalog"><h3>进步卡清单 / Progress cards</h3><p>开局共 54 张：科学、贸易、政治各 18 张。下方标注各卡的开局数量。<small>Starting total: 54 cards, with 18 each in Science, Trade and Politics. Each card below shows its starting quantity.</small></p><nav class="cities-card-nav" aria-label="按类别查看进步卡 / Browse progress cards by category">${D.branches.map(([zh,en],b)=>`<button type="button" data-progress-jump="${branchKey(b)}" data-progress-branch="${branchKey(b)}">${art(branchKey(b))}<span>${zh}<small>${en}</small></span></button>`).join("")}</nav><div class="cities-rule-cards">${D.branches.map(([zh,en],b)=>{
      const cards=Object.entries(D.cards).filter(([,card])=>card[0]===b),count=cards.reduce((n,[,card])=>n+card[1],0),key=branchKey(b);
      return `<section class="cities-card-group" data-progress-branch="${key}" id="citiesCards-${key}"><header class="cities-card-group-heading">${art(key)}<div><h3 tabindex="-1">${zh} / ${en}</h3><p>${cards.length} 种 · 开局共 ${count} 张<small>${cards.length} types · Starting total: ${count} cards</small></p></div></header>${cards.map(([key,card])=>`<article class="cities-rule-card" data-progress-card="${key}" data-progress-branch="${branchKey(b)}"><header class="cities-rule-card-heading">${cardArt(key)}<div><h4>${esc(card[2])} / ${esc(card[3])}</h4>${cardCategory(b)}<span class="cities-card-copies">开局共 ${card[1]} 张 / Starting total: ${card[1]}</span></div></header>${infoList(cardDetails(key))}</article>`).join("")}</section>`;
    }).join("")}</div></div>`;
  }
  const info={
    eventDie:["事件骰 / Event die"],barbarians:["蛮族船 / Barbarian ship"],
    paper:["纸 / Paper"],cloth:["布 / Cloth"],coin:["币 / Coin"],
    knight:["骑士 / Knights"],merchant:["商人 / Merchant"],
    wall:["城墙 / City wall"],metropolis:["都会 / Metropolis"]
  };
  const helpDetails={
    eventDie:[
      ["一起掷三颗骰子","Roll all three dice","每回合一起掷黄骰、红骰和事件骰。两颗数字骰相加，决定哪些地块生产，或是否触发 7 点。","Roll the yellow, red and event dice together. Add the two number dice to determine production or seven."],
      ["船面：推进蛮族船","Ship: advance the barbarians","事件骰有 6 面，其中 3 面是蛮族船。掷到船面，船就前进 1 格；不是每回合都会前进。","Three faces out of six show the ship. Each ship result advances the fleet 1 space; it does not advance every turn."],
      ["彩色面：有机会抽进步卡","Colored faces: progress cards","另外 3 面分别是绿色科学、黄色贸易、蓝色政治，每种出现的概率都是 1/6。所有玩家都检查对应改良等级，不只是掷骰的人。","The other faces are green Science, yellow Trade and blue Politics, each with a 1/6 chance. Every player checks the matching improvement, not only the roller."],
      ["抽牌看红骰","Check the red die","对应改良至少 1 级，且红骰点数符合下表，就抽 1 张该类进步卡。黄骰和数字骰总和不影响这次抽牌。","With at least level 1 in the matching branch, draw 1 matching progress card if the red die qualifies below. Neither the yellow die nor the dice total affects this draw.",true],
      ["先处理事件，再处理生产","Resolve the event first","先完成蛮族入侵或进步卡抽取等事件，再按数字骰总和生产资源或处理 7 点。","Finish the event, including any barbarian attack or progress-card draws, before resolving production or seven."]
    ],
    merchant:[
      ["怎样取得商人","Take control","在自己的回合掷骰后打出商人进步卡，再选择自己村庄或城市旁的一块资源地。不能放在沙漠上。","After rolling on your turn, play a Merchant progress card and choose a resource hex beside your settlement or city. You cannot choose the desert."],
      ["怎样看归属","Identify the owner","商人外圈的颜色，就是控制它的玩家颜色。商人只有一个，别人打出商人卡后可以夺走控制权。","The merchant's ring matches its owner's color. There is only one merchant; another player's Merchant card can take control."],
      ["控制时加 1 分","Gain 1 VP while in control","控制商人时，你的总分增加 1 分。失去商人时，这 1 分也会失去。","Control of the merchant adds 1 VP to your total. You lose that point when you lose control."],
      ["对应资源按 2:1 换","Trade its resource at 2:1","例如商人在麦田上，你可用 2 张麦子向银行换 1 张其他资源或商品，银行必须有库存。这个优惠只适用于交给银行的该种普通资源；纸、布、币可以换回来，但不能靠商人按 2:1 换出去。","For example, on a field you can give the bank 2 grain for 1 other available resource or commodity. This rate only applies to that normal resource given to the bank. Paper, cloth and coins may be received, but cannot be given at 2:1 using the merchant."],
      ["别人夺走后","When another player takes it","原主人同时失去商人的 1 分和兑换优惠；新的控制者获得它们。商人不会改变地块的正常生产。","The former owner loses both the merchant's point and trading benefit; the new owner gains them. The merchant does not change normal hex production."]
    ],
    metropolis:[
      ["都会是什么","What a metropolis is","都会是在你的一座城市上放一个都会标记。原城市值 2 分，标记额外加 2 分，所以这座都会共值 4 分。","Place a metropolis marker on one of your cities. The city is worth 2 VP and the marker adds 2 VP, for 4 VP total."],
      ["生产和防守","Production and protection","生产数量与普通城市相同。蛮族不能把都会降级，但计算蛮族战力时，每座都会仍算 1 座城市。","Production stays the same as an ordinary city. Barbarians cannot downgrade a metropolis, but each still counts as one city toward barbarian strength."],
      ["升到 4 级：先到先得","Level 4: first to claim","科学、贸易、政治各有 1 个都会标记。第一个把某条改良升到 4 级的人，将对应标记放到自己一座还没有都会标记的城市上。","Each improvement branch has one metropolis marker. The first player to reach level 4 places that branch's marker on an owned city without another marker."],
      ["升到 5 级：可以夺取","Level 5: take the marker","如果持有者还在 4 级，你先升到同一条改良的 5 级，就能把都会标记和额外 2 分拿走。标记放到你自己的城市；对方原来的城市仍归对方。","If the holder is still at level 4 and you reach level 5 in that same branch first, take the marker and its 2 bonus VP. Place it on your own city; the opponent keeps their original city."],
      ["先到 5 级：保住都会","First to level 5: secure it","持有者先升到 5 级后，别人不能再夺走这类都会。与持有者等级相同也不能夺取；保住已有都会不会再加 2 分。","Once its holder reaches level 5, no one can take that metropolis. Equal improvement levels never take it, and securing it does not add another 2 VP."]
    ]
  };
  [["paper","纸","Paper","森林","forest","木材","lumber","科学","science"],
   ["cloth","布","Cloth","牧场","pasture","羊毛","wool","贸易","trade"],
   ["coin","币","Coin","山地","mountain","矿石","ore","政治","politics"]].forEach(([key,zh,en,terrain,terrainEn,resource,resourceEn,branch,branchEn])=>{
    helpDetails[key]=[
      ["开局总数","Starting total",`全场共有 12 张${zh}，所有玩家共用。`,`There are 12 ${key} cards in the game, shared by all players.`],
      ["怎样获得","How to collect",`${terrain}正常生产时，每座相邻城市（含都会）领取 1 张${resource} + 1 张${zh}。村庄仍只领 1 张${resource}，不领${zh}。`,`When a ${terrainEn} produces normally, each adjacent city, including a metropolis, receives 1 ${resourceEn} + 1 ${key}. A settlement receives only 1 ${resourceEn}, with no ${key}.`],
      ["用来做什么","What it pays for",`${zh}是商品，用来提升${branch}改良。升到 1、2、3、4、5 级，通常分别支付 1、2、3、4、5 张${zh}。`,`${en} is a commodity used for ${branchEn} improvements. Reaching levels 1, 2, 3, 4 and 5 normally costs 1, 2, 3, 4 and 5 ${key}, respectively.`],
      ["也可以交易","Trading",`${zh}可以通过玩家交易或银行交易获得，也会计入掷出 7 点时的手牌数，并可能被强盗偷走。`,`${en} can also be obtained in player or bank trades. It counts toward your hand size on seven and can be stolen by the robber.`]
    ];
  });
  const sharedHelpSections={knight:"knight",barbarians:"barbarians",wall:"walls"};
  const eventFaces={ship:{label:["蛮族","Ship"],icon:"barbarians",info:"barbarians"}};
  D.branches.forEach(([zh,en,,color])=>{
    const key=en.toLowerCase(),name=`event-${key}`;
    eventFaces[key]={label:[zh,en],icon:"metropolis",info:name,color};
    info[name]=[`${zh}事件 / ${en} event`];
    helpDetails[name]=[
      ["谁能抽牌","Who can draw",`无论谁掷出这个事件面，所有玩家都检查自己的${zh}改良等级。这个骰面出现的概率是 1/6。`,`Whenever anyone rolls this face, every player checks their ${en.toLowerCase()} improvement. This face has a 1/6 chance.`],
      ["等级与红骰点数","Level and red die",`${zh}至少 1 级，且红骰点数符合下表，才能抽牌。0 级不抽牌；黄骰点数不影响这次抽牌。`,`You need at least level 1 in ${en.toLowerCase()}, with an eligible red die below. Level 0 draws nothing; the yellow die does not affect this draw.`,true],
      ["抽什么、抽几张","Which card and how many",`符合条件时，抽 1 张${zh}进步卡。等级更高会增加符合条件的红骰点数，不会增加一次抽牌的张数。`,`If eligible, draw 1 ${en.toLowerCase()} progress card. Higher levels allow more red-die results, not more cards per draw.`]
    ];
  });
  const improvementAbilities=[
    ["三级能力：水渠","Level 3: Aqueduct","两颗数字骰之和不是 7，且这次生产中你一张资源或商品都没领到时，可从银行任选 1 张有库存的普通资源：木材、砖、羊毛、麦子或矿石。不能选纸、布、币；已经领到任意资源或商品，就不能再领水渠奖励。","When the dice total is not 7 and production gives you no resources or commodities at all, Aqueduct lets you take 1 available normal resource from the bank: lumber, brick, wool, grain or ore. You cannot choose paper, cloth or coins, and receiving any resource or commodity means no Aqueduct reward."],
    ["三级能力：商品按 2:1 交易","Level 3: 2:1 commodity trades","可用 2 张相同商品（纸、布或币），向银行换 1 张其他资源或商品。例如：2 张纸换 1 张布，或换 1 张麦子。1 张纸加 1 张布不能混着凑。银行必须有库存；木、砖、羊、麦、矿不会因此获得 2:1 汇率。","Trade 2 identical commodities (paper, cloth or coins) for 1 other available resource or commodity from the bank. For example, 2 paper can buy 1 cloth or 1 grain. You cannot combine 1 paper with 1 cloth. Normal resources do not gain a 2:1 rate from this ability."],
    ["三级能力：解锁三级骑士","Level 3: unlock mighty knights","政治改良达到 3 级后，才可以把二级骑士晋升为三级骑士；现有骑士不会自动升级。每次晋升仍需支付 1 羊毛 + 1 矿石，每名骑士每回合最多晋升一次，晋升不要求先激活；每人最多拥有 2 名三级骑士。三级骑士激活后提供 3 点防守力；新招募的骑士仍从一级开始。","Politics must reach level 3 before you may promote a rank-2 knight to a mighty rank-3 knight. Existing knights do not upgrade automatically. Promotion still costs 1 wool + 1 ore and is allowed at most once per knight per turn; the knight need not be active. Each player may have at most 2 rank-3 knights. An active mighty knight provides 3 defense strength; newly recruited knights still start at rank 1."]
  ];
  const improvementColors=[["绿色","green"],["黄色","yellow"],["蓝色","blue"]];
  const improvementCommodities=["纸","布","币"];
  const improvementDetails={};
  D.branches.forEach(([zh,en,resource],i)=>{
    const commodity=improvementCommodities[i],[colorZh,colorEn]=improvementColors[i];
    info[en.toLowerCase()]=[`${zh}改良 / ${en} improvements`];
    improvementDetails[en.toLowerCase()]=[
      ["升级什么、什么时候能升级","What and when to upgrade",`提升的是你整条${zh}路线的等级，不是某一座城市。至少拥有一座城市才能升级。每次升 1 级，最高 5 级；物资足够时，同回合可连续升级。`,`You improve your whole ${en.toLowerCase()} track, not an individual city. You must own at least one city to upgrade. Each purchase raises the track by 1 level, up to level 5. You may buy several upgrades in one turn if you can pay.`],
      ["每次要付多少","Cost of each upgrade",`用${commodity}升级。升到 1、2、3、4、5 级，通常分别付 1、2、3、4、5 张${commodity}。例如 2 级升到 3 级要付 3 张${commodity}。起重机可让一次升级少付 1 张；确认时会显示实际费用。`,`Pay in ${resource}. Reaching levels 1, 2, 3, 4 and 5 normally costs 1, 2, 3, 4 and 5 respectively. For example, level 2 to 3 costs 3 ${resource}. Crane reduces one upgrade by 1 commodity; the confirmation shows the actual cost.`],
      ["什么时候能抽进步卡","When you draw a progress card",`无论谁掷骰，所有玩家都检查自己的等级。事件骰必须是${colorZh}（${zh}），再看红骰是否符合下表。黄骰和两颗数字骰之和都不影响这次抽牌。符合条件时抽 1 张${zh}进步卡；等级更高不会让一次抽牌的张数增加。`,`Every player checks their own level whenever anyone rolls. The event die must be ${colorEn} (${en}), and the red die must qualify in the table below. Neither the yellow die nor the dice total affects this draw. If eligible, draw 1 ${en.toLowerCase()} progress card; higher levels do not increase the number of cards per draw.`],
      ["等级与红骰点数对照","Levels and eligible red-die results",`前提仍是事件骰为${colorZh}。例如：${zh} 2 级时，红骰 3 可以抽牌，红骰 4 不可以。`,`The event die must still be ${colorEn}. For example, at ${en.toLowerCase()} level 2, a red 3 qualifies but a red 4 does not.`,true],
      improvementAbilities[i],
      ["四级：争夺这条路线的都会","Level 4: claim this branch's metropolis",`科学、贸易、政治各只有 1 个都会标记。本路线第一个升到 4 级的玩家，可把标记放到自己一座还没有都会标记的城市上，额外加 2 分，该城共值 4 分。城市生产不变，也不会被蛮族降级；后来只升到 4 级的人不能夺走它。`,"Science, Trade and Politics each have one metropolis marker. The first player to reach level 4 in a branch places it on an owned city without another metropolis marker. It adds 2 VP, making that city worth 4 VP. Production is unchanged and barbarians cannot downgrade it. Reaching the same level 4 later does not take it."],
      ["五级：夺取或保住都会","Level 5: take or secure the metropolis","如果都会主人还在 4 级，你先升到 5 级，就能拿走标记和额外 2 分，放到自己一座还没有都会标记的城市上；对方原来的城市仍归对方。如果你已拥有都会，先升到 5 级就能保住它，之后别人升到 5 级也不能夺走。保住已有都会不会再加 2 分。","If the owner is still at level 4 and you reach level 5 first, move the marker and its 2 bonus VP to your own city without another metropolis marker. Their original city remains theirs. If you already own it, reaching level 5 secures it against later level-5 rivals. Securing an existing metropolis does not add another 2 VP."],
      ["高等级和失去城市后的变化","Higher levels and losing cities","四级、五级继续保留三级能力。已有改良等级不会因失去城市而下降，但没有城市时不能继续升级；如果你还没有这条路线的都会，升到 4 级或 5 级前，还必须有一座尚未放都会标记的城市；即使这次升级拿不到都会，也需要。","Levels 4 and 5 retain the level-3 ability. Losing cities does not lower existing improvements, but you cannot upgrade without a city. If you do not own this branch’s metropolis, upgrading to level 4 or 5 also requires a city without a metropolis marker, even when this upgrade will not claim one."]
    ];
  });
  function drawTable(){
    return '<table class="cities-draw-table"><thead><tr><th scope="col">改良等级<small>Improvement level</small></th><th scope="col">可抽牌的红骰点数<small>Eligible red die</small></th></tr></thead><tbody>'+Array.from({length:6},(_,level)=>`<tr><th scope="row">${level}</th><td>${level?Array.from({length:level+1},(_,i)=>i+1).join('、'):'不抽牌<small>No draw</small>'}</td></tr>`).join('')+'</tbody></table>';
  }
  function infoList(items){
    return '<ul class="cities-info-list">'+contextualItems(items).map(([zhTitle,enTitle,zh,en,table])=>`<li><p><strong>${esc(zhTitle)}：</strong>${esc(zh)}<small><strong>${esc(enTitle)}: </strong>${esc(en)}</small></p>${table?drawTable():''}</li>`).join('')+'</ul>';
  }
  function improvementConfirmation(upgrade){
    const {branch,from,to,cost,discount,metropolis}=upgrade,[zh,en,resource]=D.branches[branch],commodity=improvementCommodities[branch],[colorZh,colorEn]=improvementColors[branch];
    const amount=n=>`${n} ${resource}${resource==='coin'&&n!==1?'s':''}`;
    const costZh=cost===0?'本次免费，无需支付商品。':`本次支付 ${cost} 张${commodity}。`;
    const costEn=cost===0?'This upgrade is free; pay no commodities.':`Pay ${amount(cost)} for this upgrade.`;
    const items=[
      ["本次花费","Cost now",costZh+(discount?`原价 ${to} 张${commodity}，起重机减免 ${discount} 张${commodity}；本次升级会用掉这一次减费。`:''),costEn+(discount?` Normal cost: ${amount(to)}; Crane saves ${amount(discount)}. This upgrade uses one Crane discount.`:'')],
      ["新增抽牌机会","More eligible red-die results",`事件骰为${colorZh}（${zh}）时，红骰抽牌范围从“${from?'1–'+(from+1):'不能抽牌'}”变为“1–${to+1}”。无论谁掷骰，符合条件就抽 1 张${zh}进步卡。`,`With a ${colorEn} (${en}) event, eligible red-die results change from ${from?'1–'+(from+1):'no draw'} to 1–${to+1}. Whenever anyone rolls, qualifying players draw 1 ${en.toLowerCase()} progress card.`]
    ];
    if(to===3)items.push(improvementAbilities[branch]);
    if(to>=4){
      const benefits={
        claim:["本次获得都会","Claim a metropolis",`升级后选择自己一座还没有都会标记的城市，放置${zh}都会，额外获得 2 分，该城共值 4 分。`,`After upgrading, choose your city without another metropolis marker and place the ${en.toLowerCase()} metropolis. Gain 2 extra VP; that city is worth 4 VP.`],
        take:["本次夺取都会","Take the metropolis",`本次升到 5 级，会从仍为 4 级的持有者那里拿走${zh}都会标记和额外 2 分。升级后放到自己一座还没有都会标记的城市上；对方原来的城市不会变成你的。`,`Reaching level 5 takes the ${en.toLowerCase()} metropolis marker and its 2 bonus VP from its level-4 holder. Then place it on your city without another metropolis marker. Their original city does not become yours.`],
        secure:["本次保住都会","Secure your metropolis",`你已拥有${zh}都会。升到 5 级后，其他玩家即使后来也到 5 级，仍不能夺走它。保留已有的 2 分，本次不会再加 2 分。`,`You already own the ${en.toLowerCase()} metropolis. At level 5, later rivals cannot take it. Keep the existing 2 bonus VP; this upgrade does not add another 2 VP.`],
        none:["本次不获得都会","No metropolis gained",`其他玩家已拥有${zh}都会，本次升级没有超过持有者的等级，因此不会拿到标记，也不额外加 2 分。`,`Another player owns the ${en.toLowerCase()} metropolis. This upgrade does not exceed their level, so you gain no marker or extra 2 VP.`]
      };
      items.push(benefits[metropolis]);
    }
    return {title:`${zh}改良：${from}级 → ${to}级 / ${en} improvement: level ${from} → ${to}`,html:infoList(items)};
  }
  function eventDie(event){
    const face=eventFaces[event],label=face?face.label.join(" / "):"未掷骰 / Not rolled";
    return `<button type="button" class="cities-event-die" data-event="${face?event:""}" data-cities-info="${face?.info||"eventDie"}" title="事件骰 / Event die · ${label}" aria-label="事件骰 / Event die · ${label} · 说明 / Info"><span class="die" aria-hidden="true"${face?.color?` style="color:${face.color}"`:""}>${face?art(face.icon):"?"}</span><span class="cities-event-caption" aria-hidden="true">${face?face.label[0]:"事件骰"}<small>${face?face.label[1]:"Event die"}</small></span></button>`;
  }
  const infoButton=(name,cls="")=>`<button type="button" class="cities-info-button ${cls}" data-cities-info="${name}" title="${info[name][0]}" aria-label="${info[name][0]} · 说明 / Info">${art(name)}</button>`;
  function showInfo(name){
    const entry=info[name];if(!entry)return;
    let dialog=document.getElementById("citiesInfoDialog");
    if(!dialog){dialog=document.createElement("dialog");dialog.id="citiesInfoDialog";dialog.className="cities-dialog cities-info-dialog";dialog.setAttribute("aria-labelledby","citiesInfoTitle");dialog.innerHTML='<div class="dialog-heading"><h2 id="citiesInfoTitle"></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div class="cities-info-body" tabindex="0"></div>';document.body.append(dialog);dialog.querySelector("[data-close]").onclick=()=>dialog.close();}
    const items=improvementDetails[name]||helpDetails[name]||D.ruleSections.find(section=>section.key===sharedHelpSections[name])?.items;
    dialog.querySelector("h2").textContent=entry[0];dialog.querySelector(".cities-info-body").innerHTML=infoList(items)+(combinedMap()?infoList(({knight:[6,7,8,12],barbarians:[9,10,11],merchant:[13]}[name]||[]).map(i=>["组合模式","Combined mode",...D.combinedRules[i]])):"");
    if(!dialog.open)dialog.showModal();dialog.querySelector(".cities-info-body").scrollTop=0;
  }
  function explain(e){const target=e.target.closest("[data-cities-info]");if(!target)return;if(e.type==="keydown"&&(!["Enter"," "].includes(e.key)||target.tagName.toLowerCase()==="button"))return;e.preventDefault();e.stopImmediatePropagation();showInfo(target.dataset.citiesInfo);}
  document.addEventListener("click",explain,true);document.addEventListener("keydown",explain,true);
  const groups={improvement:["城市改良","Improvements","metropolis"],recruit:["招募","Recruit","knight"],activate:["激活","Activate","knight"],promote:["晋升","Promote","knight"],move:["移动骑士","Move knight","knight"],chase:["驱赶强盗","Chase robber","knight"],wall:["城墙","Walls","wall"],harbor:["商业港","Commercial Harbor","coin"],discard:["弃进步卡","Discard progress","paper"]};
  const choices={discardProgress:["进步卡超过上限，选择弃掉一张","Above the hand limit: discard a progress card"],reward:["防守贡献并列，选择进步卡类别","Tied defense: choose a progress deck"],pillage:["防守失败，选择降级的城市","Defense failed: choose a city to downgrade"],metropolis:["选择都会所在的城市","Choose the metropolis city"],relocate:["选择骑士迁移的位置","Choose where to relocate your knight"],aqueduct:["水渠：任选一张资源","Aqueduct: choose one resource"],give:["选择要交出的物资","Choose cards to give up"],alchemy:["指定黄骰与红骰","Choose yellow and red dice"],engineering:["选择城市建墙","Choose a city for a wall"],invention:["依次选择两枚数字","Select two number discs in order"],smithing:["选择要晋升的骑士","Choose a knight to promote"],guild:["选择分数更高的对手","Choose a higher-scoring opponent"],espionage:["选择查看谁的进步卡","Choose whose progress cards to inspect"],treason:["选择一名对手","Choose an opponent"],takeCards:["选择拿走的物资","Choose cards to take"],takeProgress:["选择拿走的进步卡","Choose a progress card to take"],removeKnight:["选择移除一名骑士","Choose a knight to remove"],replaceRank:["选择新骑士的等级","Choose the replacement rank"],replaceKnight:["放置替代骑士","Place the replacement knight"],merchant:["选择商人地块","Choose the merchant hex"],fleet:["选择本回合 2:1 兑换的物资","Choose this turn's 2:1 item"],monopoly:["选择垄断资源","Choose a resource"],tradeMonopoly:["选择垄断商品","Choose a commodity"],intrigue:["选择要驱逐的骑士","Choose a knight to displace"],taxation:["移动强盗，从每名相邻对手各偷一张","Move the robber; steal once from each adjacent opponent"],diplomacy:["选择开放道路","Choose an open road"],harborPay:["商业港：选择交换的商品","Commercial Harbor: choose a commodity to exchange"]};
  function choiceDescription(g,you){
    const q=g.citiesKnights?.choice;if(!q||g.phase!=="ckChoice")return null;
    const player=g.players[q.player],own=q.player===you,who=own?"你":player.name,whoEn=own?"You":player.name;
    const owed=Number.isSafeInteger(q.count)?q.count:1;
    const remaining=q.kind==="give"?Math.min(owed,g.citiesKnights.selection?.required??player.resourceCount??owed):owed;
    if(q.kind==="give"){
      const reason=q.reason|| (q.to===-1?"sabotage":Number.isInteger(q.to)?"wedding":null),discard=reason==="sabotage";
      const [name,nameEn]=D.cards[reason]?.slice(2,4)||["交出物资","Give cards"],verb=discard?"弃掉":"交出",verbEn=discard?"discard":"give";
      const source=g.players[q.source]?.name,recipient=g.players[q.to]?.name;
      const hasTotals=Number.isSafeInteger(q.total)&&Number.isSafeInteger(q.initialCount)&&q.total>=remaining;
      const hasScores=Number.isSafeInteger(q.sourceScore)&&Number.isSafeInteger(q.playerScore);
      const items=[];
      if(reason==="wedding"||reason==="sabotage"){
        const comparison=discard?"不低于":"高于",comparisonEn=discard?"at least":"higher than";
        items.push(["为什么要交牌","Why cards are required",`${source||"有玩家"}使用了「${name}」。${hasScores?`出牌时，${who}是 ${q.playerScore} 分，${comparison}出牌者的 ${q.sourceScore} 分。`:`这张卡要求分数${comparison}出牌者的玩家${verb}物资。`}`,`${source||"A player"} played ${nameEn}. ${hasScores?`At that time, ${whoEn} had ${q.playerScore} VP, ${comparisonEn} the player's ${q.sourceScore} VP.`:`Players whose score is ${comparisonEn} the card player's must ${verbEn} cards.`}`]);
      }
      let amountZh=`还需${verb} ${remaining} 张资源或商品。`,amountEn=`${remaining} resource or commodity card(s) still to ${verbEn}.`;
      if(hasTotals){
        const done=q.total-remaining;
        amountZh=discard?`这张卡生效时共有 ${q.initialCount} 张资源和商品，弃掉一半并向下取整，共需弃 ${q.total} 张。`:`通常要交 2 张；这张卡生效时共有 ${q.initialCount} 张资源和商品，${q.initialCount<2?"不足 2 张，需要全部交出":"由你选择其中 2 张"}，本次共需交 ${q.total} 张。`;
        amountZh+=`已${discard?"弃":"交"} ${done} 张，还需${verb} ${remaining} 张。`;
        amountEn=(discard?`Started with ${q.initialCount} resources and commodities; half, rounded down, means ${q.total} cards in total. `:`Normally give 2 cards, or all if fewer. Started with ${q.initialCount} resources and commodities, so ${q.total} in total. `)+`${done} already ${discard?"discarded":"given"}; ${remaining} still to ${verbEn}.`;
      }
      if(!hasTotals&&reason==="wedding"){amountZh="婚礼通常要交 2 张；生效时不足 2 张就全部交出。"+amountZh;amountEn="Wedding requires 2 cards, or all if fewer at the time it took effect. "+amountEn;}
      if(!hasTotals&&discard){amountZh="按这张卡生效时资源和商品的总数，弃掉一半，向下取整。"+amountZh;amountEn="Discard half the resources and commodities held when the card took effect, rounded down. "+amountEn;}
      if(discard){amountZh+="城墙不能减少这次弃牌数量。";amountEn+=" City walls do not reduce this discard.";}
      items.push(["本次数量","Cards required",amountZh,amountEn]);
      if(!discard&&recipient)items.push(["交给谁","Recipient",`选中的牌交给 ${recipient}，加入其手牌。`,`The chosen cards go to ${recipient}'s hand.`]);
      return {heading:[`${name}：还需${verb} ${remaining} 张`,`${nameEn}: ${remaining} left to ${verbEn}`],prompt:[`${own?"你":"等待 "+player.name} · ${name}：还需${verb} ${remaining} 张`,`${own?"You":"Waiting for "+player.name} · ${nameEn}: ${remaining} left to ${verbEn}`],items};
    }
    if(q.kind==="removeKnight"){
      const source=g.players[q.source??q.to]?.name,sourceZh=source||"出牌者",sourceEn=source||"the card player";
      return {heading:["叛变：选择移除 1 名骑士","Treason: choose 1 knight to remove"],prompt:[`${own?"你":"等待 "+player.name} · 叛变：移除 1 名骑士`,`${own?"You":"Waiting for "+player.name} · Treason: remove 1 knight`],items:[
        ["为什么要移除","Why a knight must be removed",`${sourceZh}使用了政治进步卡「叛变」，指定了${who}。`,`${source||"A player"} played the Politics progress card Treason and chose ${own?"you":player.name}.`],
        ["移除哪一名","Which knight",`${who}必须从自己的骑士中选择 1 名移除。任何等级都可以，已激活或未激活都可以选。`,`${whoEn} must choose 1 of ${own?"your":"their"} own knights to remove, of any rank, whether active or inactive.`],
        ["出牌者获得什么","What the card player gains",`有空余棋子和合法位置时，${sourceZh}可免费放置 1 名同级或更低级的骑士，保留被移除骑士的激活或未激活状态。`,`With an available piece and a legal location, ${sourceEn} may place 1 knight of equal or lower rank for free, keeping the removed knight's active or inactive state.`]
      ]};
    }
    if(q.kind==="harborPay"){
      const source=g.players[q.source??q.to]?.name||"出牌者",sourceEn=g.players[q.source??q.to]?.name||"the card player";
      const resources=["木材","砖块","羊毛","麦子","矿石"],resourcesEn=["lumber","brick","wool","grain","ore"],resource=resources[q.resource],resourceEn=resourcesEn[q.resource];
      return {heading:["商业港：选择 1 张商品交换","Commercial Harbor: choose 1 commodity"],prompt:[`${own?"你":"等待 "+player.name} · 商业港：交出 1 张商品`,`${own?"You":"Waiting for "+player.name} · Commercial Harbor: give 1 commodity`],items:[
        ["为什么要交换","Why an exchange is required",`${source} 使用了「商业港」，并向${who}发起交换。对方选给出的普通资源，${who}选交出的商品；有商品就必须交换。`,`${sourceEn} used Commercial Harbor to offer this exchange. The initiator chooses a normal resource; ${own?"you choose":player.name+" chooses"} the commodity. A player with a commodity must exchange.`],
        ["双方各交 1 张","One card each",`从纸、布、币中选择 1 张交给 ${source}，同时收到对方的${resource?` 1 张${resource}`:" 1 张普通资源"}。`, `Choose 1 paper, cloth or coin for ${sourceEn}; receive 1 ${resourceEn||"normal resource"} in return.`],
      ]};
    }
    if(q.kind==="discardProgress"){
      const held=g.citiesKnights.players[q.player]?.count;
      return {heading:[`进步卡超限：还需弃 ${remaining} 张`,`Progress-card limit: discard ${remaining}`],prompt:[`${own?"你":"等待 "+player.name} · 进步卡超限：还需弃 ${remaining} 张`,`${own?"You":"Waiting for "+player.name} · Progress-card limit: discard ${remaining}`],items:[
        ["为什么要弃牌","Why a discard is required",`${who}${Number.isSafeInteger(held)?`当前持有 ${held} 张进步卡，超过 4 张上限` : "持有的进步卡超过 4 张上限"}。公开的印刷术、宪法不计入这个上限；资源和商品也不算。`,`${whoEn} ${own?"have":"has"} ${Number.isSafeInteger(held)?`${held} progress cards, above the limit of 4`:"more than the limit of 4 progress cards"}. Revealed Printing and Constitution cards do not count; resources and commodities are separate.`],
        ["弃几张、弃到哪里","How many and where",`本次还需弃 ${remaining} 张进步卡，放回对应类别的牌堆底。`,`Discard ${remaining} more progress card(s) to the bottom of their matching decks.`],
      ]};
    }

    if(q.kind==="aqueduct")return {heading:["水渠：选择 1 张资源","Aqueduct: choose 1 resource"],prompt:[`${own?"你":"等待 "+player.name} · 水渠：选择 1 张资源`,`${own?"You":"Waiting for "+player.name} · Aqueduct: choose 1 resource`],items:[["领取原因","Why you may take a card","本次生产没有获得资源或商品，可通过水渠从银行任选 1 张普通资源。","You received no resources or commodities from production. The Aqueduct lets you take 1 normal resource from the bank."]]};
    if(q.kind==="takeCards")return {heading:["行会税：选择物资","Guild Dues: choose cards"],prompt:[`${own?"你":"等待 "+player.name} · 行会税：选择物资`,`${own?"You":"Waiting for "+player.name} · Guild Dues: choose cards`],items:[["可选数量","Cards to take",`从对方手牌选择${g.citiesKnights.selection?" "+g.citiesKnights.selection.required+" 张":""}资源或商品。`,`Choose ${g.citiesKnights.selection?g.citiesKnights.selection.required+" ":""}resource or commodity cards from the opponent's hand.`]]};
    if(q.kind==="takeProgress")return {heading:["间谍：选择 1 张进步卡","Espionage: choose 1 progress card"],prompt:[`${own?"你":"等待 "+player.name} · 间谍：选择 1 张进步卡`,`${own?"You":"Waiting for "+player.name} · Espionage: choose 1 progress card`],items:[["可选数量","Cards to take","从对方手牌选择 1 张进步卡。","Choose 1 progress card from the opponent's hand."]]};
    return null;
  }
  function buildingCosts() {
    const rows=[
      ["road","道路 / Road",[0,1]], ["settlement","村庄 / Settlement",[0,1,2,3]],
      ["city","升级城市 / Upgrade city",[3,3,4,4,4]], ["wall","城墙 / City wall",[1,1]],
      ["recruit","招募骑士 / Recruit knight",[2,4]], ["activate","激活骑士 / Activate knight",[3]],
      ["promote","晋升骑士 / Promote knight",[2,4]],
      ...D.branches.map((b,i)=>[b[1].toLowerCase(),`${b[0]} / ${b[1]}`,[i+5]])
    ];
    if(combinedMap())rows.splice(1,0,["ship","船 / Ship",[0,2]]);
    const names=["木材 / Lumber","砖块 / Brick","羊毛 / Wool","麦子 / Grain","矿石 / Ore","纸 / Paper","布 / Cloth","币 / Coin"];
    return `<section id="citiesBuildingCosts"><h3>建造费用 <small>Build costs</small></h3><div class="building-costs">${rows.map(([key,label,resources])=>{
      const improvement=resources[0]>=5,description=resources.map(r=>names[r]).join(", ")+(improvement?" × 1–5":"");
      return `<div class="cost-row" data-cost="${key}"><span>${label}</span><div class="cost-resources" role="group" aria-label="${esc(description)}" title="${esc(description)}">${resources.map(r=>r>=5?infoButton(D.resources[r]):`<svg viewBox="0 0 48 48" aria-hidden="true">${B.icon(D.resources[r])}</svg>`).join("")}${improvement?"<b>× 1–5</b>":""}</div></div>`;
    }).join("")}</div>${infoList([
      ["改良费用","Improvement costs","升到 1、2、3、4、5 级，通常分别支付 1、2、3、4、5 张对应商品；起重机减费后的实际花费会在确认时显示。","Reaching levels 1–5 normally costs 1–5 matching commodities. The confirmation shows the actual cost after any Crane discount."],
      ["棋子上限","Piece limits",`每人最多 5 个村庄、4 座城市、15 条道路${combinedMap()?"、15 艘船":""}、3 道城墙；一级、二级、三级骑士各最多 2 名。`,`Per player: 5 settlements, 4 cities, 15 roads${combinedMap()?", 15 ships":""}, 3 walls and 2 knights of each rank.`]
    ])}</section>`;
  }
  function rules(focus=false) {
    const focusCosts=focus===true,focusProgress=focus==="progress";
    let dialog=document.getElementById("citiesRules");
    if(!dialog){dialog=document.createElement("dialog");dialog.id="citiesRules";dialog.dataset.rulesDialog="";dialog.innerHTML='<div class="dialog-heading"><h2>城市与骑士<small>Cities &amp; Knights</small></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div data-rules-body></div>';document.body.append(dialog);dialog.querySelector("[data-close]").onclick=()=>dialog.close();}
    dialog.dataset.view=focusProgress?"progress":"rules";
    dialog.querySelector("h2").innerHTML=focusProgress?"进步卡清单<small>Progress cards</small>":focusCosts?"建造费用<small>城市与骑士 / Cities &amp; Knights · Build costs</small>":"城市与骑士<small>Cities &amp; Knights</small>";
    if(combinedMap()&&!focusProgress&&!focusCosts)dialog.querySelector("h2").innerHTML="城市与骑士＋航海家<small>Cities &amp; Knights + Seafarers</small>";
    dialog.querySelector("[data-rules-body]").innerHTML=(focusProgress?"":(focusCosts?buildingCosts()+combinedSection():combinedSection()+buildingCosts())+D.ruleSections.map(({key,title,items})=>`<section data-cities-rule="${esc(key)}"><h3>${esc(title)}</h3>${infoList(items)}</section>`).join(""))+progressCatalog()+`<a href="${D.source}" target="_blank" rel="noopener">官方 2025 规则 / Official 2025 Rulebook</a>`;
    dialog.onclick=e=>{
      const button=e.target.closest("[data-progress-jump]");if(!button)return;
      const body=dialog.querySelector("[data-rules-body]"),group=dialog.querySelector(`#citiesCards-${button.dataset.progressJump}`);
      if(group){body.scrollTop+=group.getBoundingClientRect().top-body.getBoundingClientRect().top;group.querySelector("h3").focus({preventScroll:true});}
    };
    window.BoardGameRules.prepare(dialog); dialog.showModal();dialog.querySelector("[data-rules-body]").scrollTop=0;
  }
  function mount(send,redraw,resourceUI) {
    choices.moveKnight=["选择骑士目的地","Choose the knight's destination"];
    let group="",revision="",room=null,moveSource=null,infoCard=null;
    const panel=document.createElement("section");panel.id="citiesPanel";panel.hidden=true;document.getElementById("scenarioPanel").before(panel);
    const status=document.createElement("section");status.id="citiesStatus";status.className="cities-status";status.hidden=true;status.setAttribute("aria-label","城市与骑士状态 / Cities & Knights status");document.querySelector(".player-overview").append(status);
    status.onclick=e=>{if(e.target.closest("[data-cities-rules]"))rules();};
    const fleet=document.createElement("button");fleet.id="citiesFleet";fleet.type="button";fleet.hidden=true;fleet.dataset.citiesInfo="barbarians";
    fleet.innerHTML='<span class="cities-fleet-heading"><span><strong>蛮族船</strong><small>Barbarian ship</small></span><span class="cities-fleet-state" aria-live="polite"></span><i data-lucide="circle-help" aria-hidden="true"></i></span><span class="cities-fleet-route" aria-hidden="true">'+Array.from({length:8},(_,i)=>`<span class="cities-fleet-stop" data-step="${i}"><b>${i}</b></span>`).join("")+art("barbarians","cities-fleet-ship")+'</span><span class="cities-fleet-ends" aria-hidden="true"><span>起点 / Start</span><span>入侵 / Attack</span></span><span class="cities-fleet-robber">首次入侵前无强盗<small>No robber before the first attack</small></span>';
    document.getElementById("boardViewport").before(fleet);
    const dialog=document.createElement("dialog");dialog.id="citiesConfirm";dialog.className="cities-dialog";dialog.innerHTML='<div class="dialog-heading"><h2></h2><button class="icon-button" data-close aria-label="关闭 / Close">×</button></div><p></p><div class="cities-confirm-details" hidden></div><div class="cities-dialog-actions"><button data-play class="primary">使用 / Play</button></div>';document.body.append(dialog);
    dialog.querySelector("[data-close]").onclick=()=>dialog.close();
    dialog.addEventListener("close",()=>{if(!dialog.open){dialog.querySelector("[data-play]").onclick=null;dialog.querySelector("[data-play]").disabled=true;}});
    const available=()=>room?.game?.legal.citiesKnights||[];
    const blocked=()=>!room || room.control?.paused || panel.dataset.pending==="true" || !resourceUI.connected();

    let selectionDraft=null;
    const selectionDialog=document.createElement("dialog");selectionDialog.id="citiesSelectionDialog";selectionDialog.className="cities-selection-dialog";selectionDialog.setAttribute("aria-labelledby","citiesSelectionTitle");
    selectionDialog.innerHTML='<div class="dialog-heading"><h2 id="citiesSelectionTitle"></h2><button type="button" class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div class="cities-selection-body"><div id="citiesSelectionReason"></div><section><h3 id="citiesSelectionAvailableLabel"></h3><div id="citiesSelectionAvailable" class="discard-hand" role="group" aria-labelledby="citiesSelectionAvailableLabel"></div></section><section><h3 id="citiesSelectionChosenLabel">已选卡牌 <small>Selected cards</small></h3><div id="citiesSelectionChosen" class="discard-hand" role="group" aria-labelledby="citiesSelectionChosenLabel"></div></section></div><div class="cities-selection-footer"><p id="citiesSelectionHint" aria-live="polite"></p><button type="button" id="citiesSelectionConfirm" class="primary wide">确认 / Confirm</button></div>';
    document.body.append(selectionDialog);
    const selectionModel=()=>room?.game?.citiesKnights.selection;
    const selectionKey=()=>selectionModel()?JSON.stringify([room.code,room.you,room.game.revision,selectionModel()]):"";
    function closeSelection(){selectionDraft=null;if(selectionDialog.open)selectionDialog.close();}
    selectionDialog.querySelector("[data-close]").onclick=closeSelection;
    selectionDialog.addEventListener("close",()=>{if(!selectionDialog.open)selectionDraft=null;});
    function selectionIsCurrent(){return selectionDraft&&!blocked()&&selectionDraft.key===selectionKey();}
    function syncSelection(){if(selectionDialog.open&&!selectionIsCurrent())closeSelection();}
    function openSelection(){
      const model=selectionModel();if(!model||blocked()||!model.required)return;
      selectionDraft={key:selectionKey(),resources:Array(8).fill(0),cards:[]};
      const g=room.game,q=g.citiesKnights.choice,description=choiceDescription(g,room.you);
      const titles={give:q.reason==="sabotage"?["选择弃牌","Choose cards to discard"]:["选择交出的牌","Choose cards to give"],harborPay:["选择交换的商品","Choose a commodity"],discardProgress:["选择弃掉的进步卡","Choose a progress card to discard"],aqueduct:["水渠：选择资源","Aqueduct: choose a resource"],takeCards:["行会税：选择物资","Guild Dues: choose cards"],takeProgress:["间谍：选择进步卡","Espionage: choose a progress card"]};
      const title=titles[model.kind]||["选择卡牌","Choose cards"];
      selectionDialog.querySelector("h2").innerHTML=esc(title[0])+"<small>"+esc(title[1])+"</small>";
      selectionDialog.dataset.kind=model.kind;
      const info=description?.items||[];
      selectionDialog.querySelector("#citiesSelectionReason").innerHTML=infoList(info);
      const source=model.kind==="aqueduct"?["银行资源","Bank resources"]:["takeCards","takeProgress"].includes(model.kind)?["对方手牌","Opponent's cards"]:["你的手牌","Your hand"];
      selectionDialog.querySelector("#citiesSelectionAvailableLabel").innerHTML=esc(source[0])+" <small>"+esc(source[1])+"</small>";
      const discard=model.kind==="discardProgress"||model.kind==="give"&&q.reason==="sabotage";
      const chosen=discard?["待弃牌","To discard"]:["give","harborPay"].includes(model.kind)?["待交出","To give"]:["已选卡牌","Selected cards"];
      selectionDialog.querySelector("#citiesSelectionChosenLabel").innerHTML=esc(chosen[0])+" <small>"+esc(chosen[1])+"</small>";
      selectionDialog.querySelector("#citiesSelectionConfirm").textContent=discard?"确认弃牌 / Discard":["give","harborPay"].includes(model.kind)?"确认交出 / Give cards":"确认领取 / Take cards";
      renderSelection();if(!selectionDialog.open)selectionDialog.showModal();
      selectionDialog.querySelector(".cities-selection-body").scrollTop=0;
    }
    function renderSelection(){
      if(!selectionIsCurrent()){closeSelection();return;}
      const model=selectionModel(),selected=model.cards?selectionDraft.cards.length:selectionDraft.resources.reduce((a,b)=>a+b,0);
      const empty='<span class="empty-discard-slot" role="img" aria-label="未选卡牌 / No cards selected"></span>';
      function resourceCard(r,chosen,quantity=1,index=0){
        const attr=chosen?"data-unselect-resource":"data-select-resource",verb=chosen?"撤选 / Remove":"选择 / Select",label=resourceUI.labels[r]+" / "+resourceUI.english[r];
        return `<button data-render-key="resource:${r}:${index}" type="button" class="discard-card" ${attr}="${r}" style="--resource:${resourceUI.colors[r]}" ${!chosen&&selected>=model.required?"disabled":""} aria-label="${esc(verb+" "+label)}" title="${esc(label)}">${resourceUI.icon(D.resources[r])}<span>${esc(resourceUI.labels[r])}<small>${esc(resourceUI.english[r])}</small></span>${quantity>1?`<b class="cities-selection-stock">× ${quantity}</b>`:""}</button>`;
      }
      function progressCard(card,chosen){
        const d=D.cards[card.key],attr=chosen?"data-unselect-card":"data-select-card",label=d[2]+" / "+d[3];
        return `<button data-render-key="progress:${card.id}" type="button" class="cities-selection-progress" data-progress-branch="${branchKey(d[0])}" ${attr}="${card.id}" ${!chosen&&selected>=model.required?"disabled":""} aria-label="${esc((chosen?"撤选 / Remove ":"选择 / Select ")+label)}">${cardArt(card.key)}<span>${esc(d[2])}<small>${esc(d[3])}</small></span>${cardCategory(d[0])}</button>`;
      }
      let availableMarkup,chosenMarkup;
      if(model.cards){
        availableMarkup=model.cards.filter(card=>!selectionDraft.cards.includes(card.id)).map(card=>progressCard(card,false)).join("");
        chosenMarkup=model.cards.filter(card=>selectionDraft.cards.includes(card.id)).map(card=>progressCard(card,true)).join("");
      }else{
        availableMarkup=model.resources.flatMap((n,r)=>{const left=n-selectionDraft.resources[r];return model.kind==="aqueduct"?(left?[resourceCard(r,false,left)]:[]):Array.from({length:left},(_,i)=>resourceCard(r,false,1,i));}).join("");
        chosenMarkup=selectionDraft.resources.flatMap((n,r)=>Array.from({length:n},(_,i)=>resourceCard(r,true,1,i))).join("");
      }
      window.CatanRender.html(selectionDialog.querySelector("#citiesSelectionAvailable"),availableMarkup||empty);
      window.CatanRender.html(selectionDialog.querySelector("#citiesSelectionChosen"),chosenMarkup||empty);
      selectionDialog.querySelector("#citiesSelectionHint").textContent=`已选 ${selected} / ${model.required} 张 · Selected ${selected} / ${model.required}`;
      selectionDialog.querySelector("#citiesSelectionConfirm").disabled=selected!==model.required;
    }
    selectionDialog.addEventListener("click",e=>{
      const button=e.target.closest("[data-select-resource],[data-unselect-resource],[data-select-card],[data-unselect-card]");
      if(!button||button.disabled||!selectionDialog.open||!selectionIsCurrent())return;
      const model=selectionModel(),isCard=button.hasAttribute("data-select-card")||button.hasAttribute("data-unselect-card");
      const adding=button.hasAttribute("data-select-resource")||button.hasAttribute("data-select-card");
      const id=Number(isCard?(adding?button.dataset.selectCard:button.dataset.unselectCard):(adding?button.dataset.selectResource:button.dataset.unselectResource));
      const selected=model.cards?selectionDraft.cards.length:selectionDraft.resources.reduce((a,b)=>a+b,0);
      if(adding&&selected>=model.required)return;
      if(isCard){
        if(!model.cards?.some(card=>card.id===id))return;
        if(adding){if(selectionDraft.cards.includes(id))return;selectionDraft.cards.push(id);}
        else selectionDraft.cards=selectionDraft.cards.filter(value=>value!==id);
      }else{
        if(!model.resources||!Number.isInteger(id)||id<0||id>=8)return;
        if(adding&&selectionDraft.resources[id]>=model.resources[id])return;
        selectionDraft.resources[id]=Math.max(0,selectionDraft.resources[id]+(adding?1:-1));
      }
      renderSelection();
      const attr=isCard?(adding?"data-select-card":"data-unselect-card"):(adding?"data-select-resource":"data-unselect-resource");
      const next=selectionDialog.querySelector(`[${attr}="${id}"]:not(:disabled)`)||selectionDialog.querySelector((adding?"#citiesSelectionAvailable":"#citiesSelectionChosen")+" button:not(:disabled)")||selectionDialog.querySelector((adding?"#citiesSelectionChosen":"#citiesSelectionAvailable")+" button:not(:disabled)")||selectionDialog.querySelector("#citiesSelectionConfirm");
      next?.focus({preventScroll:true});
    });
    selectionDialog.querySelector("#citiesSelectionConfirm").onclick=()=>{
      if(!selectionDialog.open||!selectionIsCurrent())return;
      const model=selectionModel(),selected=model.cards?selectionDraft.cards.length:selectionDraft.resources.reduce((a,b)=>a+b,0);
      if(selected!==model.required)return;
      const payload={type:"ckSelect",revision:room.game.revision,...(model.cards?{cards:[...selectionDraft.cards]}:{resources:[...selectionDraft.resources]})};
      selectionDialog.querySelector("#citiesSelectionConfirm").disabled=true;
      send(payload);if(panel.dataset.pending==="true")closeSelection();else if(selectionDialog.open)renderSelection();
    };

    // All non-board choices use a local draft; only confirmation sends a legal engine key.
    const pickerDialog=document.createElement("dialog");
    pickerDialog.id="citiesChoiceDialog";pickerDialog.className="cities-selection-dialog cities-option-dialog";pickerDialog.setAttribute("aria-labelledby","citiesChoiceTitle");
    pickerDialog.innerHTML='<div class="dialog-heading"><h2 id="citiesChoiceTitle"></h2><button type="button" class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div class="cities-selection-body"><p id="citiesChoiceReason"></p><div id="citiesChoiceOptions"></div><section class="cities-choice-preview"><h3>已选内容 <small>Your selection</small></h3><div id="citiesChoiceSelected"></div><button type="button" class="secondary" data-clear-choice>重选 / Clear</button></section></div><div class="cities-selection-footer"><p id="citiesChoiceHint" aria-live="polite"></p><button type="button" id="citiesChoiceConfirm" class="primary wide">确认选择 / Confirm</button></div>';
    document.body.append(pickerDialog);
    let pickerDraft=null;
    const pickerTitles={
      alchemy:["炼金术：选择骰子点数","Alchemy: choose the dice"],
      reward:["选择奖励进步卡类别","Choose a reward deck"],
      guild:["行会税：选择对手","Guild Dues: choose an opponent"],
      espionage:["间谍：选择对手","Espionage: choose an opponent"],
      treason:["叛变：选择对手","Treason: choose an opponent"],
      replaceRank:["叛变：选择新骑士等级","Treason: choose the new knight's rank"],
      fleet:["商船队：选择兑换类型","Merchant Fleet: choose a trade type"],
      monopoly:["资源垄断：选择资源","Resource Monopoly: choose a resource"],
      tradeMonopoly:["商品垄断：选择商品","Trade Monopoly: choose a commodity"],
      harbor:["商业港：选择对手和资源","Commercial Harbor: choose a player and resource"],
      discard:["选择弃掉的进步卡","Choose a progress card to discard"]
    };
    const pickerReasons={
      alchemy:["分别选择黄骰和红骰；事件骰仍随机。","Choose the yellow and red dice separately. The event die stays random."],
      reward:["选择一类，领取 1 张进步卡。","Choose a category to draw 1 progress card."],
      guild:["选择一名符合条件的对手，再选择其物资。","Choose an eligible opponent, then choose cards from their hand."],
      espionage:["选择一名对手，随后查看并选取其 1 张进步卡。","Choose an opponent, then inspect and take 1 of their progress cards."],
      treason:["被选中的对手自行移除 1 名骑士。","The selected opponent chooses 1 of their knights to remove."],
      replaceRank:["免费放置新骑士；可选等级由被移除骑士和空余棋子决定。","Place a free knight. Eligible ranks depend on the removed knight and your available pieces."],
      fleet:["本回合可用 2 张选定类型的牌兑换 1 张其他资源或商品。","For this turn, trade 2 cards of this type for 1 other resource or commodity."],
      monopoly:["每名对手交出至多 2 张选定资源。","Each opponent gives you up to 2 of the selected resource."],
      tradeMonopoly:["每名对手交出至多 1 张选定商品。","Each opponent gives you up to 1 of the selected commodity."],
      harbor:["提供 1 张普通资源，换取对方自选的 1 张商品；对方没有商品则不交换。","Offer 1 normal resource for 1 commodity of their choice. No exchange occurs if they have no commodities."],
      discard:["选择 1 张进步卡，放回对应牌堆底。","Choose 1 progress card to return to the bottom of its deck."]
    };
    function pickerModel(){
      const g=room?.game,c=g?.citiesKnights;if(!c)return null;
      const q=g.phase==="ckChoice"?c.choice:null;
      if(q&&(q.player!==room.you||c.selection))return null;
      const kind=q?.kind||(["harbor","discard"].includes(group)?group:null);
      if(!kind)return null;
      const options=available().filter(o=>!o.position&&!["cancel","done"].includes(o.key)&&(q||o.group===group));
      return options.length?{kind,options,title:pickerTitles[kind]||choices[kind]||groups[kind]?.slice(0,2)||["选择操作","Choose an action"]}:null;
    }
    function pickerKey(model=pickerModel()){
      return model?JSON.stringify([room.code,room.you,room.seats?.map(s=>s?.socialId??null),room.game.revision,model.kind,model.options.map(o=>o.key)]):"";
    }
    function closePicker(){pickerDraft=null;if(pickerDialog.open)pickerDialog.close();}
    pickerDialog.querySelector("[data-close]").onclick=closePicker;
    pickerDialog.addEventListener("close",()=>{if(!pickerDialog.open)pickerDraft=null;});
    function pickerCurrent(){return pickerDraft&&!blocked()&&pickerDraft.key===pickerKey();}
    function syncPicker(){if(pickerDialog.open){if(!pickerCurrent())closePicker();else renderPicker();}}
    function openPicker(){
      const model=pickerModel();if(!model||blocked())return;
      pickerDraft={key:pickerKey(model),option:null,yellow:null,red:null,player:null,resource:null};
      renderPicker();if(!pickerDialog.open)pickerDialog.showModal();pickerDialog.querySelector(".cities-selection-body").scrollTop=0;
    }
    function pickedKey(model){
      if(!pickerDraft)return null;
      if(model.kind==="alchemy")return pickerDraft.yellow&&pickerDraft.red?"dice:"+pickerDraft.yellow+":"+pickerDraft.red:null;
      if(model.kind==="harbor")return pickerDraft.player!==null&&pickerDraft.resource!==null?"harbor:"+pickerDraft.player+":"+pickerDraft.resource:null;
      return pickerDraft.option;
    }
    function pickerDie(n,color){
      const coordinates={1:[[32,32]],2:[[18,18],[46,46]],3:[[18,18],[32,32],[46,46]],4:[[18,18],[46,18],[18,46],[46,46]],5:[[18,18],[46,18],[32,32],[18,46],[46,46]],6:[[18,16],[46,16],[18,32],[46,32],[18,48],[46,48]]};
      return '<svg class="cities-picker-die" viewBox="0 0 64 64" aria-hidden="true"><rect x="3" y="3" width="58" height="58" rx="11" fill="'+(color==="red"?"#d95549":"#f7d16c")+'" stroke="'+(color==="red"?"#a93830":"#b98c27")+'" stroke-width="3"/>'+(coordinates[n]||[]).map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="4.5" fill="'+(color==="red"?"#fff9e8":"#62441a")+'"/>').join("")+'</svg>';
    }
    function pickerPlayer(id){
      const player=room.game.players[id],seat=room.seats?.[id]||player;
      // This is a form option, so the shared avatar is presentational within its button.
      const avatar=window.BoardGameUI.avatar({...seat,socialId:null},Boolean(seat.bot||seat.connected),"cities-picker-avatar",false);
      return '<span class="cities-picker-person">'+avatar+'<span>'+esc(player.name)+'</span></span>';
    }
    function optionVisual(option){
      const [prefix,value]=option.key.split(":"),n=Number(value);
      if(prefix==="r")return resourceUI.icon(D.resources[n])+'<span>'+esc(resourceUI.labels[n])+'<small>'+esc(resourceUI.english[n])+'</small></span>';
      if(prefix==="player")return pickerPlayer(n);
      if(prefix==="b"){const [zh,en]=D.branches[n];return art(branchKey(n))+'<span>'+esc(zh)+'<small>'+esc(en)+'</small></span>';}
      if(prefix==="rank")return art("knight")+'<span>'+n+' 级骑士<small>Rank '+n+' knight</small></span>';
      if(prefix==="discard"){
        const card=room.game.citiesKnights.players[room.you].cards.find(card=>card.id===n),data=card&&D.cards[card.key];
        if(data)return cardArt(card.key)+'<span>'+esc(data[2])+'<small>'+esc(data[3])+'</small></span>'+cardCategory(data[0]);
      }
      return art("metropolis")+'<span>'+esc(option.label)+'</span>';
    }
    function optionAttributes(option){
      const [prefix,value]=option.key.split(":"),n=Number(value);
      if(prefix==="r")return 'style="--resource:'+resourceUI.colors[n]+'"';
      if(prefix==="b")return 'data-progress-branch="'+branchKey(n)+'"';
      if(prefix==="discard"){
        const card=room.game.citiesKnights.players[room.you].cards.find(card=>card.id===n);
        if(card)return 'data-progress-branch="'+branchKey(D.cards[card.key][0])+'"';
      }
      return "";
    }
    function optionButton(option,selected){
      const resource=option.key.startsWith("r:");
      return '<button data-render-key="'+esc(option.key)+'" type="button" class="cities-picker-option '+(resource?"trade-resource-add":"")+'" data-option-key="'+esc(option.key)+'" '+optionAttributes(option)+' aria-pressed="'+selected+'">'+optionVisual(option)+'<span class="cities-picker-check" aria-hidden="true">✓</span></button>';
    }
    function renderPicker(){
      if(!pickerCurrent()){closePicker();return;}
      const model=pickerModel(),key=pickedKey(model),selected=model.options.find(o=>o.key===key);
      pickerDialog.dataset.kind=model.kind;
      pickerDialog.querySelector("#citiesChoiceTitle").innerHTML=esc(model.title[0])+"<small>"+esc(model.title[1])+"</small>";
      const reason=pickerReasons[model.kind]||["选择后确认。","Choose an option, then confirm."];
      pickerDialog.querySelector("#citiesChoiceReason").innerHTML=esc(reason[0])+"<small>"+esc(reason[1])+"</small>";
      let optionsHtml="",preview="",count=selected?1:0,required=1;
      if(model.kind==="alchemy"){
        required=2;count=Number(Boolean(pickerDraft.yellow))+Number(Boolean(pickerDraft.red));
        optionsHtml=["yellow","red"].map(color=>{
          const label=color==="yellow"?["黄骰","Yellow die"]:["红骰","Red die"];
          return '<fieldset class="cities-die-picker"><legend>'+label[0]+' <small>'+label[1]+'</small></legend><div class="cities-die-options">'+Array.from({length:6},(_,i)=>{
            const face=i+1,allowed=model.options.some(o=>o.key.split(":")[color==="yellow"?1:2]===String(face));
            return '<button data-render-key="'+color+':'+face+'" type="button" data-die-color="'+color+'" data-face="'+face+'" aria-label="'+label[0]+' '+face+' / '+label[1]+' '+face+'" aria-pressed="'+(pickerDraft[color]===face)+'" '+(!allowed?"disabled":"")+'>'+pickerDie(face,color)+'</button>';
          }).join("")+'</div></fieldset>';
        }).join("");
        preview='<div class="cities-dice-preview">'+(pickerDraft.yellow?pickerDie(pickerDraft.yellow,"yellow"):'<span class="cities-empty-die">?</span>')+'<span>+</span>'+(pickerDraft.red?pickerDie(pickerDraft.red,"red"):'<span class="cities-empty-die">?</span>')+'<strong>= '+(selected?pickerDraft.yellow+pickerDraft.red:"?")+'</strong></div>';
      }else if(model.kind==="harbor"){
        required=2;count=Number(pickerDraft.player!==null)+Number(pickerDraft.resource!==null);
        const players=[...new Set(model.options.map(o=>Number(o.key.split(":")[1])))],resources=[...new Set(model.options.filter(o=>pickerDraft.player===null||Number(o.key.split(":")[1])===pickerDraft.player).map(o=>Number(o.key.split(":")[2])))];
        optionsHtml='<section><h3>选择对手 <small>Choose an opponent</small></h3><div class="cities-option-grid">'+players.map(id=>'<button data-render-key="player:'+id+'" type="button" class="cities-picker-option" data-choice-player="'+id+'" aria-pressed="'+(pickerDraft.player===id)+'">'+pickerPlayer(id)+'<span class="cities-picker-check" aria-hidden="true">✓</span></button>').join("")+'</div></section><section><h3>提供 1 张资源 <small>Offer 1 resource</small></h3><div class="cities-option-grid cities-resource-options">'+resources.map(r=>'<button data-render-key="resource:'+r+'" type="button" class="cities-picker-option trade-resource-add" style="--resource:'+resourceUI.colors[r]+'" data-choice-resource="'+r+'" aria-pressed="'+(pickerDraft.resource===r)+'">'+optionVisual({key:"r:"+r})+'<span class="cities-picker-check" aria-hidden="true">✓</span></button>').join("")+'</div></section>';
        if(pickerDraft.player!==null||pickerDraft.resource!==null)preview='<div class="cities-harbor-preview">'+(pickerDraft.player!==null?pickerPlayer(pickerDraft.player):'<span>未选对手 / No opponent</span>')+(pickerDraft.resource!==null?'<span class="cities-resource-preview" style="--resource:'+resourceUI.colors[pickerDraft.resource]+'">'+optionVisual({key:"r:"+pickerDraft.resource})+'</span>':"")+'</div>';
      }else{
        optionsHtml='<div class="cities-option-grid '+(model.options.every(o=>o.key.startsWith("r:"))?"cities-resource-options":"")+'">'+model.options.map(o=>optionButton(o,o.key===key)).join("")+'</div>';
        if(selected)preview='<div class="cities-selected-option" '+optionAttributes(selected)+'>'+optionVisual(selected)+'</div>';
      }
      window.CatanRender.html(pickerDialog.querySelector("#citiesChoiceOptions"),optionsHtml);
      window.CatanRender.html(pickerDialog.querySelector("#citiesChoiceSelected"),preview||'<span class="empty-trade-slot" role="img" aria-label="尚未选择 / Nothing selected"></span>');
      pickerDialog.querySelector("[data-clear-choice]").hidden=count===0;
      pickerDialog.querySelector("#citiesChoiceHint").textContent="已选 "+count+" / "+required+" · Selected "+count+" / "+required;
      const confirm=pickerDialog.querySelector("#citiesChoiceConfirm");
      confirm.disabled=!selected;
      confirm.textContent=({alchemy:"确认点数 / Confirm dice",reward:"确认抽牌 / Draw card",harbor:"确认交换 / Offer trade",discard:"确认弃牌 / Discard"})[model.kind]||"确认选择 / Confirm";
    }
    pickerDialog.addEventListener("click",e=>{
      const button=e.target.closest("[data-die-color],[data-option-key],[data-choice-player],[data-choice-resource],[data-clear-choice]");
      if(!button||button.disabled||!pickerDialog.open||!pickerCurrent())return;
      const model=pickerModel();
      if(button.hasAttribute("data-clear-choice"))Object.assign(pickerDraft,{option:null,yellow:null,red:null,player:null,resource:null});
      else if(button.dataset.dieColor){const color=button.dataset.dieColor,face=Number(button.dataset.face);if(!["yellow","red"].includes(color)||face<1||face>6)return;pickerDraft[color]=pickerDraft[color]===face?null:face;}
      else if(button.hasAttribute("data-choice-player")){const id=Number(button.dataset.choicePlayer);if(!model.options.some(o=>o.key.startsWith("harbor:"+id+":")))return;pickerDraft.player=pickerDraft.player===id?null:id;if(pickerDraft.resource!==null&&!model.options.some(o=>o.key==="harbor:"+pickerDraft.player+":"+pickerDraft.resource))pickerDraft.resource=null;}
      else if(button.hasAttribute("data-choice-resource")){const r=Number(button.dataset.choiceResource);if(!model.options.some(o=>Number(o.key.split(":")[2])===r))return;pickerDraft.resource=pickerDraft.resource===r?null:r;}
      else{const key=button.dataset.optionKey;if(!model.options.some(o=>o.key===key))return;pickerDraft.option=pickerDraft.option===key?null:key;}
      renderPicker();
    });
    pickerDialog.querySelector("#citiesChoiceConfirm").onclick=()=>{
      if(!pickerDialog.open||!pickerCurrent())return;
      const model=pickerModel(),key=pickedKey(model);if(!model.options.some(o=>o.key===key))return;
      closePicker();send({type:"ck",choice:key});
    };


    const cardInfo=document.createElement("dialog");cardInfo.id="citiesCardInfoDialog";cardInfo.className="cities-dialog";cardInfo.dataset.rulesDialog="";
    cardInfo.innerHTML='<div class="dialog-heading"><h2></h2><button type="button" class="icon-button" data-close aria-label="关闭 / Close">×</button></div><div data-rules-body></div>';
    document.body.append(cardInfo);cardInfo.querySelector("[data-close]").onclick=()=>cardInfo.close();
    cardInfo.addEventListener("close",()=>{if(!cardInfo.open)infoCard=null;});window.BoardGameRules.prepare(cardInfo);
    function unavailableReason(cardKey){
      const g=room.game;
      if(g.phase==="over")return ["本局已经结束，不能再使用进步卡。","The game has ended; progress cards can no longer be played."];
      if(!resourceUI.connected())return ["连接已断开，重新连接后才能使用。","Reconnect before playing this card."];
      if(room.control?.paused)return ["对局已暂停。恢复对局后，再按卡牌的使用条件出牌。","The game is paused. Resume play before using cards under their normal conditions."];
      if(panel.dataset.pending==="true")return ["正在等待上一步操作完成，请稍后再试。","Waiting for the previous action to finish. Try again shortly."];
      if(g.phase.startsWith("setup"))return ["正在进行初始摆放，暂时不能使用进步卡。","Progress cards cannot be played during initial setup."];
      if(g.current!==room.you)return ["现在不是你的回合。请等到自己的回合，并满足这张卡的使用条件。","It is not your turn. Wait for your turn and meet this card's play conditions."];
      if(cardKey==="alchemy"&&g.phase==="main")return ["炼金术只能在自己掷骰前使用。本回合已经掷过骰，请留到下一个自己的回合、掷骰前使用。","Alchemy must be played before rolling on your turn. You have already rolled; save it for before your roll on your next turn."];
      if(g.phase==="roll"&&cardKey!=="alchemy")return ["请先掷骰，并完成事件、生产或 7 点的结算，再使用这张卡。掷骰前只能使用炼金术。","Roll first and finish resolving the event, production or seven before playing this card. Only Alchemy can be played before the roll."];
      if(g.phase!=="main")return ["请先完成当前的选择或结算，再检查这张卡是否可用。","Finish the current choice or resolution before checking whether this card is available."];
      const reasons={
        taxation:["首次蛮族入侵尚未发生，强盗还没入场，因此现在不能使用这张卡。","The first barbarian attack has not happened and the robber is not in play yet."],
        engineering:["目前没有可以加建城墙的城市：需要一座尚无城墙的城市，而且你已建的城墙必须少于 3 道。","You need a city without a wall and fewer than 3 city walls already built."],
        smithing:["目前没有可晋升的骑士。骑士必须未满 3 级、本回合未晋升过，并且有下一等级的棋子；2 级升 3 级还需要政治改良达到 3 级。","No knight can currently be promoted. It must be below rank 3, not promoted this turn, and have a next-rank piece available. Rank 2 to 3 also requires Politics level 3."],
        intrigue:["目前没有位于你道路或船只旁、可以被驱逐的对手骑士。","There is no opposing knight adjacent to your roads or ships that can be displaced."],
        treason:["棋盘上目前没有可作为目标的对手骑士。","There is no opposing knight on the board to target."],
        espionage:["目前所有对手都没有可供你拿取的进步卡手牌。","No opponent currently holds a progress card you can take."],
        guild:["目前没有既比你分数高、又持有资源或商品的对手。","No opponent both has more victory points than you and holds resources or commodities."],
        diplomacy:["目前没有符合移除条件的开放道路或船只。","There is no eligible open road or ship to remove."],
        roads:["目前没有可建造道路或船只的位置，或相应棋子已经用完。","There is no legal road or ship site, or the required pieces are exhausted."],
        merchant:["你的建筑旁目前没有可放商人的普通资源地块；海域、沙漠和金矿都不能放。","Your buildings have no adjacent normal resource hex for the merchant. Sea, desert and gold fields are not eligible."]
      };
      return reasons[cardKey]||["目前尚未满足这张卡的使用条件，请查看下面的说明。","This card's play conditions are not currently met. See its details below."];
    }
    function refreshCardInfo(){
      if(!infoCard)return;
      if(!room?.game?.citiesKnights||infoCard.room!==room.code||infoCard.you!==room.you){cardInfo.close();return;}
      const held=room.game.citiesKnights.players[room.you].cards.some(card=>card.id===infoCard.id);
      const ready=held&&!blocked()&&available().some(o=>o.key===`play:${infoCard.id}`);
      const pair=!held?["这张卡已不在你的手牌中，仍可在这里查看规则。","This card is no longer in your hand; its rules remain available here."]:ready?["这张卡现在可以使用。关闭说明后，点击标为“可用 / Ready”的卡牌即可进入使用流程。","This card is now ready. Close this explanation and select its Ready card to play it."]:unavailableReason(infoCard.key);
      const reason=cardInfo.querySelector(".cities-card-unavailable-reason");
      const html=infoList([[ready?"现在可用":"当前不能使用",ready?"Now ready":"Currently unavailable",...pair]]);
      if(reason.innerHTML!==html)reason.innerHTML=html;
    }
    function explainCard(card){
      infoCard={id:card.id,key:card.key,room:room.code,you:room.you};
      cardInfo.querySelector("h2").textContent=D.cards[card.key].slice(2,4).join(" / ");
      const body=cardInfo.querySelector("[data-rules-body]");
      body.innerHTML=`<div class="cities-card-description-meta" data-progress-branch="${branchKey(D.cards[card.key][0])}">${cardArt(card.key)}${cardCategory(D.cards[card.key][0])}</div><div class="cities-card-unavailable-reason" aria-live="polite"></div>`+infoList(cardDetails(card.key));
      refreshCardInfo();if(!cardInfo.open)cardInfo.showModal();body.scrollTop=0;
    }
    function selectGroup(next) {
      group=next;render(room,panel.dataset.pending==="true");redraw();if(["harbor","discard"].includes(next))openPicker();
    }
    function choose(key){const o=available().find(x=>x.key===key);if(o)confirm(o);}
    function setDescription(upgrade,cardKey){
      const details=dialog.querySelector(".cities-confirm-details"),content=upgrade?improvementConfirmation(upgrade):cardKey?{title:D.cards[cardKey].slice(2,4).join(" / "),html:`<div class="cities-card-description-meta" data-progress-branch="${branchKey(D.cards[cardKey][0])}">${cardArt(cardKey)}${cardCategory(D.cards[cardKey][0])}</div>`+infoList(cardDetails(cardKey))}:null;
      dialog.classList.toggle("is-improvement",Boolean(upgrade));dialog.classList.toggle("is-description",Boolean(content));dialog.querySelector("p").hidden=Boolean(content);details.hidden=!content;details.innerHTML=content?.html||"";details.scrollTop=0;
      dialog.querySelector("[data-play]").textContent=upgrade?"确认升级 / Upgrade":"使用 / Play";
      if(content)dialog.querySelector("h2").textContent=content.title;
    }
    function confirm(o) {
      if(blocked())return;
      dialog.querySelector("h2").textContent=o.label;
      dialog.querySelector("p").textContent=o.detail||"";
      const card=room.game.citiesKnights.players[room.you].cards.find(card=>o.key===`play:${card.id}`);
      setDescription(o.improvement,card?.key);
      const key=revision;
      dialog.querySelector("[data-play]").disabled=false;
      dialog.querySelector("[data-play]").onclick=()=>{if(dialog.open && key===revision && available().some(x=>x.key===o.key)&&!blocked()){send({type:"ck",choice:o.key});if(card?.key==="merchant")document.getElementById("boardViewport").scrollIntoView({behavior:"instant",block:"center"});}dialog.close();};
      dialog.showModal();
    }
    panel.onclick=e=>{
      const b=e.target.closest("button");if(!b||b.disabled)return;
      if(b.hasAttribute("data-cities-select")){openSelection();return;}
      if(b.hasAttribute("data-cities-picker")){openPicker();return;}
      if(b.hasAttribute("data-progress-catalog")){rules("progress");return;}
      if(b.dataset.group){selectGroup(["harbor","discard"].includes(b.dataset.group)?b.dataset.group:group===b.dataset.group?"":b.dataset.group);return;}
      if(b.dataset.card){const card=room?.game?.citiesKnights.players[room.you].cards.find(card=>String(card.id)===b.dataset.cardId);if(!card)return;const o=available().find(x=>x.key===`play:${card.id}`);if(o&&!blocked())confirm(o);else explainCard(card);return;}
      const o=available().find(x=>x.key===b.dataset.choice);if(o){if(o.group==="choice")send({type:"ck",choice:o.key});else confirm(o);}
    };
    function boardClick(e) {
      const target=e.target.closest("[data-ck-choice]");if(!target||blocked())return;
      if(e.type==="keydown" && !["Enter"," "].includes(e.key))return;
      e.preventDefault();e.stopImmediatePropagation();const o=available().find(x=>x.key===target.dataset.ckChoice);
      if(!o)return;
      if(o.group==="move")moveSource=o.position.vertex;
      if(["wall","recruit","activate","promote","move"].includes(o.group) || ["engineering","pillage","smithing","moveKnight","relocate","merchant"].includes(room.game.citiesKnights.choice?.kind))send({type:"ck",choice:o.key});
      else confirm(o);
    }
    document.getElementById("board").addEventListener("click",boardClick,true);document.getElementById("board").addEventListener("keydown",boardClick,true);
    function render(r,pending=false){
      room=r;if(r)setMap(r.mapId);const g=r?.game,c=g?.citiesKnights;panel.hidden=!c;status.hidden=!c;fleet.hidden=!c;panel.dataset.pending=String(pending);refreshCardInfo();syncSelection();syncPicker();if(!c)return;
      const resolving=["pillage","reward"].includes(c.choice?.kind),position=resolving?7:c.ship,remaining=7-position;
      const zh=resolving?"蛮族入侵，正在结算":`距入侵还差 ${remaining} 格`,en=resolving?"Barbarian attack: resolving":`${remaining} ${remaining===1?"advance":"advances"} until attack`;
      if(fleet.dataset.position!==String(position)||fleet.dataset.resolving!==String(resolving)){
        fleet.dataset.position=String(position);fleet.dataset.urgent=String(remaining<=2);fleet.dataset.resolving=String(resolving);fleet.style.setProperty("--fleet-position",position);
        fleet.querySelector(".cities-fleet-state").innerHTML=`<strong>${zh}</strong><small>${en}</small>`;
        fleet.querySelectorAll("[data-step]").forEach(stop=>{stop.classList.toggle("passed",Number(stop.dataset.step)<position);stop.classList.toggle("current",Number(stop.dataset.step)===position);});
      }
      const robberNote=combinedMap()?"首次入侵前无强盗和海盗 / No robber or pirate before the first attack":"首次入侵前无强盗 / No robber before the first attack";
      fleet.querySelector(".cities-fleet-robber").innerHTML=combinedMap()?"首次入侵前无强盗和海盗<small>No robber or pirate before the first attack</small>":"首次入侵前无强盗<small>No robber before the first attack</small>";
      fleet.querySelector(".cities-fleet-robber").hidden=Boolean(c.attacked);
      fleet.setAttribute("aria-label",`蛮族船 / Barbarian ship · ${zh} / ${en}${c.attacked?"":" · "+robberNote} · 规则 / Rules`);
      if(c.choice?.kind==="moveKnight"){if(c.choice.from!=null)moveSource=c.choice.from;}else if(!pending)moveSource=null;
      const key=`${r.code}:${r.you}:${g.revision}`;if(key!==revision){revision=key;group="";if(dialog.open)dialog.close();}
      const all=available(), q=c.choice, opts=q?.player===r.you?all:all.filter(o=>o.group===group);
      const description=choiceDescription(g,r.you),heading=description?.heading||(q?choices[q.kind]||[q.kind,q.kind]:groups[group]?.slice(0,2));
      const disabled=blocked(),picker=pickerModel();
      const launch=(attribute,title,graphic)=>`<button type="button" class="primary cities-choice-launch" ${attribute} ${disabled?"disabled":""}>${graphic}<span>${esc(title[0])}<small>${esc(title[1])}</small></span></button>`;
      const batch=c.selection&&q?.player===r.you;
      const choiceEntry=batch?launch("data-cities-select",["选择卡牌","Choose cards"],art("paper")):picker?launch("data-cities-picker",picker.title,D.cards[picker.kind]?cardArt(picker.kind):art(picker.kind==="replaceRank"?"knight":"metropolis")):"";
      const boardButtons=opts.filter(o=>["cancel","done"].includes(o.key));

      const players=c.players.map((p,i)=>{
        const levels=p.levels.map((n,b)=>{
          const [zh,en]=D.branches[b],label=`${zh}改良等级：${n} / 5 · ${en} level: ${n} / 5`;
          return `<span class="cities-level" title="${label}" aria-label="${label}">${infoButton(en.toLowerCase())}<span class="cities-level-value" aria-hidden="true"><b>${n}级</b><small>Lv ${n}</small></span></span>`;
        }).join("");
        return `<div data-render-key="player:${i}" class="cities-player"><span style="border-left:3px solid ${B.COLORS[i]};padding-left:6px">${esc(g.players[i].name)}${p.defenders?` · +${p.defenders} VP`:""}</span>${levels}<span class="cities-strength" title="已激活骑士强度 / Active knight strength" aria-label="已激活骑士强度 / Active knight strength: ${p.strength}">${infoButton("knight")}<b>${p.strength}</b></span></div>`;
      }).join("");
      window.CatanRender.html(status, `<h3 class="cities-heading">城市与骑士 <small>Cities &amp; Knights</small><button class="icon-button" data-cities-rules title="规则 / Rules" aria-label="规则 / Rules"><i data-lucide="book-open" aria-hidden="true"></i></button></h3>${players}`);
      const hand=c.players[r.you].cards;
      window.CatanRender.html(panel, `<div class="cities-progress-heading"><div><h3 id="citiesProgressTitle">进步卡 <small>Progress cards</small></h3><p>我的手牌 · ${hand.length} 张 / My hand: ${hand.length}</p></div><button type="button" class="icon-button" data-progress-catalog aria-label="查看进步卡清单 / Browse progress cards" title="查看进步卡清单 / Browse progress cards"><i data-lucide="circle-help" aria-hidden="true"></i></button></div><div class="cities-progress" aria-labelledby="citiesProgressTitle">${hand.map(card=>{const d=D.cards[card.key],o=all.find(x=>x.key===`play:${card.id}`),ready=Boolean(o&&!disabled),hint=ready?"可用 / Ready":"暂不可用，点击查看说明 / Unavailable; view explanation";return `<button data-render-key="progress:${card.id}" type="button" data-card="${card.key}" data-card-id="${card.id}" data-ready="${ready}" data-choice="${ready?o.key:""}" data-progress-branch="${branchKey(d[0])}" aria-label="${esc(d[2]+" / "+d[3]+" · "+hint)}" title="${hint}">${cardArt(card.key)}<span class="cities-hand-card-name">${esc(d[2])}<small>${esc(d[3])}</small></span>${cardCategory(d[0])}${ready?'<span class="cities-card-ready">可用 / Ready</span>':'<span class="cities-card-unavailable"><span>暂不可用<small>Unavailable</small></span><span class="cities-card-help" aria-hidden="true">?</span></span>'}</button>`;}).join("")}</div>${hand.length?"":'<p class="cities-progress-empty">暂无进步卡手牌<small>No progress cards in hand</small></p>'}
        <div class="cities-controls">${Object.entries(groups).filter(([key])=>!["wall","recruit","activate","promote","improvement","move"].includes(key)&&all.some(o=>o.group===key)).map(([key,n])=>`<button data-group="${key}" class="secondary cities-tool-entry ${group===key?"selected":""}" ${disabled?"disabled":""}>${art(n[2])}<span>${n[0]}<small>${n[1]}</small></span></button>`).join("")}</div>
        ${heading?`<div class="cities-choice" aria-live="polite"><h3>${esc(heading.join(" / "))}${q?` · ${esc(g.players[q.player].name)}`:""}</h3>${description?`<div class="cities-choice-context">${infoList(description.items)}</div>`:""}<div class="cities-choice-list">${choiceEntry}</div>${boardButtons.length?`<div class="cities-board-actions">${boardButtons.map(o=>`<button type="button" class="${o.key==="done"?"primary":"secondary"}" data-choice="${esc(o.key)}" ${disabled?"disabled":""}><i data-lucide="${o.key==="done"?"check":"x"}" aria-hidden="true"></i>${esc(o.label)}</button>`).join("")}</div>`:""}</div>`:""}`);
      window.lucide?.createIcons();
    }
    function overlay(board){
      const svg=board.querySelector("svg");if(!svg)return;
      let layer=svg.querySelector(".cities-overlay");
      if(!room?.game?.citiesKnights){layer?.remove();return;}
      if(!layer){layer=document.createElementNS("http://www.w3.org/2000/svg","g");layer.classList.add("cities-overlay");svg.append(layer);}
      const g=room.game, c=g.citiesKnights, q=c.choice;
      const opts=blocked()?[]:q?.player===room.you?available():available().filter(o=>o.group===group);
      const pieces=g.board.vertices.filter(v=>v.knight||v.wall||v.metropolis!=null).map(v=>{
        const k=v.knight;
        if(k)return `<g data-render-key="knight:${v.id}" class="cities-knight-piece" data-cities-info="knight" role="button" tabindex="0" aria-label="${info.knight[0]} · 说明 / Info"><circle cx="${v.x}" cy="${v.y-4}" r="18" fill="transparent"/><circle cx="${v.x}" cy="${v.y-4}" r="15.5" fill="${k.active?"#fff0ad":"#b4c6c8"}" stroke="${B.COLORS[k.owner]}" stroke-width="2.6"/><use href="catan-cities-art.svg#knight" x="${v.x-14}" y="${v.y-23.5}" width="28" height="28" style="color:${B.COLORS[k.owner]}"/><text class="cities-knight-number" x="${v.x}" y="${v.y+11}" text-anchor="middle">${k.rank}</text><title>${k.rank} · ${k.active?"已激活 / Active":"未激活 / Inactive"}</title></g>`;
        const metropolis=v.metropolis!=null?`<use data-render-key="metropolis:${v.id}" data-cities-info="metropolis" role="button" tabindex="0" aria-label="${info.metropolis[0]} · 说明 / Info" href="catan-cities-art.svg#metropolis" x="${v.x-19}" y="${v.y-30}" width="38" height="38" style="color:${B.COLORS[v.owner]}"/>`:"";
        const wall=v.wall?`<g data-render-key="wall:${v.id}" class="cities-map-wall" data-wall-vertex="${v.id}" data-cities-info="wall" role="button" tabindex="0" aria-label="${info.wall[0]} · 说明 / Info"><title>${info.wall[0]}</title><rect x="${v.x-22}" y="${v.y-5}" width="44" height="22" fill="transparent"/><use href="catan-cities-art.svg#wall-map" x="${v.x-21}" y="${v.y-4}" width="42" height="19.25"/></g>`:"";
        return metropolis+wall;
      }).join("");
      const merchant=c.merchant?(()=>{const t=g.board.tiles[c.merchant.tile];return `<g data-render-key="merchant" data-cities-info="merchant" role="button" tabindex="0" aria-label="商人说明 / About the merchant"><circle cx="${t.x+23}" cy="${t.y-22}" r="18" fill="transparent"/><circle cx="${t.x+23}" cy="${t.y-22}" r="14" fill="${B.COLORS[c.merchant.owner]}" stroke="#2d5365" stroke-width="2"/><use href="catan-cities-art.svg#merchant" x="${t.x+10}" y="${t.y-35}" width="26" height="26"/></g>`;})():"";
      const targets=opts.filter(o=>o.position).map(o=>{
        const pos=o.position,t=pos.tile!=null?g.board.tiles[pos.tile]:pos.vertex!=null?g.board.vertices[pos.vertex]:(()=>{const e=g.board.edges[pos.edge],a=g.board.vertices[e.a],b=g.board.vertices[e.b];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};})();
        return `<g data-render-key="target:${esc(o.key)}" class="cities-board-target ${o.group==="move"?"cities-knight-move-target":""}" data-ck-choice="${esc(o.key)}" role="button" tabindex="0" aria-label="${esc(o.label)}">${o.group==="move"?`<circle cx="${t.x}" cy="${t.y-4}" r="19" fill="transparent" stroke="#ffe17a" stroke-width="3.5"/>`:`<circle cx="${t.x}" cy="${t.y}" r="17" fill="#fff5c9" stroke="#1f6b85" stroke-width="3"/><text x="${t.x}" y="${t.y+5}" font-size="15" text-anchor="middle" fill="#20516a">+</text>`}<title>${esc(o.label)}</title></g>`;
      }).join("");
      const source=q?.kind==="moveKnight"&&q.player===room.you&&moveSource!=null&&opts.some(o=>o.key==="cancel")?g.board.vertices[moveSource]:null;
      const cancel=source?`<g data-render-key="move-cancel" class="cities-board-target cities-knight-selected" data-ck-choice="cancel" role="button" tabindex="0" aria-label="取消移动 / Cancel move"><circle cx="${source.x}" cy="${source.y-4}" r="19" fill="transparent" stroke="#ffe17a" stroke-width="3.5"/><title>取消移动 / Cancel move</title></g>`:"";
      window.CatanRender.html(layer,`${pieces}${merchant}${targets}${cancel}`);
    }
    return {render,overlay,selectGroup,choose,get selectedGroup(){return group;}};
  }
  return {art,infoButton,showInfo,eventDie,rules,choiceDescription,mount,setMap};
})();
