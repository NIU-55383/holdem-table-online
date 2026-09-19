"use strict";
const {WebSocketServer,WebSocket}=require("ws"),crypto=require("node:crypto");
const E=require("./richman-engine"),Avatar=require("./avatar-data");
const Social=require("./game-social");
function attachRichman(server,options={}){
  const rooms=new Map(),sessions=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:32768});
  const control=require("./room-control").createRoomControl({rooms,
    active:r=>r.game&&r.game.phase!=="over",started:r=>Boolean(r.game),
    turnKey:r=>r.game&&`${r.game.day}:${r.game.phase}:${r.game.current}`,actors:r=>[r.game.current],
    stop,changed:r=>{broadcast(r);schedule(r);},
    remove:(r,p)=>{const s=sessions.get(p.token);if(s)s.room="";send(p.ws,{type:"left",reason:"房主已将你移出房间 / Removed by the host"});}
  });
  const ensure=E.requireRule,clean=(s,n=18)=>String(s||"").trim().replace(/\s+/g," ").slice(0,n);
  const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
  const connected=p=>Boolean(p&&(p.bot||p.ws?.readyState===WebSocket.OPEN));
  const present=room=>room.seats.some(p=>p&&!p.bot&&connected(p));
  function state(room,token){return{type:"state",code:room.code,options:room.options,you:room.seats.findIndex(p=>p?.token===token),host:room.seats.findIndex(p=>p?.token===room.host),seats:room.seats.map(p=>p?{socialId:Social.publicId(p),name:p.name,avatar:p.avatar,bot:p.bot,vacant:!!p.vacant,connected:connected(p),ready:p.ready,auto:!!p.auto}:null),control:control.snapshot(room,room.seats.find(p=>p?.token===token)),game:room.game?E.snapshot(room.game,room.seats.findIndex(p=>p?.token===token)):null,chat:room.chat};}
  function broadcast(room){control.sync(room);room.updated=Date.now();for(const p of room.seats)if(p&&!p.bot&&p.ws)send(p.ws,state(room,p.token));}
  function stop(room){clearTimeout(room.timer);room.timer=null;}
  function schedule(room){
    if(control.paused(room)||room.timer||!room.game||room.game.phase==="over"||!present(room))return;
    const p=room.seats[room.game.current];
    if(!p.bot&&!p.auto)return;
    const delay=options.botDelay??(1000+(room.game.lastMove?.path.length||0)*135);
    room.timer=setTimeout(()=>{
      room.timer=null;if(control.paused(room)||!present(room)||room.game.phase==="over")return;
      const seat=room.seats[room.game.current];if(!seat.bot&&!seat.auto)return;
      try{E.apply(room.game,room.game.current,E.botAction(room.game,room.game.current,room.options.difficulty));}
      catch(error){console.error("Richman AI:",error.message);try{E.apply(room.game,room.game.current,{type:room.game.phase==="roll"?"roll":"done"});}catch(failure){console.error("Richman fallback:",failure.message);return;}}
      broadcast(room);schedule(room);
    },delay);room.timer.unref();
  }
  function addBot(room){
    const familiar=["Connie","Colin","Angela","Stephan","Zoey","William","Tim","Gary","Alison"],common=["Alex","Emma","James","Olivia","Daniel","David","Sophia","Emily","Michael","Sarah","Ryan","Anna","Chris","Laura"];
    const pool=(crypto.randomInt(10)<4?familiar:common).filter(n=>!room.seats.some(p=>p?.name===n));
    room.seats[room.seats.indexOf(null)]={token:crypto.randomUUID(),name:pool[crypto.randomInt(pool.length)],avatar:Avatar.randomBot(),bot:true,ready:true};
  }
  function start(room){stop(room);room.game=E.createGame(room.seats.map(p=>p.name),room.options);room.seats.forEach(p=>{p.auto=false;});broadcast(room);schedule(room);}
  function detach(session,explicit){
    const room=rooms.get(session.room);if(!room)return;
    const id=room.seats.findIndex(p=>p?.token===session.token),seat=room.seats[id];if(!seat)return;
    seat.ws=null;
    control.elect(room);
    if(explicit){session.room="";if(!room.game)room.seats[id]=null;}
    stop(room);broadcast(room);schedule(room);
  }
  wss.on("connection",ws=>{
    let session,count=0,since=Date.now();ws.alive=true;
    ws.on("pong",()=>{ws.alive=true;});ws.on("error",()=>ws.close());
    ws.on("message",raw=>{try{
      if(Date.now()-since>5000){count=0;since=Date.now();}ensure(++count<100,"操作太快 / Too many requests");
      const data=JSON.parse(raw);ensure(data&&typeof data==="object","请求无效 / Invalid request");
      if(data.type==="hello"){
        ensure(!session,"已连接 / Already connected");session=sessions.get(data.token);
        if(!session){session={token:crypto.randomBytes(24).toString("hex"),room:""};sessions.set(session.token,session);}
        const old=session.ws;session.ws=ws;session.updated=Date.now();if(old&&old!==ws)old.close(4001,"Reconnected");
        send(ws,{type:"welcome",token:session.token});const room=rooms.get(session.room),seat=room?.seats.find(p=>p?.token===session.token);
        if(seat){seat.ws=ws;stop(room);broadcast(room);schedule(room);}return;
      }
      ensure(session?.ws===ws,"请先连接 / Connect first");session.updated=Date.now();
      const avatar=Object.hasOwn(data,"avatar")?Avatar.normalize(data.avatar):undefined;
      if(data.type==="create"){
        const name=clean(data.name),size=data.players;ensure(name,"请输入名字 / Enter a name");ensure(Number.isInteger(size)&&size>=2&&size<=6,"需要 2–6 人 / Need 2–6 players");
        ensure([20000,50000,100000].includes(data.funds)&&[0,30,60,90].includes(data.days)&&["easy","normal","hard"].includes(data.difficulty),"设置无效 / Invalid settings");ensure(rooms.size<200,"服务器繁忙 / Server busy");
        detach(session,true);let code;do{code="R"+crypto.randomBytes(3).toString("hex").slice(0,5).toUpperCase();}while(rooms.has(code));
        const room={code,options:{funds:data.funds,days:data.days,difficulty:data.difficulty},host:session.token,seats:Array(size).fill(null),game:null,chat:[],updated:Date.now(),timer:null};
        room.seats[0]={token:session.token,name,avatar:avatar||null,bot:false,ws,ready:true};rooms.set(code,room);session.room=code;
        if(data.ai){while(room.seats.includes(null))addBot(room);start(room);}else broadcast(room);return;
      }
      if(data.type==="join"){
        const room=rooms.get(clean(data.code,6).toUpperCase()),name=clean(data.name);ensure(room,"找不到房间 / Room not found");ensure(name,"请输入名字 / Enter a name");
        const former=room.seats.findIndex(p=>p?.token===session.token);ensure(former>=0||control.vacancy(room)>=0||!room.game&&room.seats.includes(null),"房间已满或已开局 / Full or started");
        if(session.room&&session.room!==room.code)detach(session,true);
        if(former>=0){room.seats[former].ws=ws;room.seats[former].auto=false;}else{const player={token:session.token,name,avatar:avatar||null,bot:false,ws,ready:!!room.game};if(control.vacancy(room)>=0)control.fill(room,control.vacancy(room),player);else room.seats[room.seats.indexOf(null)]=player;}
        session.room=room.code;if(!room.seats.some(p=>p?.token===room.host&&connected(p)))room.host=session.token;
        stop(room);broadcast(room);schedule(room);return;
      }
      const room=rooms.get(session.room);ensure(room,"请先加入房间 / Join a room");const id=room.seats.findIndex(p=>p?.token===session.token);ensure(id>=0,"没有座位 / No seat");
      if(control.handle(room,room.seats[id],data))return;
      if(data.type==="reaction"){const event=Social.reaction(room,room.seats,room.seats[id],data);room.seats.forEach(p=>{if(p&&!p.bot)send(p.ws,event);});return;}
      const host=()=>ensure(room.host===session.token,"仅房主可操作 / Host only");
      if(data.type==="leave"){detach(session,true);send(ws,{type:"left"});return;}
      if(!["profile","chat","auto"].includes(data.type))control.guard(room);
      if(data.type==="profile"){ensure(avatar!==undefined,"请选择头像 / Choose avatar");room.seats[id].avatar=avatar;}
      else if(data.type==="ready"){ensure(!room.game||room.game.phase==="over","游戏已开始 / Game started");room.seats[id].ready=!!data.ready;}
      else if(data.type==="bots"){host();ensure(!room.game,"游戏已开始 / Game started");if(data.remove!==undefined){ensure(room.seats[data.remove]?.bot,"只能移除机器人 / Bots only");ensure(data.target===undefined||Social.publicId(room.seats[data.remove])===data.target,"座位已变化，请重新确认 / Seat changed; confirm again");room.seats[data.remove]=null;}else{ensure(room.seats.includes(null),"座位已满 / Room full");addBot(room);if(data.fill)while(room.seats.includes(null))addBot(room);}}
      else if(data.type==="start"){host();ensure(!room.game||room.game.phase==="over","本局未结束 / Game still playing");ensure(room.seats.every(p=>p&&p.ready&&connected(p)),"等待所有玩家入座并准备 / Waiting for ready players");start(room);return;}
      else if(data.type==="auto"){room.seats[id].auto=!room.seats[id].auto;stop(room);}
      else if(data.type==="action"){
        ensure(room.game&&data.action&&typeof data.action==="object","尚未开局 / Not started");
        ensure(data.action.type==="stock"||data.revision===room.game.revision,"棋盘已更新，请重试 / Board changed; try again");
        ensure(!room.seats[id].auto,"请先取消托管 / Turn off auto first");E.apply(room.game,id,data.action);control.touch(room,room.seats[id]);stop(room);
      }
      else if(data.type==="chat"){const text=clean(data.text,160);if(text){room.chat.push({id:crypto.randomUUID(),playerId:id,text,time:Date.now()});room.chat=room.chat.slice(-50);}}
      else throw Error("未知操作 / Unknown action");broadcast(room);schedule(room);
    }catch(error){send(ws,{type:"error",message:error.message});}});
    ws.on("close",()=>{if(session?.ws===ws){session.ws=null;detach(session,false);}});
  });
  const heartbeat=setInterval(()=>{
    wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping();});
    for(const[code,room]of rooms)if(!present(room)&&Date.now()-room.updated>3600000){stop(room);rooms.delete(code);}
    for(const[token,s]of sessions)if(!s.ws&&Date.now()-s.updated>12*3600000)sessions.delete(token);
  },30000);heartbeat.unref();
  server.on("close",()=>{control.close();clearInterval(heartbeat);rooms.forEach(stop);wss.clients.forEach(ws=>ws.terminate());wss.close();});
  return{rooms,upgrade:(r,s,h)=>wss.handleUpgrade(r,s,h,ws=>wss.emit("connection",ws,r))};
}
module.exports={attachRichman};
