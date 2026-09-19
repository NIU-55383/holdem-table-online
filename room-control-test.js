"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { once } = require("node:events");
const { spawn } = require("node:child_process"), crypto = require("node:crypto"), { WebSocket } = require("ws");
const { createRoomControl } = require("./room-control"), Social = require("./game-social");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("inactivity warns before auto, stay resets the deadline, and empty seats suspend timers", async () => {
  const previous = [process.env.ROOM_IDLE_MS, process.env.ROOM_WARNING_MS];
  process.env.ROOM_IDLE_MS = "600"; process.env.ROOM_WARNING_MS = "250";
  const a = { token:"a", name:"A", ws:{readyState:1} }, b = { token:"b", name:"B", ws:{readyState:1} };
  const room = { code:"TEST", host:"a", seats:[a,b], game:{phase:"play",current:0}, chat:[] }, rooms = new Map([[room.code,room]]), events = [];
  let control;
  control = createRoomControl({rooms,active:()=>true,started:()=>true,turnKey:()=>"turn",actors:()=>[0],stop:()=>{},remove:()=>{},changed:r=>{control.sync(r);events.push(control.snapshot(r,a));}});
  try {
    control.sync(room); const initial = control.snapshot(room,a).warning;
    await sleep(420);
    assert.ok(events.some((e)=>e.warning && e.now>=e.warning.warnAt)); assert.ok(!a.auto);
    control.handle(room,a,{type:"roomControl",action:"stay"});
    assert.ok(control.snapshot(room,a).warning.deadline > initial.deadline);
    await sleep(260); assert.ok(!a.auto);
    control.handle(room,a,{type:"roomControl",action:"kick",target:Social.publicId(b)});
    await sleep(700); assert.ok(!a.auto); assert.equal(control.snapshot(room,a).warning,null);
    control.handle(room,a,{type:"roomControl",action:"fillBot",target:Social.publicId(room.seats[1])});
    await sleep(720); assert.equal(a.auto,true); assert.equal(control.snapshot(room,a).warning,null);
    control.handle(room,a,{type:"roomControl",action:"stay"}); assert.equal(a.auto,false);
  } finally {
    control.close(); previous.forEach((v,i)=>{const k=["ROOM_IDLE_MS","ROOM_WARNING_MS"][i];if(v===undefined)delete process.env[k];else process.env[k]=v;});
  }
});

test("election follows chosen seat order and all vacancies must be filled before resuming", () => {
  const human = (token, position) => ({token,name:token,position,ws:{readyState:1}});
  const a=human("a",2), b=human("b",0), c=human("c",3), d={...human("d",1),bot:true};
  const room={code:"ORDER",host:"a",seats:[a,b,c,d],game:{players:[a,b,c,d].map(p=>({name:p.name,resources:[4,3,2,1,0]}))}}, rooms=new Map([[room.code,room]]);
  const control=createRoomControl({rooms,active:()=>true,started:()=>true,turnKey:()=>"one",actors:()=>[0],stop:()=>{},remove:()=>{},changed:()=>{}});
  try {
    a.ws=null; control.elect(room); assert.equal(room.host,"c","Use negotiated position, not insertion order");
    c.ws=null; control.elect(room); assert.equal(room.host,"b","Skip bots and offline humans");
    control.handle(room,b,{type:"roomControl",action:"kick",target:Social.publicId(a)});
    control.handle(room,b,{type:"roomControl",action:"kick",target:Social.publicId(c)});
    control.fill(room,0,human("new-a",0)); assert.equal(room.seats[0].position,2); assert.equal(control.paused(room),true);
    assert.throws(()=>control.guard(room),/paused/);
    control.handle(room,b,{type:"roomControl",action:"fillBot",target:Social.publicId(room.seats[2])});
    assert.equal(control.paused(room),false); assert.equal(room.seats[2].position,3);
    assert.deepEqual(room.game.players[2].resources,[4,3,2,1,0]);
  } finally { control.close(); }
});

test("all five games: consent, closest online human, kick/pause, human and bot replacement", {timeout:30000}, async () => {
  const port=18942, server=spawn(process.execPath,[require.resolve("./server")],{env:{...process.env,PORT:String(port),AUTO_OPEN:"0"},stdio:["ignore","pipe","pipe"]}), sockets=[];
  let errors="";server.stderr.on("data",chunk=>{errors+=chunk;});
  async function client(kind,name,token) {
    const poker=kind==="poker", endpoint=poker?"ws":kind==="catan"?"catan-ws":kind==="richman"?"richman-ws":"duel-ws";
    const ws=new WebSocket(`ws://127.0.0.1:${port}/${endpoint}`), messages=[];sockets.push(ws);
    ws.on("message",raw=>messages.push(JSON.parse(raw)));
    await once(ws,"open"); token ||= crypto.randomUUID();
    const send=data=>ws.send(JSON.stringify(data));
    const next=async(predicate,after=0)=>{for(let n=0;n<300;n++){const found=messages.slice(after).find(predicate);if(found)return found;await sleep(10);}throw Error(`${kind}/${name}: missing message; ${JSON.stringify(messages.slice(-2)).slice(0,500)}`);};
    send(poker?{type:"hello",clientId:token}:{type:"hello",token});
    if(!poker)token=(await next(m=>m.type==="welcome")).token;
    const state=m=>m.room||m;
    const request=async(data,type="state")=>{const cursor=messages.length;send(data);return state(await next(m=>m.type===type,cursor));};
    return {ws,name,token,send,next,request,messages,state};
  }
  try {
    await once(server.stdout,"data");
    for(const kind of ["catan","poker","gomoku","xiangqi","richman"]) {
      const duel=["gomoku","xiangqi"].includes(kind), a=await client(kind,"Alice"), b=await client(kind,"Bob"), c=duel?null:await client(kind,"Carol");
      const created=await a.request({type:"create",name:a.name,seats:4,maxPlayers:4,players:4,startingStack:150,funds:50000,days:30,kind,difficulty:"easy",side:0,ai:false});
      const code=created.code, join=(p)=>p.request({type:"join",code,name:p.name});
      await join(b); if(c)await join(c);
      if(!duel)await a.request({type:kind==="richman"?"bots":"fillBots",fill:true});
      const latest=(p)=>p.state(p.messages.filter(m=>m.type==="state").at(-1));
      const ownId=p=>latest(p).control.you;
      const hostChange=async(sender,target)=>{
        const offer=await sender.request({type:"roomControl",action:"transfer",target:ownId(target)});
        assert.notEqual(offer.control.host,ownId(target),"Transfer waits for consent");
        const done=await target.request({type:"roomControl",action:"respond",id:offer.control.pending.id,accept:true});
        assert.equal(done.control.host,ownId(target));return done;
      };
      const invalid=await b.request({type:"roomControl",action:"transfer",target:ownId(a)},"error"); assert.match(invalid.message,/Host only/);
      let request=await b.request({type:"roomControl",action:"requestHost"});
      assert.equal(request.control.pending.to,ownId(a));
      assert.match((await b.request({type:"roomControl",action:"respond",id:request.control.pending.id,accept:true},"error")).message,/expired/);
      await a.request({type:"roomControl",action:"respond",id:request.control.pending.id,accept:false});
      assert.equal(latest(a).control.host,ownId(a));
      await hostChange(a,c||b);
      const departing=c||b, disconnectCursor=a.messages.length;
      departing.ws.close();await once(departing.ws,"close");
      await a.next(m=>m.type==="state"&&a.state(m).control.host===ownId(a),disconnectCursor);
      const reconnected=await client(kind,departing.name,departing.token);
      if(kind==="poker")await join(reconnected);else await reconnected.next(m=>m.type==="state");
      assert.equal(latest(reconnected).control.host,ownId(a),"Rejoining never reclaims host rights");
      const guest=duel?reconnected:b;
      request=await guest.request({type:"roomControl",action:"requestHost"});
      await a.request({type:"roomControl",action:"respond",id:request.control.pending.id,accept:true});
      await hostChange(guest,a);
      if(kind==="poker")await a.request({type:"toggleAutoNext",enabled:false});
      if(duel||kind==="richman") { await guest.request({type:"ready",ready:true}); if(c)await reconnected.request({type:"ready",ready:true}); }
      const started=await a.request({type:"start"});assert.equal(started.control.started,true);
      assert.match((await guest.request({type:"roomControl",action:"kick",target:ownId(a)},"error")).message,/Host only/);
      assert.match((await a.request({type:"roomControl",action:"kick",target:ownId(a)},"error")).message,/other player/);
      const before=latest(a), guestIndex=before.control.seats.findIndex(s=>s?.id===ownId(guest)), cursor=guest.messages.length;
      const kicked=await a.request({type:"roomControl",action:"kick",target:ownId(guest)});
      await guest.next(m=>m.type==="left"&&m.reason,cursor);
      assert.equal(kicked.control.paused,true);assert.equal(kicked.control.seats[guestIndex].vacant,true);
      const sameMember=await join(a); assert.equal(sameMember.control.paused,true,"Existing member cannot occupy a second seat");
      assert.equal(sameMember.control.host,sameMember.control.you,"Rejoining the same room does not transfer host");
      const stable=kind==="poker"?JSON.stringify([kicked.pot,kicked.actor,kicked.players.map(p=>[p.chips,p.bet,p.totalBet])]):JSON.stringify(kicked.game);
      await sleep(1600);
      await a.request({type:"chat",text:"Still paused"});
      const frozen=latest(a);
      assert.equal(kind==="poker"?JSON.stringify([frozen.pot,frozen.actor,frozen.players.map(p=>[p.chips,p.bet,p.totalBet])]):JSON.stringify(frozen.game),stable,"Paused game cannot advance via bots, timers or chat");
      assert.match((await a.request({type:duel?"move":"action",action:{type:"roll"}},"error")).message,/paused/);
      assert.match((await guest.request({type:"roomControl",action:"requestHost"},"error")).message,/room|seat|房间|座位/i,"Kicked connection loses its old membership");
      const returned=await join(guest);
      assert.equal(returned.control.paused,false,"Removed player may explicitly join again");
      assert.equal(returned.control.seats[guestIndex].name,guest.name);
      assert.notEqual(returned.control.you,before.control.seats[guestIndex].id,"Rejoining gets a new public seat identity");
      await a.request({type:"roomControl",action:"kick",target:returned.control.you});
      const d=await client(kind,"Dana"), replaced=await join(d);
      assert.equal(replaced.control.paused,false);assert.equal(replaced.control.seats[guestIndex].name,"Dana");
      assert.notEqual(replaced.control.seats[guestIndex].id,kicked.control.seats[guestIndex].id);
      if(kind==="poker")assert.deepEqual(replaced.players.map(p=>[p.chips,p.bet,p.totalBet]),kicked.players.map(p=>[p.chips,p.bet,p.totalBet]));
      else assert.equal(replaced.game.revision,kicked.game.revision);
      const emptyAgain=await a.request({type:"roomControl",action:"kick",target:replaced.control.you});
      const filled=await a.request({type:"roomControl",action:"fillBot",target:emptyAgain.control.seats[guestIndex].id});
      assert.equal(filled.control.seats[guestIndex].bot,true);assert.equal(filled.control.paused,false);
      const aiBefore=duel?filled.game.revision:null;
      if(duel) {
        const move=kind==="gomoku"?{to:112}:{from:54,to:45};
        await a.request({type:"move",revision:filled.game.revision,...move});
        await a.next(m=>m.type==="state"&&m.game?.revision>aiBefore+1);
      }
      for(const player of [a,b,c,reconnected,d])player?.ws.terminate();
    }
    assert.equal(errors,"");
  } finally { sockets.forEach(ws=>ws.terminate());server.kill();await once(server,"exit"); }
});

test("all five games: required actor is warned and auto-play really advances the game", {timeout:30000}, async () => {
  const port=18944, server=spawn(process.execPath,[require.resolve("./server")],{windowsHide:true,env:{...process.env,PORT:String(port),AUTO_OPEN:"0",ROOM_IDLE_MS:"700",ROOM_WARNING_MS:"300"},stdio:["ignore","pipe","pipe"]}), sockets=[];
  let errors="";server.stderr.on("data",s=>{errors+=s;});
  try {
    await once(server.stdout,"data");
    for(const kind of ["catan","poker","gomoku","xiangqi","richman"]) {
      const poker=kind==="poker", duel=["gomoku","xiangqi"].includes(kind), endpoint=poker?"ws":kind==="catan"?"catan-ws":kind==="richman"?"richman-ws":"duel-ws";
      const ws=new WebSocket(`ws://127.0.0.1:${port}/${endpoint}`), states=[];sockets.push(ws);
      ws.on("message",raw=>{const m=JSON.parse(raw);if(m.type==="state")states.push(m.room||m);});
      await once(ws,"open");const send=m=>ws.send(JSON.stringify(m));
      const wait=async(predicate)=>{for(let i=0;i<800;i++){const found=states.find(predicate);if(found)return found;await sleep(10);}throw Error(`${kind}: auto-play stalled`);};
      send(poker?{type:"hello",clientId:crypto.randomUUID()}:{type:"hello"});
      send({type:"create",kind,name:"Idle player",seats:3,maxPlayers:2,players:2,funds:50000,days:30,difficulty:"easy",side:0,ai:true});
      await wait(s=>s.code);
      if(!duel&&kind!=="richman") {send({type:"fillBots"}); if(poker)send({type:"toggleAutoNext",enabled:false});send({type:"start"});}
      const first=await wait(s=>s.control.warning); assert.ok(first.control.warning.warnAt<first.control.warning.deadline);
      await wait(s=>s.control.warning && s.control.now>=s.control.warning.warnAt && !s.control.auto);
      await wait(s=>s.control.auto);
      if(duel)await wait(s=>s.control.auto && s.game?.revision>=first.game.revision+3);
      else if(poker)await wait(s=>s.control.auto && (s.status==="handComplete"||s.actor!==first.actor||s.street!==first.street));
      else await wait(s=>s.control.auto && s.game?.revision>first.game.revision);
      ws.terminate();
    }
    assert.equal(errors,"");
  } finally { sockets.forEach(s=>s.terminate());server.kill();await once(server,"exit"); }
});
