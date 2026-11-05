"use strict";
(() => {
  const $ = id => document.getElementById(id), UI = window.BoardGameUI, E = window.TruthEngine;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const labels = { chill:["轻松","Chill"], heat:["心跳","Heat"], wild:["爆场","Wild"], unmasked:["失守","Unmasked"], showdown:["摊牌","Showdown"] };
  const params = new URLSearchParams(location.search), sessionKey = "boardclub-truth-session", localKey = "boardclub-truth-local";
  let mode = params.has("room") ? "online" : "local", category = "mixed", draftRoundKey = "", level = "heat", state = null, socket = null, reconnectTimer, animationTimer, pendingTimer, busy = false, rolling = false, intentionalClose = false, firstState = true;
  const seenChat = new Set(), bubbles = new Map(); let bubbleTimer, lastReaction = 0;
  const read = (storage,key) => { try { return storage.getItem(key); } catch { return null; } };
  const write = (storage,key,value) => { try { if(value === null)storage.removeItem(key);else storage.setItem(key,value); } catch {} };
  function synth(ctx,dest,kind) {
    if(kind !== "roll") return BoardGameAudio.synthesize(ctx,dest,kind);
    const nodes=[];
    for(let i=0;i<9;i++) {const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+i*.065;osc.type="triangle";osc.frequency.setValueAtTime(140+i%3*75,t);gain.gain.setValueAtTime(.13,t);gain.gain.exponentialRampToValueAtTime(.001,t+.045);osc.connect(gain);gain.connect(dest);osc.start(t);osc.stop(t+.05);nodes.push(osc,gain);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
    return {duration:.65,stop(){nodes.forEach(n=>{try{n.stop?.();n.disconnect();}catch{}});}};
  }
  const audio = BoardGameAudio.create({render:synth,sounds:{...BoardGameAudio.durations,roll:.65}});
  const uuid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,"0")).join("");
  const online = () => mode === "online";
  const live = () => !online() || socket?.readyState === WebSocket.OPEN;
  const social = UI.mountInteractions(() => state && ({code:state.code,players:state.seats,you:state.seats[state.you]?.socialId,connected:live()}),send,{audio,onSoundChange:soundButton});
  const management = UI.mountRoomControl(() => online() ? state?.control : null,send,() => $("roomPanel").querySelector(".room-heading"));
  const archives = BoardGameArchives.mount({ game: "truth", send,
    view: () => online() ? state?.control : state && ({ code: state.code, you: "local", host: "local", seats: state.seats, started: Boolean(state.game) }),
    name: () => $("playerName").value, anchor: $("onlineSetup"), local: {
      active: () => !online() && Boolean(state?.game),
      snapshot: () => ({ format: "boardclub-save", version: 1, game: "truth", savedAt: new Date().toISOString(), positions: state.seats.map((_, i) => i),
        config: { level: state.level, mode: state.mode, rounds: state.rounds, maxPlayers: state.seats.length, selection: state.selection, skipLimit: state.skipLimit }, progress: E.snapshot(state.game) }),
      finish: () => { state = null; write(sessionStorage, localKey, null); render(); }
    } });
  const localSaveButton = document.createElement("button"); localSaveButton.type = "button"; localSaveButton.id = "localSaveButton";
  localSaveButton.innerHTML = '<i data-lucide="save"></i>保存并退出 / Save & leave';
  localSaveButton.onclick = () => archives.saveLocal(); $("roomPanel").querySelector(".room-heading").append(localSaveButton);
  function icons(){window.lucide?.createIcons();}
  function error(message=""){ $("error").textContent=message; }
  function soundButton(){ $("soundBtn").innerHTML=`<i data-lucide="${audio.muted?"volume-x":"volume-2"}"></i>`;$("soundBtn").setAttribute("aria-pressed",String(!audio.muted));$("soundBtn").title=audio.muted?"开启音效 / Enable sound":"关闭音效 / Mute";icons(); }
  $("soundBtn").onclick=()=>{audio.setMuted(!audio.muted);soundButton();};
  for(const type of ["pointerdown","keydown"])document.addEventListener(type,()=>audio.unlock(),{passive:true});
  function saveLocal(){ if(state && !online())write(sessionStorage,localKey,JSON.stringify(state)); }
  function send(data){
    if(!online()){
      if(data.type === "reaction" && state){const from=state.seats[state.you],to=state.seats.find(p=>p.socialId===data.target);if(!from||!to||from===to||!GameSocialData.reactions[data.kind]||Date.now()-lastReaction<1000)return false;lastReaction=Date.now();social.receive({type:"reaction",id:uuid(),room:state.code,from:from.socialId,to:to.socialId,fromName:from.name,toName:to.name,kind:data.kind});return true;}
      return false;
    }
    if(socket?.readyState!==WebSocket.OPEN){error("正在重新连接，请稍候 / Reconnecting, please wait");return false;}
    socket.send(JSON.stringify(data));return true;
  }
  function animate(){clearTimeout(animationTimer);rolling=true;$("diceScene").classList.add("rolling");audio.play("roll");animationTimer=setTimeout(()=>{rolling=false;$("diceScene").classList.remove("rolling");render();},700);}
  function releaseBusy(){busy=false;clearTimeout(pendingTimer);}
  function action(type,kind,localActor){
    if(!state?.game || busy || rolling)return;
    error();
    const move={type};if(type==="choose")move.kind=kind;if(type==="ask"&&$("customPrompt").value.trim())move.text=$("customPrompt").value.trim();if(type==="reroll")$("customPrompt").value="";
    if(online()){
      if(!(E.requiredActors(state.game).includes(state.you)||E.canEdit(state.game,state.you))||state.control?.paused||!live())return;
      busy=true;
      if(!send({type:"action",action:type,...(move.kind?{kind:move.kind}:{}),...(move.text?{text:move.text}:{}),revision:state.game.revision})){releaseBusy();return;}
      if(type==="roll")animate();
      pendingTimer=setTimeout(()=>{releaseBusy();error("操作尚未确认，请稍后重试 / Action not confirmed; try again");render();},6000);
    }else{
      try{const actor=Number.isInteger(localActor)?localActor:["ask","reroll"].includes(type)?state.game.asker:state.game.current;E.act(state.game,actor,move);state.you=state.game.current;saveLocal();if(type==="roll")animate();if(type==="complete")audio.play("reaction-clap");}catch(e){error(e.message);}
    }
    render();
  }
  function setMode(value){if(state)return;mode=value;if(!online()&&socket){intentionalClose=true;clearTimeout(reconnectTimer);const previous=socket;socket=null;previous.close();}error();$("localSetup").hidden=online();$("onlineSetup").hidden=!online();$("joinForm").hidden=!online();document.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===mode)));$("createBtn").querySelector("span").textContent=online()?"创建房间 / Create room":"开始这一局 / Let's play";if(online())connect();render();}
  function setLevel(value){level=value;document.querySelectorAll("[data-level]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.level===level)));}
  function identity(){const name=$("playerName").value.trim();if(!name){error("先填一个名字 / Enter your name first");$("playerName").focus();return null;}write(localStorage,"boardclub-name",name);return {name,avatar:UI.getAvatar()};}
  function create(){
    error();const rounds=0,maxPlayers=Number($("setupPlayers").value),selection=$("selection").value,skipLimit=Number($("skipLimit").value);
    if(online()){const p=identity();if(p)send({type:"create",...p,level,rounds,mode:category,maxPlayers,selection,skipLimit});return;}
    const names=$("localNames").value.split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean);
    if(names.length!==maxPlayers){error(`请填写 ${maxPlayers} 位玩家的名字 / Enter ${maxPlayers} player names`);return;}
    if(names.some(s=>Array.from(s).length>18)){error("名字请控制在 18 字以内 / Names must be at most 18 characters");return;}
    state={code:`local-${uuid()}`,you:0,host:0,level,rounds,mode:category,selection,skipLimit,chat:[],seats:names.map((name,i)=>({name,avatar:i===0?UI.getAvatar():null,socialId:uuid(),connected:true,bot:false,ready:true})),game:E.createGame(names.length,{level,rounds,mode:category,selection,skipLimit})};state.you=state.game.current;saveLocal();render();$("turnPill").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
  }
  function connect(){
    if(!online()||socket && [WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState))return;
    clearTimeout(reconnectTimer);intentionalClose=false;
    if(location.protocol==="file:"){error("在线模式需要运行网站服务器 / Online mode requires the game server");return;}
    const current=new WebSocket(`${location.protocol==="https:"?"wss:":"ws:"}//${location.host}/truth-ws`);socket=current;
    $("connection").textContent="连接中 / Connecting";
    current.onopen=()=>{if(socket!==current)return;$("connection").textContent="已连接 / Connected";send({type:"hello",token:read(sessionStorage,sessionKey)});render();};
    current.onmessage=({data})=>{
      if(socket!==current)return;
      let message;try{message=JSON.parse(data);}catch{return;}
      if(archives.receive(message))return;
      if(message.type==="welcome"){write(sessionStorage,sessionKey,message.token);return;}
      if(message.type==="reaction"){social.receive(message);return;}
      if(message.type==="error"){releaseBusy();error(message.message);render();return;}
      if(message.type==="left"){releaseBusy();const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url);state=null;bubbles.clear();firstState=true;render();if(message.reason)error(message.reason);return;}
      if(message.type!=="state")return;
      const old=state;
      if(old?.code!==message.code){seenChat.clear();bubbles.clear();firstState=true;}
      if(old?.game?.stage==="roll" && old.game.revision!==message.game?.revision && !rolling)animate();
      if(old?.game?.phase==="playing" && message.game?.phase==="over")audio.play("reaction-luck");
      state=message;const url=new URL(location.href);url.searchParams.set("room",state.code);history.replaceState(null,"",url);releaseBusy();error();
      for(const item of message.chat||[]){if(!firstState&&!seenChat.has(item.id)&&Date.now()-item.time<6000)bubbles.set(item.playerId,item);seenChat.add(item.id);}
      firstState=false;clearTimeout(bubbleTimer);if(bubbles.size)bubbleTimer=setTimeout(()=>{bubbles.clear();render();},6000);
      render();
    };
    current.onclose=event=>{if(socket!==current)return;releaseBusy();$("connection").textContent="连接中断 / Disconnected";render();if(online()&&!intentionalClose&&event.code!==4001)reconnectTimer=setTimeout(connect,1500);if(event.code===4001)error("此身份已在其他窗口连接，请刷新后重连 / Connected in another window; refresh to reconnect");};
    current.onerror=()=>{if(online())error("连接暂时不可用，正在重试 / Connection unavailable; retrying");};
  }
  function render(){
    localSaveButton.hidden = online() || !state?.game;
    const g=state?.game, active=g?.phase==="playing", over=g?.phase==="over", me=state?.you, current=state?.seats[g?.current], together=g?.selection==="together", mine=!online()||(g&&E.requiredActors(g).includes(me));
    const editor=active&&(!online()||E.canEdit(g,me))&&E.canEdit(g,g.asker)&&live()&&!state?.control?.paused&&!busy&&!rolling;
    const legacy=g?.version===2;
    document.body.classList.toggle("legacy-dice",legacy);document.body.classList.toggle("together-answer",together);
    const enabled=active&&mine&&live()&&!state?.control?.paused&&!busy&&!rolling&&(!online()||!state.seats[me]?.auto);
    const categoryNames={truth:"只玩真心话 / Truth only",dare:"只玩大冒险 / Dare only",mixed:"真心话 + 大冒险 / Both"};
    const asker=state?.seats[g?.asker],target=state?.seats[g?.target],kindName=g?.kind==="dare"?"大冒险 / DARE":"真心话 / TRUTH";
    $("setup").hidden=!!state;$("roomPanel").hidden=!state;$("chatPanel").hidden=!state||!online();document.body.classList.toggle("in-game",!!state);
    $("modeLabel").innerHTML=`<i data-lucide="${online()?"globe-2":"users"}"></i>${online()?"在线房间 / Online party":"同屏聚会 / Pass & play"}`;
    const orderLabels={random:"随机问答 / Random pairs",chain:"回答者接着问 / Respondent asks next",together:"共同回答 / Answer together",dice:"掷骰选人 / Dice"};
    $("roundLabel").textContent=g?over?"已完成 / Finished":legacy?`第 ${g.round} / ${g.rounds} 轮 · ROUND ${g.round}`:`第 ${g.round} 题 / Question ${g.round}`:orderLabels[$("selection").value];
    const table=document.querySelector(".play-table");table.classList.toggle("has-challenge",active&&g.stage!=="roll");table.classList.toggle("finished",over);
    $("die").dataset.value=g?.die||5;
    $("diceScene").hidden=!legacy;
    $("turnPill").textContent=active?together?"同一道题，两个人回答 / One question, both answer":g.stage==="roll"?`${current?.name||"玩家"} ${g.tie?"加掷 / rerolls":"掷骰 / rolls"}`:`${asker?.name||"玩家"} 出题 → ${target?.name||"玩家"} 接招`:over?"这一局，你们都有故事 / A night to remember":state?"等朋友到齐 / Waiting for your friends":"从一个问题开始 / Start with a question";
    $("diceResults").hidden=!legacy||over;
    $("diceResults").innerHTML=g&&!over?state.seats.map((p,i)=>{const tieRoll=g.tie?.candidates.includes(i)?g.tie.dice[i]:null;const past=(g.tieHistory||[]).filter(t=>t.candidates.includes(i)).at(-1);return `<div class="dice-result ${i===g.asker?"high":i===g.target?"low":""} ${g.stage==="roll"&&i===g.current?"is-rolling":""}"><strong>${g.dice[i]||"—"}</strong><small>${esc(p.name)}</small>${tieRoll!==null?`<span class="tie-value">加掷 ${tieRoll||"…"}</span>`:past?`<span class="tie-value">加掷 ${past.dice[i]}</span>`:""}${i===g.asker?'<small>出题 / ASK</small>':i===g.target?'<small>接招 / ANSWER</small>':""}</div>`;}).join(""):"";
    let badge="TRUTH OR DARE",zh="今晚，想聊点什么？",en="What shall we talk about?",buttons="",hint="2–8 人 / Players · 真心话 / Truth · 大冒险 / Dare · Mixed";
    if(!state)buttons='<button id="setupFocus" class="primary roll-button"><i data-lucide="dices"></i><span>先邀请你的玩家<small>Add your players to begin</small></span><i data-lucide="arrow-right"></i></button>';
    else if(!g){badge="THE GUEST LIST";zh="好戏，等你们到齐。";en="Waiting for everyone to take a seat.";hint="每位玩家准备后，由房主开始 / Ready up, then the host starts";}
    else if(over){const winners=g.winners.map(i=>state.seats[i]?.name||"玩家");badge="THE STARS OF TONIGHT · 挑战积分";zh=`${winners.join("、")} ${winners.length>1?"并列胜利":"胜利"}`;en=`${winners.join(" & ")} ${winners.length>1?"win together":"wins"} · ${Math.max(...g.scores)} completed challenges`;hint="谢谢今晚的坦诚和勇气 / Here's to your honesty and courage";buttons='<button data-play="restart" class="primary">再来一局 / Another round</button>';}
    else if(g.stage==="roll"){
      const role=g.tie?.role;
      badge=role==="high"?"最高点数并列 · HIGH ROLL TIE":role==="low"?"最低点数并列 · LOW ROLL TIE":role?"全员同点 · EVERYONE TIED":"EVERYONE ROLLS · 大家都掷一次";
      zh=role?`${current?.name}，加掷决出${role==="high"?"出题人":role==="low"?"接招人":"高低点数"}。`:mine?"掷出去，看看谁问谁。":`等 ${current?.name} 掷骰子`;
      en=role?"Only tied players reroll. The other results stay put.":"Highest roll gets to ask. Lowest roll takes the challenge.";
      buttons=`<button data-play="roll" class="primary roll-button" ${enabled?"":"disabled"}><i data-lucide="dices"></i><span>${role?"加掷骰子":"掷骰子"}<small>${role?"ROLL TO BREAK THE TIE":"LET IT ROLL"}</small></span><i data-lucide="arrow-right"></i></button>`;
      hint=online()?"轮到的玩家自行掷骰 / Each player rolls on their turn":"把手机交给当前玩家掷骰 / Pass the phone to the current roller";
    }
    else if(g.stage==="choose"){badge="提问者选题 · THE ASKER'S CHOICE";zh=`${asker?.name}，想让 ${target?.name} 说，还是做？`;en="Choose a truth or dare for the respondent.";buttons=`<button data-play="choose" data-kind="truth" class="choose-truth" ${enabled?"":"disabled"}>问真心话 / Truth</button><button data-play="choose" data-kind="dare" class="choose-dare" ${enabled?"":"disabled"}>出大冒险 / Dare</button>`;hint="混合模式：由提问者选择类型 / Mixed mode: the asker chooses";}
    else if(g.stage==="prepare"){
      badge=`${kindName} · ${asker?.name} 正在出题 / PREPARING`;
      zh=mine?g.prompt?.zh||"":`${asker?.name} 正在给 ${target?.name} 准备一道题。`;
      en=mine?g.prompt?.en||"":"The asker is choosing a prompt.";
      buttons=`<button data-play="ask" class="primary" ${enabled?"":"disabled"}>${$("customPrompt").value.trim()?"用我的题，发起挑战 / Ask my prompt":"就问这题 / Ask this"}</button><button data-play="reroll" class="action-quiet" ${enabled&&(legacy||g.replacements<2)?"":"disabled"}><i data-lucide="refresh-cw"></i>换题 / Replace ${legacy?"":`(${2-g.replacements}/2)`}</button>`;
      hint=mine?`这道题由你问 ${target?.name}；可用题库，也可自己写。 / Pick a prompt or write your own.`:"等出题人确认后揭晓 / Waiting for the asker's final choice";
    }
    else if(g.stage==="challenge"){
      badge=together?"共同回答 / ANSWER TOGETHER":`${kindName} · ${asker?.name} 问 ${target?.name}`;zh=g.prompt?.zh||"";en=g.prompt?.en||"";
      const respondents=together?online()?[me]:[0,1]:[g.target];
      buttons=respondents.map(i=>{const responded=together&&g.responses[i]!==null,can=enabled&&!responded,remaining=legacy||g.skipLimit===-1?"∞":Math.max(0,g.skipLimit-g.skipsUsed[i]);return `<div class="answer-actions">${together?`<strong>${esc(state.seats[i].name)}${responded?" · 已回应 / Answered":""}</strong>`:""}<button data-play="complete" data-actor="${i}" class="primary" ${can?"":"disabled"}>完成了${legacy?" +1":""} / Done</button><button data-play="skip" data-actor="${i}" class="action-quiet" ${can&&E.canSkip(g,i)?"":"disabled"}>跳过 / Skip (${remaining})</button></div>`;}).join("");
      if(together&&editor)buttons+=`<button data-play="reroll" ${g.replacements<2?"":"disabled"}><i data-lucide="refresh-cw"></i>换题 / Replace (${2-g.replacements}/2)</button><button data-play="ask">用我的题 / Use my question</button>`;
      hint=together?"两人都回应后进入下一题 / Next question after both respond":mine?(E.canSkip(g,me)?"回答或完成后确认 / Confirm after answering or completing":"跳过次数已用完；不舒服时可以停止游戏。 / No skips left; you can still stop playing."):`等 ${target?.name} 回应 / Waiting for ${target?.name}`;
    }
    if(rolling){badge="ROLLING · 骰子转动中";zh="这次，谁问谁？";en="The dice are choosing your roles.";buttons="";hint="马上揭晓 / Here it comes…";}
    if(state?.control?.paused)hint="有空位待补齐，游戏已暂停 / Paused until all vacancies are filled";
    else if(state&&online()&&!live())hint="连接中断，正在重连；游戏进度会保留 / Reconnecting; progress is kept";
    else if(active&&online()&&state.seats[me]?.auto)hint="你已开启托管；出题自动选题，接招自动跳过 / Auto selects prompts and passes challenges";
    if(active&&g.stage==="challenge"&&online()&&!state.control?.paused){const waiting=E.requiredActors(g).find(i=>(state.seats[i]?.bot||state.seats[i]?.auto)&&!E.canSkip(g,i));if(waiting!==undefined)hint=`${state.seats[waiting].name} 已用完跳过次数：停止托管手动回应，或由房主换真人。 / No skips left: stop auto to answer, or replace the bot with a human.`;}
    const draftKey=state&&g?`${state.code}:${g.round}:${g.asker}`:"";
    if(draftKey!==draftRoundKey){draftRoundKey=draftKey;$("customPrompt").value="";}
    $("askForm").hidden=!editor;$("customPrompt").disabled=!editor;$("customCount").textContent=`${$("customPrompt").value.length} / 240`;
    $("kindBadge").textContent=badge;$("promptZh").textContent=zh;$("promptEn").textContent=en;$("playActions").innerHTML=buttons;$("turnHint").textContent=hint;
    if(state){
      if(!online())$("playerName").value=state.seats[state.you]?.name||"";
      $("roomCode").textContent=online()?state.code:"";$("roomCode").hidden=!online();$("roomType").textContent=online()?"ROOM CODE / 房间码":"PASS & PLAY / 同屏聚会";$("copyBtn").hidden=!online();$("roomSettings").textContent=`${categoryNames[state.mode||"mixed"]} · ${labels[state.level][0]}${legacy?` · ${state.rounds} 轮 / rounds`:""} · ${orderLabels[state.selection||"dice"]} · 跳过 / Skips ${state.skipLimit===-1||legacy?"∞":state.skipLimit}`;
      $("playerCount").textContent=`${state.seats.filter(p=>p&&!p.vacant).length} / ${state.maxPlayers||state.seats.length}`;
      $("players").innerHTML=state.seats.map((p,i)=>{if(!p)return"";const bubble=bubbles.get(i);return `<div class="player-row ${active&&i===g.current?"active":""}">${UI.avatar(p,!!p.connected&&(p.bot||live()),"party-avatar game-avatar",!p.vacant&&i===me)}<div class="player-detail"><strong>${esc(p.name)}${p.bot?" · BOT":""}${active?`<span class="seat-die">⚄ ${g.dice[i]||"—"}</span>`:""}</strong><small>${p.vacant?"空位 / Vacant":`${online()&&i===me?"你 / You · ":""}${online()&&i===state.host?"房主 / Host · ":""}${!g?p.ready?"已准备 / Ready":"未准备 / Not ready":p.auto?"托管 / Auto":active&&i===g.current?"当前操作 / Acting":""}`}</small>${active&&i===g.asker?'<div class="role-tag">出题人 / Asker</div>':active&&i===g.target?'<div class="role-tag low">接招人 / Respondent</div>':""}${bubble?`<span class="player-chat">${esc(bubble.text)}</span>`:""}</div><span class="score">${g?.scores[i]??"—"}<small>${g?legacy?"POINTS":"完成 / Done":""}</small></span>${online()&&!g&&p.bot&&me===state.host?`<button class="remove-bot icon-button" data-remove-bot="${esc(p.socialId)}" aria-label="移除 ${esc(p.name)} / Remove bot"><i data-lucide="x"></i></button>`:""}</div>`;}).join("");
      $("lobbyActions").hidden=!!g||!online();$("readyBtn").hidden=me===state.host;$("readyBtn").textContent=state.seats[me]?.ready?"取消准备 / Unready":"准备 / Ready";$("startBtn").hidden=me!==state.host;$("addBotBtn").hidden=me!==state.host;$("addBotBtn").disabled=state.seats.filter(Boolean).length>=state.maxPlayers;
      $("startBtn").disabled=!live()||state.seats.filter(Boolean).length<(state.selection==="dice"?2:state.maxPlayers)||!state.seats.filter(Boolean).every((p,i)=>p.bot||p.connected&&(p.ready||i===state.host));
      $("restartBtn").hidden=!over||online()&&me!==state.host;const restart=$("playActions").querySelector('[data-play="restart"]');if(restart)restart.disabled=online()&&me!==state.host||!live();
      const previous=$("messages").textContent;$("messages").innerHTML=(state.chat||[]).map(m=>`<p><b>${esc(m.name||state.seats[m.playerId]?.name||"玩家")}</b>${esc(m.text)}</p>`).join("");if(previous!==$("messages").textContent)$("messages").scrollTop=$("messages").scrollHeight;
    }
    $("historySection").hidden=!g?.history?.length;
    $("history").innerHTML=(g?.history||[]).slice().reverse().map(h=>`<li><span>${h.completed?legacy?"+1":"DONE":"PASS"}</span><div><b>${g.selection==="together"?"":`${esc(state.seats[h.asker]?.name||"出题人")} → `}${esc(state.seats[h.target??h.actor]?.name||"接招人")}</b> ${esc(h.prompt?.zh||"")}<small>${esc(h.prompt?.en||"")}</small></div></li>`).join("");
    social.sync();management.sync();icons();
  }
  $("playActions").onclick=event=>{const button=event.target.closest("button");if(!button||button.disabled)return;if(button.id==="setupFocus"){$("setup").scrollIntoView({behavior:"smooth",block:"center"});(online()?$("playerName"):$("localNames")).focus({preventScroll:true});return;}if(button.dataset.play==="restart")restart();else if(button.dataset.play)action(button.dataset.play,button.dataset.kind,!online()&&button.hasAttribute("data-actor")?Number(button.dataset.actor):undefined);};
  function restart(){if(online())send({type:"restart"});else if(state){state.game=E.createGame(state.seats.length,{level:state.level,rounds:state.rounds,mode:state.mode,selection:state.selection||"dice",skipLimit:state.skipLimit});state.you=state.game.current;saveLocal();render();}}
  function setupOptions(){const eligible=Number($("setupPlayers").value)===2&&category==="truth";$("selection").querySelector('[value="together"]').disabled=!eligible;if(!eligible&&$("selection").value==="together")$("selection").value="random";render();}
  $("setupPlayers").onchange=()=>{const names=$("localNames").value.split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean);$("localNames").value=Array.from({length:Number($("setupPlayers").value)},(_,i)=>names[i]||`玩家 ${i+1}`).join("\n");setupOptions();};
  $("selection").onchange=setupOptions;
  document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll("[data-category]").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.category===category)));setupOptions();});
  $("customPrompt").oninput=()=>{$("customCount").textContent=`${$("customPrompt").value.length} / 240`;const button=$("playActions").querySelector("[data-play=ask]");if(button)button.textContent=$("customPrompt").value.trim()?"用我的题，发起挑战 / Ask my prompt":"就问这题 / Ask this";};
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll("[data-level]").forEach(b=>b.onclick=()=>setLevel(b.dataset.level));
  $("playerName").value=read(localStorage,"boardclub-name")||"";UI.mountAvatarPicker($("avatarPicker"),$("playerName"));
  window.addEventListener("board-avatar-change",({detail})=>{if(!state)return;if(online())send({type:"profile",avatar:detail.avatar});else{state.seats[state.you].avatar=AvatarData.normalize(detail.avatar);saveLocal();render();}});
  $("createBtn").onclick=create;$("joinForm").onsubmit=event=>{event.preventDefault();const p=identity();if(p)send({type:"join",...p,code:$("roomInput").value.trim().toUpperCase()});};$("roomInput").value=params.get("room")||"";
  $("players").onclick=event=>{const button=event.target.closest("[data-remove-bot]");if(!button||!state)return;const code=state.code,target=button.dataset.removeBot,hostId=state.seats[state.host]?.socialId;UI.confirmRemoval({name:state.seats.find(p=>p.socialId===target)?.name||"Bot",started:false,valid:()=>state?.code===code&&!state.game&&state.host===state.you&&state.seats[state.host]?.socialId===hostId&&state.seats.some(p=>p.bot&&p.socialId===target),remove:()=>send({type:"removeBot",target})});};
  $("readyBtn").onclick=()=>send({type:"ready",ready:!state?.seats[state.you]?.ready});$("startBtn").onclick=()=>send({type:"start"});$("addBotBtn").onclick=()=>send({type:"addBot"});$("restartBtn").onclick=restart;
  $("leaveBtn").onclick=()=>{$("leaveText").textContent=online()?"离开后会保留你的席位；其他玩家可等待你返回，或由房主管理补位。 / Your seat remains; the host can arrange a replacement.":"结束后会清除本机这局进度。 / This clears this local game's progress.";$("leaveDialog").showModal();};$("cancelLeave").onclick=()=>$("leaveDialog").close();$("confirmLeave").onclick=()=>{$("leaveDialog").close();if(online())send({type:"leave"});else{state=null;write(sessionStorage,localKey,null);render();}};
  $("copyBtn").onclick=async()=>{if(!state)return;const url=new URL("truth.html",location.href);url.searchParams.set("room",state.code);try{await navigator.clipboard.writeText(url.href);error("邀请链接已复制 / Invitation copied");}catch{error(`房间码 / Room ${state.code} · ${url.href}`);}};
  $("chatForm").onsubmit=event=>{event.preventDefault();const text=$("chatText").value.trim();if(text&&send({type:"chat",text}))$("chatText").value="";};
  if(!online()){try{const stored=JSON.parse(read(sessionStorage,localKey)||"null");if([2,3].includes(stored?.game?.version)&&stored.seats?.length>=2&&stored.seats.length<=12&&labels[stored.level]&&stored.game.scores?.length===stored.seats.length){state=stored;state.you=stored.game.current;state.seats.forEach(p=>p.avatar=AvatarData.normalize(p.avatar));}}catch{write(sessionStorage,localKey,null);}}
  if(state&&!online()){
    E.resumeEndless(state.game);state.rounds=state.game.rounds;state.you=state.game.current;saveLocal();
    level=state.level;category=state.mode||"mixed";$("setupPlayers").value=String(Math.min(8,state.seats.length));$("localNames").value=state.seats.slice(0,8).map(p=>p.name).join("\n");
    $("selection").value=E.SELECTIONS.includes(state.selection)?state.selection:"random";$("skipLimit").value=String(state.skipLimit??-1);
    document.querySelectorAll("[data-category]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.category===category)));setupOptions();
  }
  setLevel(level);setMode(mode);soundButton();render();
  window.addEventListener("pagehide",()=>{saveLocal();audio.stop();});
})();
