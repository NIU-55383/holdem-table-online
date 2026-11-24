"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),E=require("./catan-engine"),D=require("./catan-cities-data");
let pw;try{pw=require("playwright");}catch{pw=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright"));}
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function game(mapId){const g=E.createGame(["TEN","Rival","Colin"],rng(37),mapId);while(g.phase.startsWith("setup"))E.act(g,g.current,E.chooseBotAction(g,g.current));Object.assign(g,{phase:"main",current:0,turn:3,rolled:true,dice:[2,3]});return g;}
function grant(g,id,key){const deck=g.cities.decks[D.cards[key][0]],i=deck.indexOf(key);assert(i>=0);deck.splice(i,1);const c={id:++g.cities.sequence,key};g.cities.players[id].cards.push(c);return c;}
function chaseFixture(mapId,kind){
  const g=game(mapId),sea=Boolean(g.cities.seafarers),v=g.board.vertices.find(v=>v.owner<0&&v.tiles.some(i=>g.board.tiles[i].resource>=-1&&g.board.tiles[i].robberAllowed!==false)&&(!sea||v.tiles.some(i=>g.board.tiles[i].resource===-2)));assert(v);
  v.knight={owner:0,rank:2,active:true,activated:g.turn-1,promoted:-1};g.cities.attacked=true;
  g.board.robber=g.board.tiles.find(t=>t.resource>=-1&&t.robberAllowed!==false&&v.tiles.includes(t.id)===(kind!=="pirate")).id;
  if(sea)g.board.pirate=g.board.tiles.find(t=>t.resource===-2&&v.tiles.includes(t.id)===(kind!=="robber")).id;
  return{g,vertex:v.id};
}
function snapshot(g,code,you=0){return{type:"state",code,mapId:g.mapId,layout:g.layout,you,host:0,maxPlayers:3,chat:[],seats:g.players.map(p=>({name:p.name,socialId:"chase-"+p.id,position:p.id,connected:true,bot:false,auto:false})),game:E.publicGame(g,you)};}
async function closeDialogs(page){for(let n=0;n<6&&await page.locator("dialog[open]").count();n++)await page.keyboard.press("Escape");}
async function promptFirst(page){
  assert(await page.locator("#citiesPanel").evaluate(p=>{const c=p.querySelector(":scope > .cities-choice"),h=p.querySelector(":scope > .cities-progress-heading");return c&&h&&p.firstElementChild===c&&c.nextElementSibling===h&&c.getBoundingClientRect().bottom<=h.getBoundingClientRect().top+1;}),"Pending prompt precedes the progress-card heading");
  assert(await page.locator("#citiesPanel").evaluate(p=>p.scrollWidth<=p.clientWidth+1));
}
test("city prompts precede the hand and coastal knights distinguish robber from pirate",{timeout:120000},async()=>{
  fs.mkdirSync(path.join(__dirname,"test-results"),{recursive:true});
  const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem("catan-music-enabled","false");window.sent=[];window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;window.testSocket=this;setTimeout(()=>this.dispatchEvent(new Event("open")),0);}send(data){sent.push(JSON.parse(data));}close(){this.readyState=3;}emit(data){this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(data)}));}};});
    await page.route("http://catan.test/**",route=>{const u=new URL(route.request().url());if(u.pathname==="/api/catan-preview")return route.fulfill({json:E.makeBoard(rng(37),u.searchParams.get("map")||"base")});const f=path.join(__dirname,u.pathname.slice(1));if(!fs.existsSync(f))return route.fulfill({status:404,body:""});return route.fulfill({body:fs.readFileSync(f),contentType:{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(f)]||"application/octet-stream"});});
    await page.goto("http://catan.test/catan.html");await page.evaluate(()=>testSocket.emit({type:"welcome",token:"chase-test"}));
    const emit=data=>page.evaluate(data=>testSocket.emit(data),data);
    for(const width of [1440,320]){
      await page.setViewportSize({width,height:width===320?568:1000});
      for(const [mapId,variant] of [["cities-shores-1","pirate"],["cities-shores-1","robber"],["cities-shores-1","both"],["cities","robber"]]){
        const {g,vertex}=chaseFixture(mapId,variant),allowed=variant==="both"?["robber","pirate"]:[variant];
        for(const thief of allowed){
          const code="CHASE-"+mapId+"-"+variant+"-"+thief;await emit(snapshot(g,code));await closeDialogs(page);
          const robber=page.locator("[data-group='chase']"),pirate=page.locator("[data-group='chasePirate']");
          assert.equal(await robber.count(),allowed.includes("robber")?1:0);assert.equal(await pirate.count(),allowed.includes("pirate")?1:0);
          if(await robber.count())assert.match(await robber.innerText(),/驱赶强盗[\s\S]*Chase robber/);
          if(await pirate.count())assert.match(await pirate.innerText(),/驱赶海盗[\s\S]*Chase pirate/);
          const before=await page.evaluate(()=>sent.length),button=thief==="pirate"?pirate:robber,key=(thief==="pirate"?"chasePirate:":"chase:")+vertex;
          if(!await button.evaluate(b=>b.classList.contains("selected")))await button.click();
          await promptFirst(page);assert.match(await page.locator("#citiesPanel .cities-choice h3").innerText(),thief==="pirate"?/驱赶海盗/:/驱赶强盗/);
          assert.deepEqual(await page.locator("#board [data-ck-choice]").evaluateAll(ns=>ns.map(n=>n.dataset.ckChoice)),[key],"One vertex shows only the selected thief action");
          if(variant==="both"){
            const other=thief==="pirate"?robber:pirate,otherKey=(thief==="pirate"?"chase:":"chasePirate:")+vertex;await other.click();
            assert.deepEqual(await page.locator("#board [data-ck-choice]").evaluateAll(ns=>ns.map(n=>n.dataset.ckChoice)),[otherKey],"Switching groups replaces, rather than overlaps, targets");
            await button.click();assert.deepEqual(await page.locator("#board [data-ck-choice]").evaluateAll(ns=>ns.map(n=>n.dataset.ckChoice)),[key]);
          }
          await page.locator('[data-ck-choice="'+key+'"]').press("Enter");await page.locator("#citiesConfirm").waitFor({state:"visible"});
          assert.equal(await page.evaluate(()=>sent.length),before);await page.locator("#citiesConfirm [data-play]").click();
          const messages=await page.evaluate(n=>sent.slice(n),before);assert.equal(messages.length,1);assert.deepEqual(messages[0].action,{type:"ck",choice:key});
          const after=structuredClone(g);E.act(after,0,messages[0].action);const legal=E.legal(after,0),other=thief==="pirate"?"robber":"pirate";
          assert.equal(after.cities.chaseThief,thief);assert.equal(after.board.vertices[vertex].knight.active,false);assert(legal[thief].length>0);assert.equal(legal[other].length,0);
          await emit(snapshot(after,code));assert(await page.locator("#citiesConfirm").isHidden());
          if(mapId==="cities-shores-1"&&variant==="pirate")await page.locator(".turn-banner").screenshot({path:path.join(__dirname,"test-results/catan-pirate-chase-"+width+".png")});
        }
        await emit(snapshot(g,"HELP-"+mapId+"-"+variant));await closeDialogs(page);const before=await page.evaluate(()=>sent.length);
        await page.locator("#actions [data-cities-info='knight']").first().press("Enter");const help=page.locator("#citiesInfoDialog");await help.waitFor({state:"visible"});
        const text=await help.innerText();
        if(mapId==="cities"){assert.doesNotMatch(text,/海盗|[Pp]irate/);assert.equal(await page.locator("[data-group='chasePirate']").count(),0);}
        else{assert.match(text,/驱赶强盗或海盗/);assert.match(text,/驱赶海盗/);assert.match(text,/Chase pirate/);assert.match(text,/激活/);assert.match(text,/首次[\s\S]*入侵/);}
        assert(await help.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
        if(mapId==="cities-shores-1"&&variant==="both")await help.screenshot({path:path.join(__dirname,"test-results/catan-coastal-knight-help-"+width+".png")});
        await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>sent.length),before);
      }
      for(const mapId of ["cities","cities-shores-1"])for(const kind of ["alchemy","sabotage"]){
        const g=game(mapId);grant(g,0,"mining");
        if(kind==="alchemy")Object.assign(g,{phase:"roll",rolled:false,dice:[]});
        else{
          g.current=1;
          for(let id=0;id<3;id++)g.players[id].resources.forEach((n,r)=>{const amount=id===0?2:0;g.bank[r]-=amount-n;g.players[id].resources[r]=amount;});
        }
        const actor=kind==="alchemy"?0:1,c=grant(g,actor,kind),code="PROMPT-"+mapId+"-"+kind;await emit(snapshot(g,code));await closeDialogs(page);
        await page.evaluate(()=>{
          const button=document.querySelector("#citiesPanel [data-card='mining']"),svg=button.querySelector("svg"),use=svg.querySelector("use");
          window.retainedHand={button,svg,use,detached:false};
          retainedHand.observer=new MutationObserver(rs=>{for(const r of rs)for(const n of r.removedNodes)if(n===svg||n.contains?.(svg))retainedHand.detached=true;});
          retainedHand.observer.observe(document.getElementById("citiesPanel"),{childList:true,subtree:true});
        });
        E.act(g,actor,{type:"ck",choice:"play:"+c.id});await emit(snapshot(g,code));await promptFirst(page);
        const before=await page.evaluate(()=>sent.length),picker=page.locator(kind==="alchemy"?"#citiesChoiceDialog":"#citiesSelectionDialog");
        await page.locator(kind==="alchemy"?"[data-cities-picker]":"[data-cities-select]").click();await picker.waitFor({state:"visible"});await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(()=>sent.length),before);
        if(mapId==="cities")await page.locator("#citiesPanel").screenshot({path:path.join(__dirname,"test-results/catan-prompt-first-"+kind+"-"+width+".png")});
        if(kind==="alchemy")E.act(g,0,{type:"ck",choice:"dice:3:4"});
        else{let left=E.publicGame(g,0).citiesKnights.selection.required;const resources=g.players[0].resources.map(n=>{const chosen=Math.min(n,left);left-=chosen;return chosen;});E.act(g,0,{type:"ckSelect",revision:g.revision,resources});}
        await emit(snapshot(g,code));assert.equal(await page.locator("#citiesPanel > .cities-choice").count(),0);
        const stable=await page.evaluate(()=>{const c=retainedHand,b=document.querySelector("#citiesPanel [data-card='mining']");c.observer.disconnect();return{button:c.button===b,svg:c.svg===b.querySelector("svg"),use:c.use===b.querySelector("svg use"),detached:c.detached};});
        assert.deepEqual(stable,{button:true,svg:true,use:true,detached:false},"Inserting/removing a prompt preserves retained card artwork without detaching it");
      }
    }
    assert.deepEqual(errors,[]);console.log("Prompt-first layout, stable hand SVGs, correct robber/pirate controls and engine actions, combined-only help: desktop/mobile passed.");
  }finally{await browser.close();}
});
