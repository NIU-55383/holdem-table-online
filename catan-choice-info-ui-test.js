"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),E=require("./catan-engine"),D=require("./catan-cities-data");
let pw;try{pw=require("playwright");}catch{pw=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright"));}
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function fixture(mapId){
  const g=E.createGame(["Alice <b>","TEN","Colin"],rng(37),mapId);
  while(g.phase.startsWith("setup"))E.act(g,g.current,E.chooseBotAction(g,g.current));
  Object.assign(g,{phase:"main",current:0,turn:3,rolled:true,dice:[2,3]});
  const sites=g.board.vertices.filter(v=>v.owner<0&&v.tiles.some(i=>g.board.tiles[i].resource>=-1));
  [{owner:1,rank:1,active:false},{owner:1,rank:3,active:true},{owner:2,rank:2,active:false}].forEach((k,i)=>sites[i].knight={...k,activated:0,promoted:-1});
  for(let r=5;r<8;r++){g.bank[r]-=5;g.players[2].resources[r]+=5;}
  const deck=g.cities.decks[D.cards.treason[0]],at=deck.indexOf("treason");assert(at>=0);deck.splice(at,1);
  const card={key:"treason",id:++g.cities.sequence};g.cities.players[0].cards.push(card);
  E.act(g,0,{type:"ck",choice:"play:"+card.id});E.act(g,0,{type:"ck",choice:"player:1"});return g;
}
function snapshot(g,you){return{type:"state",code:"CHOICE-"+g.mapId,mapId:g.mapId,layout:g.layout,you,host:0,maxPlayers:3,chat:[],seats:g.players.map(p=>({name:p.name,socialId:"choice-"+p.id,position:p.id,connected:true,bot:false,auto:false})),game:E.publicGame(g,you)};}
async function closeDialogs(page){for(let i=0;i<6&&await page.locator("dialog[open]").count();i++)await page.keyboard.press("Escape");}
test("knight-removal cause and commodity totals are readable and usable on desktop and mobile",{timeout:120000},async()=>{
  fs.mkdirSync(path.join(__dirname,"test-results"),{recursive:true});
  const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{
      localStorage.setItem("catan-music-enabled","false");window.sent=[];
      window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;window.testSocket=this;setTimeout(()=>this.dispatchEvent(new Event("open")),0);}send(data){window.sent.push(JSON.parse(data));}close(){this.readyState=3;}emit(data){this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(data)}));}};
    });
    await page.route("http://catan.test/**",route=>{
      const url=new URL(route.request().url());if(url.pathname==="/api/catan-preview")return route.fulfill({json:E.makeBoard(rng(37),url.searchParams.get("map")||"base")});
      const file=path.join(__dirname,url.pathname.slice(1));if(!fs.existsSync(file))return route.fulfill({status:404,body:""});
      return route.fulfill({body:fs.readFileSync(file),contentType:{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(file)]||"application/octet-stream"});
    });
    await page.goto("http://catan.test/catan.html");await page.evaluate(()=>testSocket.emit({type:"welcome",token:"choice-test"}));
    const emit=(g,you)=>page.evaluate(data=>testSocket.emit(data),snapshot(g,you));
    for(const mapId of ["cities","cities-shores-1"]){
      const g=fixture(mapId);
      for(const width of [1440,320]){
        await page.setViewportSize({width,height:width===320?568:1000});
        for(const you of [1,0,2]){
          await emit(g,you);await closeDialogs(page);
          const before=await page.evaluate(()=>JSON.stringify(sent)),panel=page.locator(".cities-choice"),context=panel.locator(".cities-choice-context");
          const body=await context.innerText(),prompt=await page.locator("#turnPrompt").innerText();
          assert.match(await panel.locator("h3").innerText(),/叛变[\s\S]*1[\s\S]*Treason/);
          assert(body.includes("Alice <b>"),"Name the actual card player and escape their name");
          assert.match(body,/政治[\s\S]*叛变/);assert.match(body,/Treason/);assert.match(body,/1 名/);
          assert.match(body,/未激活/);assert.match(body,/等级/);assert.match(body,/免费/);assert.match(body,/同级|相同等级/);
          assert.equal(await context.locator("b").count(),0,"Player name must not become markup");
          const bullets=await context.locator("li").evaluateAll(nodes=>nodes.map(n=>({parent:n.parentElement.tagName,en:n.querySelector("small")?.textContent})));
          assert.equal(bullets.length,3);assert(bullets.every(b=>b.parent==="UL"&&/[A-Za-z]/.test(b.en||"")));
          assert.match(prompt,/叛变[\s\S]*1[\s\S]*Treason/);
          if(you!==1){assert.match(prompt,/等待 TEN/);assert.equal(await page.locator("[data-ck-choice]").count(),0);}
          else{const legal=E.publicGame(g,you).legal.citiesKnights;assert.equal(legal.length,2);assert.deepEqual((await page.locator("[data-ck-choice]").evaluateAll(nodes=>nodes.map(n=>n.dataset.ckChoice))).sort(),legal.map(o=>o.key).sort());}
          assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before);
          assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          if(mapId==="cities"&&you===1)await panel.screenshot({path:path.join(__dirname,"test-results/catan-knight-removal-info-"+width+".png")});
        }
        await emit(g,1);await closeDialogs(page);
        for(const [key,zh] of [["paper","纸"],["cloth","布"],["coin","币"]]){
          const before=await page.evaluate(()=>JSON.stringify(sent)),entry=page.locator('#bank [data-cities-info="'+key+'"]');
          if(width===1440)await entry.press("Enter");else await entry.click();
          const dialog=page.locator("#citiesInfoDialog");await dialog.waitFor({state:"visible"});
          const first=await dialog.locator(".cities-info-body li").first().innerText();
          assert.match(first,/开局总数/);assert.match(first,/Starting total/);assert(first.includes("12 张"+zh));assert.match(first,/全场|所有玩家/);
          assert.equal(g.bank[D.resources.indexOf(key)],7,"Current bank stock differs from initial total");
          assert(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
          if(mapId==="cities"&&key==="cloth")await dialog.screenshot({path:path.join(__dirname,"test-results/catan-commodity-total-"+width+".png")});
          if(width===320)await dialog.locator("[data-close]").click();else await page.keyboard.press("Escape");
          await dialog.waitFor({state:"hidden"});assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before);
        }
        const key=E.publicGame(g,1).legal.citiesKnights[0].key,before=await page.evaluate(()=>sent.length);
        await page.locator('[data-ck-choice="'+key+'"]').press("Enter");
        const confirm=page.locator("#citiesConfirm");await confirm.waitFor({state:"visible"});assert.equal(await page.evaluate(()=>sent.length),before);
        await confirm.locator("[data-play]").click();await confirm.waitFor({state:"hidden"});
        const messages=await page.evaluate(start=>sent.slice(start),before);
        assert.equal(messages.length,1);assert.equal(messages[0].type,"action");assert.deepEqual(messages[0].action,{type:"ck",choice:key});
        const after=structuredClone(g);E.act(after,1,messages[0].action);assert.equal(after.board.vertices[Number(key.slice(2))].knight,undefined);
        await emit(after,1);assert.equal(await page.locator(".cities-choice-context").count(),0);
      }
    }
    assert.deepEqual(errors,[]);console.log("Knight-removal context and confirmation, all three commodity totals: cities/combined, actor/source/observer, 1440/320 passed.");
  }finally{await browser.close();}
});
