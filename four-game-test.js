"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawn}=require("node:child_process"),{once}=require("node:events"),{WebSocket}=require("ws");
const retired=require("./retired-files.json");

test("release keeps exactly four game entries and no retired game implementation",()=>{
  const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8"),cards=[...html.matchAll(/<a class="club-game [^"]+" href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(cards,["catan.html","duel.html?game=gomoku","duel.html?game=xiangqi"]);assert.equal([...html.matchAll(/class="club-game /g)].length,4);assert.match(html,/<button class="club-game poker-game"[^>]+data-open-view="online"/);
  for(const file of retired)assert.equal(fs.existsSync(path.join(__dirname,file)),false,`${file} has been removed`);
  const source=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");assert.doesNotMatch(source,/attachRichman|richman-ws/);
  for(const file of ["catan-scenarios.js","game-ui.js","room-control.js","duel-bot.js","audio/CREDITS.md","vendor/engines/manifest.json"])assert.ok(fs.existsSync(path.join(__dirname,file)),`${file} is retained`);
});

test("four-game server serves current assets and rejects retired URLs and websocket endpoint",{timeout:15000},async()=>{
  const port=18948,server=spawn(process.execPath,[path.join(__dirname,"server.js")],{cwd:__dirname,windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:"1",AUTO_OPEN:"0"},stdio:["ignore","pipe","pipe"]});let errors="";server.stderr.on("data",data=>errors+=data);
  try{
    await once(server.stdout,"data");const base=`http://127.0.0.1:${port}`;
    for(const file of ["index.html","catan.html","duel.html?game=gomoku","duel.html?game=xiangqi","catan-scenarios.js","avatar-data.js","social-data.js","game-audio.js","game-ui.js","vendor/lucide.min.js"]){const response=await fetch(base+"/"+file);assert.equal(response.status,200,file);await response.arrayBuffer();}
    for(const file of retired){const response=await fetch(base+"/"+file,{method:"HEAD"});assert.equal(response.status,404,file);}
    const response=await fetch(base+"/RICHMAN.HTML",{method:"HEAD"});assert.equal(response.status,404);
    const ws=new WebSocket(`ws://127.0.0.1:${port}/richman-ws`);let opened=false;ws.on("open",()=>{opened=true;ws.close();});ws.on("error",()=>{});await new Promise(resolve=>ws.once("close",resolve));assert.equal(opened,false);
    assert.equal(errors,"");
  }finally{server.kill();await once(server,"exit");}
});
