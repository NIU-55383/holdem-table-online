"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { createHash } = require("node:crypto");
const Data = require("./social-data");
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const boardSource = read("catan-board.js");

function boardAPI(inline, social = Data) {
  const context = { window: { GameSocialData: social }, document: { getElementById: () => inline ? {} : null } };
  vm.runInNewContext(boardSource, context);
  return context.window.CatanBoard;
}

test("robber skins keep saved IDs, the classic art and the final emoji", () => {
  assert.deepEqual(Data.skins.robber.map((skin) => skin.id), ["classic", "smile", "angry", "red"]);
  assert.equal(Data.skins.robber[0].art, "robber");
  assert.equal(Data.skins.robber[3].emoji, "\uD83D\uDC79");
  for (const [id, art] of [["smile", "robber-hood"], ["angry", "robber-bandana"]]) {
    const skin = Data.skin("robber", id);
    assert.equal(skin.art, art);
    assert.equal(skin.emoji, undefined);
    assert.equal(Data.normalizeSkins({ robber: id }).robber, id);
  }
  for (const skin of Data.skins.robber) {
    assert.match(skin.label, /强盗/);
    assert.match(skin.label, /robber/i);
  }
  assert.deepEqual(Data.normalizeSkins(), { robber: "classic", pirate: "classic" });
  assert.deepEqual(Data.normalizeSkins({ robber: "<svg>", pirate: "https://invalid" }), { robber: "classic", pirate: "classic" });
  const classic = read("catan-art.svg").match(/<symbol id="robber"[\s\S]*?<\/symbol>/)[0];
  assert.equal(createHash("sha256").update(classic).digest("hex"), "07c049d9c4ff47822a109da721c2911e98847571c78c681519d35e1c66c0eaa9");
});

for (const inline of [true, false]) test(`piece rendering uses selected art with ${inline ? "inline" : "external"} sprites`, () => {
  const board = boardAPI(inline), prefix = inline ? "#catan-art-" : "catan-art.svg#";
  for (const [kind, choices] of Object.entries(Data.skins)) for (const skin of choices) {
    const piece = board.piece(kind, 10, 20, 42, { [kind]: skin.id });
    if (skin.emoji) {
      assert.ok(piece.includes(skin.emoji));
      assert.match(piece, /class="piece-emoji"/);
    } else {
      assert.equal(piece, `<use href="${prefix}${skin.art}" x="10" y="20" width="42" height="42"/>`);
    }
  }
  assert.equal(board.piece("robber", 0, 0, 48, { robber: "unknown" }), board.icon("robber"));
  assert.equal(boardAPI(inline, null).piece("robber", 0, 0, 48), board.icon("robber"));
});

test("inline art matches its source and robber skins and inventory fit desktop and mobile", async () => {
  let playwright;
  try { playwright = require("playwright"); }
  catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const output = path.join(__dirname, "test-results");
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>");
    const symbols = await page.evaluate(({ html, svg }) => {
      const parser = new DOMParser(), source = parser.parseFromString(svg, "image/svg+xml");
      if (source.querySelector("parsererror")) throw new Error("Invalid source SVG");
      const documentHTML = parser.parseFromString(html, "text/html");
      const inline = documentHTML.querySelector("#catanSprite");
      function canonical(node) {
        return [node.tagName, [...node.attributes].map((a) => [a.name, a.name === "id" ? a.value.replace(/^catan-art-/, "") : a.value]).sort(), [...node.childNodes].filter((child) => child.nodeType === 1 || child.textContent.trim()).map((child) => child.nodeType === 1 ? canonical(child) : child.textContent.trim())];
      }
      const result = [source, inline].map((root) => [...root.querySelectorAll("symbol")].map(canonical));
      document.body.append(inline, documentHTML.querySelector("#helpDialog"));
      return result;
    }, { html: read("catan.html"), svg: read("catan-art.svg") });
    assert.deepEqual(symbols[1], symbols[0], "Every inline symbol must match the source");
    await page.addStyleTag({ content: read("catan.css") });
    await page.addScriptTag({ content: read("social-data.js") });
    await page.addScriptTag({ content: boardSource });
    await page.evaluate(() => {
      const picker = document.createElement("div");
      picker.id = "testSkins";
      picker.className = "skin-options";
      picker.style.cssText = "padding:16px;width:max-content;max-width:100%;background:#eef5f2";
      picker.innerHTML = GameSocialData.skins.robber.map((skin) => `<button type="button" title="${skin.label}" aria-label="${skin.label}"><svg viewBox="0 0 48 48" width="48" height="48">${CatanBoard.piece("robber", 0, 0, 48, { robber: skin.id })}</svg></button>`).join("");
      document.body.prepend(picker);
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.locator("#testSkins").screenshot({ path: path.join(output, `robber-skins-${width}.png`) });
      const art = await page.locator("#testSkins use").evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBBox();
        return { href: node.getAttribute("href"), width: box.width, height: box.height, x: box.x, y: box.y };
      }));
      assert.equal(art.length, 3);
      for (const box of art) {
        assert.ok(box.width >= 30 && box.height >= 30, `${box.href} must render visible art`);
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 48 && box.y + box.height <= 48, `${box.href} must fit the viewBox`);
      }
      await page.locator("#helpDialog").evaluate((dialog) => dialog.showModal());
      const piece = page.locator("#rulesPieceSupply"), deck = page.locator("#rulesDevelopmentSupply");
      for (const text of ["5 座村庄", "4 座城市", "15 条道路", "仅航海家", "15 艘船", "5 settlements", "4 cities", "15 roads", "Seafarers only", "15 ships"]) assert.ok((await piece.textContent()).includes(text), text);
      for (const text of ["25 张发展卡", "14 张骑士", "5 张胜利点", "2 张道路建设", "2 张垄断", "2 张丰收", "25 development cards", "14 Knights", "5 Victory Points", "2 Road Building", "2 Monopoly", "2 Year of Plenty"]) assert.ok((await deck.textContent()).includes(text), text);
      assert.equal(await page.locator("#rulesShipSupply").count(), 1);
      assert.equal(await page.locator("#rulesShipSupply").isVisible(), false);
      await deck.scrollIntoViewIfNeeded();
      for (const id of ["helpDialog", "helpContent", "rulesPieceSupply", "rulesDevelopmentSupply"]) {
        const metrics = await page.locator(`#${id}`).evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right }));
        assert.ok(metrics.scroll <= metrics.width + 1 && metrics.left >= 0 && metrics.right <= width, `${id} must not overflow at ${width}px`);
      }
      await page.screenshot({ path: path.join(output, `robber-inventory-${width}.png`) });
      await page.locator("#helpDialog").evaluate((dialog) => dialog.close());
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
