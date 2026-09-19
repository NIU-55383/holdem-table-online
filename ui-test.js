"use strict";
const path = require("node:path"), fs = require("node:fs"), assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
const port = 18751;
const server = spawn(process.execPath, [path.join(__dirname, "server.js")], { env: { ...process.env, PORT: String(port), CATAN_BOT_DELAY: "35" }, stdio: ["ignore", "pipe", "pipe"] });
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Server startup timeout")), 5000); server.stdout.once("data", () => { clearTimeout(timer); resolve(); }); server.stderr.on("data", (x) => reject(new Error(x.toString()))); });
    const executable = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
    browser = await playwright.chromium.launch({ executablePath: executable, headless: true });
    fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
    {
      const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const host = await hostContext.newPage(), guest = await guestContext.newPage(), seatErrors = [];
      host.on("pageerror", (e) => seatErrors.push(e.message)); guest.on("pageerror", (e) => seatErrors.push(e.message));
      await host.goto(`http://127.0.0.1:${port}/catan.html`); await host.locator("#name").fill("Host"); await host.locator("#create").click();
      await host.locator('[data-seat-position="3"]').click();
      await host.locator('.own-seat[data-position="3"]').waitFor();
      const code = await host.locator("#copyCode").textContent();
      await guest.goto(`http://127.0.0.1:${port}/catan.html`); await guest.locator("#name").fill("Guest"); await guest.locator("#code").fill(code); await guest.locator("#join").click();
      await guest.locator('.own-seat[data-position="0"]').waitFor();
      assert.ok((await host.locator('[data-position="3"]').textContent()).includes("Host"));
      assert.equal(await host.locator("#start").isDisabled(), true);
      await host.locator('[data-seat-position="0"]').click();
      await guest.locator('[data-seat-response="accept"]').waitFor();
      for (const width of [320, 390, 1440]) {
        await guest.setViewportSize({ width, height: width === 320 ? 640 : 900 });
        assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Seat negotiation must fit the screen width");
        for (const selector of ['[data-seat-position="2"]', '[data-seat-response="accept"]']) assert.ok((await guest.locator(selector).boundingBox()).height >= 44, "Seat controls must remain touch-sized");
        await guest.screenshot({ path: `test-results/catan-seat-swap-${width}.png`, fullPage: true });
      }
      await guest.locator('[data-seat-response="decline"]').click();
      await host.locator("#seatSwap").waitFor({ state: "hidden" });
      assert.equal(await host.locator('.own-seat').getAttribute("data-position"), "3");
      await guest.locator('[data-seat-position="3"]').click();
      await host.locator('[data-seat-response="accept"]').click();
      await host.locator('.own-seat[data-position="0"]').waitFor();
      await guest.locator('.own-seat[data-position="3"]').waitFor();
      await host.locator('[data-seat-position="3"]').click();
      await guest.locator('[data-seat-response="accept"]').click();
      await host.locator('.own-seat[data-position="3"]').waitFor();
      await host.locator("#fillBots").click();
      await host.locator("#start:not([disabled])").waitFor();
      await host.locator('[data-seat-position="2"]').click();
      await host.locator('.own-seat[data-position="2"]').waitFor();
      await host.locator('[data-seat-position="3"]').click();
      await host.locator('.own-seat[data-position="3"]').waitFor();
      await host.locator('[data-seat-position="0"]').click();
      await host.locator('[data-seat-response="cancel"]').click();
      await host.locator("#start:not([disabled])").waitFor();
      await host.locator("#start").click();
      await host.locator('#players [data-player-id="3"] [data-edit-avatar]').waitFor();
      await guest.locator('#players [data-player-id="0"] [data-edit-avatar]').waitFor();
      assert.ok((await host.locator('#players [data-player-id="3"] .summary-person').textContent()).includes("房主 / Host"));
      assert.equal(await host.locator('#players [data-player-id="3"] .seat-number').textContent(), "4");
      assert.equal(await host.locator("#turnAvatar .seat-number").textContent(), "1");
      assert.deepEqual(await host.locator("#players .seat-number").allTextContents(), ["1", "2", "3", "4"]);
      await guest.locator("#board [data-vertex]").first().click();
      await guest.locator('#game[data-phase="setupRoad"]').waitFor();
      assert.equal(await host.locator("#lobby").isVisible(), false);
      await host.screenshot({ path: "test-results/catan-host-seat-four-mobile.png", fullPage: true });
      await host.reload();
      await host.locator('#players [data-player-id="3"] [data-edit-avatar]').waitFor();
      assert.equal(await host.locator('#players [data-player-id="3"] .seat-number').textContent(), "4", "Refreshing preserves the chosen position");
      assert.deepEqual(seatErrors, []);
      await guestContext.close(); await hostContext.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    await page.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) { super(...args); if (String(args[0]).endsWith("/catan-ws")) window.testCatanSocket = this; }
      };
    });
    let catanSocket, catanState;
    page.on("websocket", (socket) => {
      if (!socket.url().endsWith("/catan-ws")) return;
      catanSocket = socket;
      socket.on("framereceived", ({ payload }) => { const message = JSON.parse(String(payload)); if (message.type === "state") catanState = message; });
    });
    page.on("pageerror", (e) => errors.push(e.message));
    async function assertHandCards() {
      const g = catanState.game, p = g.players[catanState.you];
      const expected = p.resources.flatMap((n, r) => Array(n).fill(String(r)));
      assert.deepEqual(await page.locator("#resources .resource-card").evaluateAll((cards) => cards.map((c) => c.dataset.resource)), expected, "Resources must render one card each in resource order");
      assert.equal(await page.locator("#resources .resource-card b").count(), 0, "No merged resource quantity badges");
      assert.equal(await page.locator("#handTotal").isVisible(), false);
      assert.equal(await page.locator("#development .development-card").count(), p.development.length, "Each development card should have its own card");
      for (const [i, card] of p.development.entries()) {
        assert.equal(await page.locator(`[data-dev-index="${i}"]`).isDisabled(), !g.legal.development.includes(card.type) || card.turn >= g.turn, "New development cards must not be playable early");
      }
    }
    async function assertPresence(page, selector, connected) {
      const dot = page.locator(selector);
      await dot.waitFor({ state: "visible" });
      assert.equal(await dot.getAttribute("data-connected"), String(connected));
      assert.equal(await dot.getAttribute("aria-label"), connected ? "在线 / Online" : "离线 / Offline");
      assert.equal(await dot.evaluate((el) => getComputedStyle(el).backgroundColor), connected ? "rgb(36, 151, 107)" : "rgb(146, 153, 157)");
      assert.equal(await dot.evaluate((el) => {
        const d = el.getBoundingClientRect(), a = el.parentElement.getBoundingClientRect();
        for (let parent = el; parent; parent = parent.parentElement) if (getComputedStyle(parent).filter.includes("grayscale")) return false;
        return d.left < a.left + a.width / 2 && d.top + d.height / 2 > a.top + a.height / 2;
      }), true, "The status dot stays at the avatar's bottom-left without ancestor grayscale filters");
    }
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.locator("#clubIsland polygon").first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll("#clubIsland use")].every((icon) => icon.getBBox().width > 0));
    assert.match(await page.locator("#clubIsland use").first().getAttribute("href"), /^catan-art\.svg#/, "The lobby retains external-sprite compatibility");
    await page.screenshot({ path: "test-results/club-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/club-mobile.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Home overflows horizontally");
    assert.equal(await page.locator('#homeView [data-open-view="calculator"], .view-tabs [data-view-target="calculator"]').count(), 0, "Odds should not be a standalone lobby entry");
    assert.equal(await page.locator("#pokerSectionNav").isVisible(), false);
    await page.locator(".poker-game").click();
    await page.locator("#onlineView.active").waitFor();
    await page.locator("#onlineNameInput").fill("NavigationTest");
    await page.screenshot({ path: "test-results/poker-tools-mobile.png" });
    await page.locator('#pokerSectionNav [data-open-view="calculator"]').click();
    await page.locator("#calculatorView.active").waitFor();
    assert.equal(await page.locator('.view-tabs [data-view-target="online"]').getAttribute("class"), "active");
    assert.equal(await page.locator('#pokerSectionNav [data-open-view="calculator"]').getAttribute("aria-current"), "page");
    await page.locator("#deck .deck-card:not(.selected)").first().click();
    await page.locator("#deck .deck-card:not(.selected)").first().click();
    await page.locator('[data-card-target="board"]').click();
    for (let i = 0; i < 5; i++) await page.locator("#deck .deck-card:not(.selected)").first().click();
    await page.locator("#calculateBtn").click();
    await page.waitForFunction(() => document.getElementById("equityValue").textContent !== "--");
    assert.equal(await page.locator("#deck .deck-card.selected").count(), 7);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Poker odds view overflows");
      await page.screenshot({ path: `test-results/poker-odds-${viewport.width}.png` });
    }
    await page.locator('#pokerSectionNav [data-open-view="online"]').click();
    assert.equal(await page.locator("#onlineNameInput").inputValue(), "NavigationTest", "Switching tools must preserve poker setup");
    await page.locator('#pokerSectionNav [data-open-view="calculator"]').click();
    assert.equal(await page.locator("#deck .deck-card.selected").count(), 7, "Switching tabs must preserve the calculator");
    await page.locator('[data-view-target="home"]').click();
    assert.equal(await page.locator("#pokerSectionNav").isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 });
    let externalSpriteRequests = 0;
    await page.route("**/catan-art.svg", (route) => { externalSpriteRequests++; return route.abort(); });
    await page.locator(".catan-game").click();
    await page.getByText("已连接 / Connected", { exact: true }).waitFor();
    await page.locator("#previewBoard polygon").first().waitFor();
    const sourceArt = fs.readFileSync(path.join(__dirname, "catan-art.svg"), "utf8");
    assert.equal(await page.evaluate((source) => {
      const xml = new DOMParser().parseFromString(source, "image/svg+xml");
      const clean = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) child.remove();
          else clean(child);
        }
        return node;
      };
      return [...xml.querySelectorAll("symbol")].every((symbol) => {
        const id = `catan-art-${symbol.id}`, local = document.getElementById(id);
        symbol.setAttribute("id", id);
        return local && clean(symbol).isEqualNode(clean(local.cloneNode(true)));
      });
    }, sourceArt), true, "Embedded illustrations must match every original shape, color and viewBox");
    assert.equal(await page.locator("#previewBoard use").evaluateAll((icons) => icons.every((icon) => icon.getBBox().width > 0)), true, "Resource art renders even if the external sprite request is blocked");
    await page.screenshot({ path: "test-results/catan-setup-mobile.png", fullPage: true });
    for (const viewport of [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      assert.ok((await page.locator("#join").boundingBox()).y + (await page.locator("#join").boundingBox()).height <= viewport.height, "Create and join should fit on a phone");
    }
    await page.locator("#name").fill("TestPlayer"); await page.locator('[data-seats="4"]').click(); await page.locator("#create").click();
    await page.locator("#lobby").waitFor({ state: "visible" }); await page.locator("#fillBots").click();
    await page.screenshot({ path: "test-results/catan-lobby-mobile.png", fullPage: true });
    await page.locator("#start:not([disabled])").waitFor(); await page.locator("#start").click();
    await page.locator("#board [data-vertex]").first().waitFor();
    const touchSession = await context.newCDPSession(page);
    await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    const boardTransform = () => page.locator("#board").evaluate((board) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(board).transform);
      return { scale: m.a, x: m.e, y: m.f };
    });
    const touch = (type, points) => touchSession.send("Input.dispatchTouchEvent", {
      type, touchPoints: points.map((point, id) => ({ id, x: point.x, y: point.y, radiusX: 2, radiusY: 2 })),
    });
    async function pinch(from, to, shift = { x: 0, y: 0 }) {
      const box = await page.locator("#boardViewport").boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      await touch("touchStart", [{ x: x - from / 2, y }, { x: x + from / 2, y }]);
      for (let i = 1; i <= 8; i++) {
        const f = i / 8, distance = from + (to - from) * f;
        await touch("touchMove", [{ x: x + shift.x * f - distance / 2, y: y + shift.y * f }, { x: x + shift.x * f + distance / 2, y: y + shift.y * f }]);
      }
      await touch("touchEnd", []);
    }
    await page.evaluate(() => scrollTo(0, 0));
    const initialBoardBox = await page.locator("#boardViewport").boundingBox(), gestureRevision = catanState.game.revision;
    assert.equal(await page.locator("#zoomIn,#zoomOut,.zoom-controls").count(), 0);
    await pinch(80, 160, { x: 10, y: 12 });
    let transformed = await boardTransform();
    assert.ok(Math.abs(transformed.scale - 2) < .02, "Two-finger pinch zooms the board, not the browser page");
    assert.ok(Math.abs(transformed.x - (10 - initialBoardBox.width / 2)) < 2, "Pinch preserves the location under the moving midpoint");
    assert.ok(Math.abs((await page.locator("#boardViewport").boundingBox()).height - initialBoardBox.height) < 1, "Touch zoom keeps the page layout fixed");
    assert.equal(await page.evaluate(() => visualViewport.scale), 1, "Browser zoom stays unchanged");
    const beforePan = transformed, cx = initialBoardBox.x + initialBoardBox.width / 2, cy = initialBoardBox.y + initialBoardBox.height / 2;
    await touch("touchStart", [{ x: cx, y: cy }]);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [{ x: cx + i * 5, y: cy + i * 4 }]);
    await touch("touchEnd", []);
    transformed = await boardTransform();
    assert.ok(transformed.x > beforePan.x + 20 && transformed.y > beforePan.y + 15, "One finger pans an enlarged board");
    await page.locator("#board [data-vertex]").first().dispatchEvent("click", { detail: 1 });
    await page.waitForTimeout(80);
    assert.equal(catanState.game.revision, gestureRevision, "Dragging and its synthetic click must not build a settlement");
    await page.evaluate(() => window.testCatanSocket.send(JSON.stringify({ type: "chat", text: "Gesture redraw test" })));
    await page.locator("#chatMessages").getByText("Gesture redraw test", { exact: false }).waitFor({ state: "attached" });
    assert.deepEqual(await boardTransform(), transformed, "Game updates preserve board zoom and pan");
    await page.screenshot({ path: "test-results/catan-pinch-mobile.png", fullPage: true });
    await pinch(60, 240);
    assert.equal((await boardTransform()).scale, 3, "Pinch zoom has a bounded maximum");
    await pinch(240, 50);
    assert.deepEqual(await boardTransform(), { scale: 1, x: 0, y: 0 }, "Pinching closed restores the complete board");
    await touch("touchStart", [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
    await touch("touchCancel", []);
    await page.evaluate(() => { const spacer = document.createElement("div"); spacer.id = "gesture-scroll-space"; spacer.style.height = "400px"; document.body.append(spacer); });
    await touch("touchStart", [{ x: cx, y: cy }]);
    for (let i = 1; i <= 8; i++) await touch("touchMove", [{ x: cx, y: cy - i * 10 }]);
    await touch("touchEnd", []);
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(() => scrollY) > 15, "At normal size, a single-finger swipe still scrolls the page");
    await page.evaluate(() => { document.getElementById("gesture-scroll-space").remove(); scrollTo(0, 0); });
    await pinch(80, 140);
    await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(100);
    assert.ok(await page.locator("#boardViewport").evaluate((el) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(document.getElementById("board")).transform);
      return matrix.e <= 0 && matrix.f <= 0 && matrix.e >= -el.clientWidth * (matrix.a - 1) - 1 && matrix.f >= -el.clientHeight * (matrix.a - 1) - 1;
    }), "Viewport resize keeps the enlarged board in bounds");
    await page.locator("#boardViewport").focus(); await page.keyboard.press("0");
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
    const geometry = await page.evaluate(() => {
      const desert = document.querySelector('#board .hex-land[fill="#dece96"]');
      const points = Array.from(desert.points);
      const center = points.reduce((s, p) => ({ x: s.x + p.x / 6, y: s.y + p.y / 6 }), { x: 0, y: 0 });
      const robber = document.querySelector("#board .robber-piece use");
      const piers = Array.from(document.querySelectorAll("#board .harbor-pier"), (pier) => {
        const length = pier.getTotalLength(), middle = pier.getPointAtLength(length / 2);
        const port = pier.parentNode.querySelector("circle");
        return { length, offset: Math.hypot(middle.x - port.cx.baseVal.value, middle.y - port.cy.baseVal.value) };
      });
      return { robberOffset: Math.hypot(robber.x.baseVal.value + robber.width.baseVal.value / 2 - center.x, robber.y.baseVal.value + robber.height.baseVal.value / 2 - center.y), piers };
    });
    assert.ok(geometry.robberOffset < .001, "Robber must be centered on the desert");
    assert.equal(geometry.piers.length, 9);
    assert.ok(geometry.piers.every((p) => p.offset < .001), "Both arms of each pier must be equal");
    assert.ok(Math.max(...geometry.piers.map((p) => p.length)) - Math.min(...geometry.piers.map((p) => p.length)) < .001, "All piers must have equal lengths");
    await page.screenshot({ path: "test-results/catan-board-mobile.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Game overflows horizontally");
    await pinch(80, 120);
    const tapTarget = await page.locator("#board [data-vertex]").evaluateAll((targets) => {
      const box = document.getElementById("boardViewport").getBoundingClientRect();
      return targets.map((target) => { const r = target.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
        .filter((p) => p.x > box.left + 15 && p.x < box.right - 15 && p.y > box.top + 15 && p.y < box.bottom - 15)
        .sort((a, b) => Math.hypot(a.x - box.left - box.width / 2, a.y - box.top - box.height / 2) - Math.hypot(b.x - box.left - box.width / 2, b.y - box.top - box.height / 2))[0];
    });
    assert.ok(tapTarget, "A legal settlement target is visible while zoomed");
    await touch("touchStart", [tapTarget]); await touch("touchEnd", []);
    await page.locator("#board [data-edge]").first().waitFor();
    await page.locator("#boardViewport").focus(); await page.keyboard.press("0");
    await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await touchSession.detach();
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.mouse.move(0, 0);
      const hints = await page.locator("#board .target-road").evaluateAll((nodes) => nodes.map((n) => {
        const s = getComputedStyle(n); return { stroke: s.stroke, dash: s.strokeDasharray, opacity: s.strokeOpacity, shadow: s.filter !== "none" };
      }));
      assert.ok(hints.length > 0);
      assert.ok(hints.every((hint) => hint.stroke === "rgb(53, 56, 59)" && hint.dash === "none" && hint.opacity === "0.78" && hint.shadow), "Road destinations must be dark solid shadows, not white dashes");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/catan-road-shadows-${viewport.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const firstRoad = page.locator("#board [data-edge]").first();
    await firstRoad.hover();
    assert.equal(await firstRoad.locator(".target-road").evaluate((n) => getComputedStyle(n).stroke), "rgb(22, 25, 28)");
    await firstRoad.click();
    await page.locator("#board [data-vertex]").first().waitFor(); await page.locator("#board [data-vertex]").first().press("Enter");
    await page.locator("#board [data-edge]").first().waitFor(); await page.locator("#board [data-edge]").first().press("Enter");
    await page.locator('[data-action="roll"]:not([disabled])').waitFor();
    assert.equal(await page.locator("#board .built-building").count(), 8);
    assert.equal(await page.locator("#board .built-road").count(), 8);
    assert.equal(await page.locator("#selection").isVisible(), false, "Construction should not need confirmation");
    await assertHandCards();
    // Exercise the robber UI with controlled snapshots; leave the live room unchanged.
    const actualState = structuredClone(catanState), robberState = structuredClone(actualState);
    const robberGame = robberState.game;
    robberGame.phase = "robber";
    robberGame.legal = { ...robberGame.legal, roll: false, robber: robberGame.board.tiles.filter((t) => t.id !== robberGame.board.robber).map((t) => t.id) };
    await page.evaluate(() => {
      const socket = window.testCatanSocket;
      window.testOriginalSend = socket.send; window.testActions = [];
      socket.send = (raw) => window.testActions.push(JSON.parse(raw));
    });
    for (const dice of [[], [3, 4]]) {
      robberGame.dice = dice;
      await page.evaluate((snapshot) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), robberState);
      assert.equal(await page.locator("#board .robber-target").count(), 18, "Highlight all destinations for a knight or rolled seven");
      assert.equal(await page.locator(`#board [data-tile="${robberGame.board.robber}"]`).count(), 0, "The robber cannot stay on its current tile");
      assert.match(await page.locator("#turnPrompt").textContent(), /选择空心圆.*choose a circle/);
    }
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      assert.equal(await page.locator("#board .robber-target-ring").evaluateAll((rings) => rings.every((r) => getComputedStyle(r).fill === "none" && getComputedStyle(r).strokeWidth === "2px")), true, "Destinations are visible hollow circles without hovering");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/catan-robber-targets-${viewport.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const destination = robberGame.legal.robber[0];
    const target = page.locator(`#board [data-tile="${destination}"]`);
    await target.click();
    assert.equal(await target.getAttribute("aria-pressed"), "true");
    assert.match(await page.locator("#turnPrompt").textContent(), /确认移动强盗.*Confirm/);
    await page.locator("#cancelBuild").click();
    assert.equal(await target.getAttribute("aria-pressed"), "false");
    assert.match(await page.locator("#turnPrompt").textContent(), /选择空心圆/);
    await target.press("Enter");
    assert.equal(await target.locator(".robber-target-ring").evaluate((el) => getComputedStyle(el).stroke), "rgb(255, 225, 122)");
    await page.screenshot({ path: "test-results/catan-robber-selected-390.png", fullPage: true });
    await page.locator("#confirmBuild").click();
    assert.deepEqual(await page.evaluate(() => window.testActions), [{ type: "action", action: { type: "robber", tile: destination } }]);
    const movedState = structuredClone(actualState);
    movedState.game.board.robber = destination;
    await page.evaluate((snapshot) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), movedState);
    assert.equal(await page.locator("#board .robber-target").count(), 0, "Destinations disappear after moving");
    assert.equal(await page.locator("#selection").isVisible(), false);
    const waitingState = structuredClone(robberState);
    waitingState.game.current = 1; waitingState.game.legal.robber = [];
    await page.evaluate((snapshot) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), waitingState);
    assert.equal(await page.locator("#board .robber-target").count(), 0, "Waiting players cannot choose a destination");
    assert.equal(await page.locator("#turnPrompt").textContent().then((text) => text.includes("choose a circle")), false);
    const stealState = structuredClone(actualState), stealGame = stealState.game, stealTile = stealGame.board.tiles[0];
    stealGame.phase = "steal"; stealGame.board.robber = stealTile.id;
    stealGame.legal = { ...stealGame.legal, roll: false, victims: [1, 2] };
    stealGame.board.vertices.forEach((v) => { v.owner = -1; v.level = 0; });
    for (const [corner, owner] of [[0, 1], [2, 2], [4, 3]]) {
      const vertex = stealGame.board.vertices[stealTile.vertices[corner]];
      vertex.owner = owner; vertex.level = owner === 2 ? 2 : 1;
    }
    const remote = stealGame.board.vertices.filter((v) => !v.tiles.includes(stealTile.id));
    remote[0].owner = 0; remote[0].level = 1;
    remote.at(-1).owner = 1; remote.at(-1).level = 1;
    await page.evaluate((snapshot) => {
      window.testActions = [];
      window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) }));
    }, stealState);
    assert.equal(await page.locator("#special").isVisible(), false, "No name buttons for choosing a victim");
    assert.deepEqual(await page.locator("#board [data-victim]").evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.victim))), [1, 2]);
    assert.equal(await page.locator('#board [data-victim="2"] use').getAttribute("href"), "#catan-art-city");
    assert.match(await page.locator("#turnPrompt").textContent(), /点击发光的房子.*glowing building/);
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.mouse.move(0, 0); await page.evaluate(() => window.scrollTo(0, 0));
      assert.equal(await page.locator(".steal-halo").evaluateAll((nodes) => nodes.every((n) => getComputedStyle(n).animationName === "steal-highlight")), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const targets = await page.locator(".steal-hit").evaluateAll((nodes) => nodes.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
      assert.ok(targets[0].right <= targets[1].x || targets[1].right <= targets[0].x || targets[0].bottom <= targets[1].y || targets[1].bottom <= targets[0].y, "Victim hit areas do not overlap");
      assert.equal(await page.evaluate(() => {
        const badge = document.querySelector("#board .blocked-number")?.getBoundingClientRect();
        return !badge || [...document.querySelectorAll(".steal-target .building-piece use")].every((piece) => {
          const r = piece.getBoundingClientRect();
          return r.right <= badge.left || badge.right <= r.left || r.bottom <= badge.top + .5 || badge.bottom <= r.top + .5;
        });
      }), true, "Highlighted buildings do not cover the blocked number");
      await page.screenshot({ path: `test-results/catan-steal-buildings-${viewport.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".steal-halo").first().evaluate((n) => getComputedStyle(n).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator("#board .steal-inactive").first().click();
    assert.deepEqual(await page.evaluate(() => window.testActions), []);
    await page.locator('#board [data-victim="1"]').click();
    await page.locator('#board [data-victim="2"]').click();
    assert.deepEqual(await page.evaluate(() => window.testActions), [{ type: "action", action: { type: "steal", victim: 1 } }], "Direct click steals once and blocks double taps");
    assert.equal(await page.locator("#selection").isVisible(), false, "Stealing does not need confirmation");
    await page.evaluate((snapshot) => {
      window.testActions = [];
      window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) }));
    }, stealState);
    await page.locator('#board [data-victim="2"]').press("Enter");
    assert.deepEqual(await page.evaluate(() => window.testActions), [{ type: "action", action: { type: "steal", victim: 2 } }], "Cities also support keyboard selection");
    stealGame.board.vertices[stealTile.vertices[4]].owner = 1;
    await page.evaluate((snapshot) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), stealState);
    assert.equal(await page.locator('#board [data-victim="1"]').count(), 2, "Either adjacent building of the same player can be chosen");
    stealGame.current = 1; stealGame.legal.victims = [];
    await page.evaluate((snapshot) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), stealState);
    assert.equal(await page.locator("#board [data-victim]").count(), 0, "Waiting players cannot steal");
    const feedback = structuredClone(actualState);
    feedback.code = "CFEED"; feedback.game.phase = "main";
    feedback.game.legal = { ...feedback.game.legal, roll: false, trade: true, end: true, development: [] };
    feedback.game.players.forEach((p, i) => { p.resourceCount = [5, 6, 3, 0][i]; p.developmentCount = [1, 2, 1, 0][i]; });
    function feedbackSnapshot(you = 0) {
      const snapshot = structuredClone(feedback); snapshot.you = you;
      snapshot.game.legal.trade = you === snapshot.game.current; snapshot.game.legal.end = you === snapshot.game.current;
      for (const p of snapshot.game.players) {
        p.resources = p.id === you ? [p.resourceCount, 0, 0, 0, 0] : null;
        p.development = p.id === you ? Array.from({ length: p.developmentCount }, () => ({ type: "knight", turn: 0 })) : null;
      }
      return snapshot;
    }
    const deliverFeedback = (snapshot) => page.evaluate((data) => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })), snapshot);
    await deliverFeedback(structuredClone(actualState));
    await page.evaluate(() => { window.testBoardNode = document.querySelector("#board svg"); });
    await deliverFeedback(structuredClone(actualState));
    assert.equal(await page.evaluate(() => window.testBoardNode === document.querySelector("#board svg")), true, "Identical snapshots retain the existing board DOM");
    const chatOnly = structuredClone(actualState);
    chatOnly.chat.push({ id: "render-cache-chat", playerId: 0, name: "Alice", text: "hello", time: Date.now() });
    chatOnly.seats[1].connected = false;
    await deliverFeedback(chatOnly);
    assert.equal(await page.evaluate(() => window.testBoardNode === document.querySelector("#board svg")), true, "Chat and presence update without rebuilding the board");
    await deliverFeedback(structuredClone(actualState));
    const deltas = () => page.locator("[data-card-change]").evaluateAll((nodes) => Object.fromEntries(nodes.filter((n) => n.textContent).map((n) => [n.dataset.cardChange, n.textContent])));
    feedback.game.trade = { id: 500, from: 0, to: null, give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0], rejected: [] };
    await deliverFeedback(feedbackSnapshot());
    assert.deepEqual(await deltas(), {}, "Joining a room must not show all existing cards as gains");
    assert.equal(await page.locator('[data-response="pending"]').count(), 3);
    feedback.game.trade.rejected.push(1); feedback.game.revision++;
    await deliverFeedback(feedbackSnapshot());
    assert.match(await page.locator('[data-trade-player="1"]').textContent(), /已拒绝.*Declined/);
    assert.match(await page.locator('[data-trade-player="3"]').textContent(), /等待回应.*Waiting/, "An empty hand is not an automatic decline");
    await page.screenshot({ path: "test-results/catan-trade-responses-390.png", fullPage: true });
    feedback.game.trade = { ...feedback.game.trade, id: 501, to: 2, rejected: [] }; feedback.game.revision++;
    await deliverFeedback(feedbackSnapshot());
    assert.equal(await page.locator('[data-response="excluded"]').count(), 2);
    assert.equal(await page.locator('[data-response="pending"]').count(), 1);
    assert.equal(await page.locator('[data-response="declined"]').count(), 0, "A new offer resets old responses");
    await deliverFeedback(feedbackSnapshot(2));
    assert.equal(await page.locator('[data-offer="acceptTrade"]').count(), 1, "The recipient has response controls");
    await deliverFeedback(feedbackSnapshot(1));
    assert.equal(await page.locator("#tradeOffer button").count(), 0, "Uninvited players can see responses but cannot respond");
    feedback.game.trade.rejected = [2]; feedback.game.revision++;
    await deliverFeedback(feedbackSnapshot());
    assert.equal(await page.locator('[data-trade-player="2"]').getAttribute("data-response"), "declined");
    feedback.game.trade = { ...feedback.game.trade, id: 502, to: null, rejected: [1, 2, 3] }; feedback.game.revision++;
    await deliverFeedback(feedbackSnapshot());
    assert.equal(await page.locator('[data-response="declined"]').count(), 3);
    feedback.game.trade = null; feedback.game.revision++;
    await deliverFeedback(feedbackSnapshot());
    assert.equal(await page.locator("#tradeOffer").isVisible(), false, "Completed or withdrawn offers stop showing pending responses");
    feedback.game.trade = { id: 503, from: 0, to: null, give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0], rejected: [1] };
    const baseline = feedbackSnapshot(), changed = feedbackSnapshot();
    changed.game.revision++;
    changed.game.players[0].resourceCount += 2; changed.game.players[0].resources[0] += 2;
    changed.game.players[1].resourceCount--; changed.game.players[1].developmentCount--;
    changed.game.players[2].developmentCount++;
    const expectedDeltas = { "0:resource": "+2", "1:resource": "-1", "1:development": "-1", "2:development": "+1" };
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await deliverFeedback(baseline);
      const beforeHeight = (await page.locator("#players").boundingBox()).height;
      await deliverFeedback(changed);
      assert.deepEqual(await deltas(), expectedDeltas);
      assert.equal((await page.locator("#players").boundingBox()).height, beforeHeight, "Deltas must not resize player rows");
      const geometry = await page.evaluate(() => {
        const contained = (element, parent) => {
          const a = element.getBoundingClientRect(), b = parent.getBoundingClientRect();
          return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        };
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          deltasFit: [...document.querySelectorAll(".card-change")].every((n) => contained(n, n.closest("td"))),
          responsesFit: [...document.querySelectorAll(".trade-response")].every((n) => contained(n, n.closest("li"))),
          separate: [...document.querySelectorAll(".card-count")].every((n) => n.querySelector(".card-count-total").getBoundingClientRect().bottom <= n.querySelector(".card-change").getBoundingClientRect().top + 1)
        };
      });
      assert.deepEqual(geometry, { overflow: false, deltasFit: true, responsesFit: true, separate: true });
      await page.locator("#players").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/catan-card-feedback-${viewport.width}.png`, fullPage: true });
    }
    await page.evaluate((snapshot) => {
      window.testFeedbackInterval = setInterval(() => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), 150);
    }, changed);
    await page.waitForFunction(() => [...document.querySelectorAll("[data-card-change]")].every((n) => !n.textContent), null, { timeout: 6000 });
    await page.evaluate(() => { clearInterval(window.testFeedbackInterval); delete window.testFeedbackInterval; });
    assert.deepEqual(await deltas(), {}, "Unchanged snapshots must not replay or extend a delta");
    changed.game.players[0].resourceCount++; changed.game.players[0].resources[0]++; changed.game.revision++;
    await deliverFeedback(changed); assert.equal((await deltas())["0:resource"], "+1");
    changed.game.players[0].resourceCount -= 3; changed.game.players[0].resources[0] -= 3; changed.game.revision++;
    await deliverFeedback(changed); assert.equal((await deltas())["0:resource"], "-3", "Consecutive changes show their own signed amounts");
    await page.evaluate(() => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "welcome", token: sessionStorage.getItem("catan-token") }) })));
    changed.game.players[0].resourceCount += 2; changed.game.players[0].resources[0] += 2; changed.game.revision++;
    await deliverFeedback(changed); assert.deepEqual(await deltas(), {}, "Reconnect establishes a fresh baseline");
    changed.game.revision = 0; changed.game.players[0].resourceCount = 0; changed.game.players[0].resources[0] = 0;
    await deliverFeedback(changed); assert.deepEqual(await deltas(), {}, "Restarting a match must not show discarded starting cards");
    const composer = feedbackSnapshot(); composer.game.trade = null;
    composer.game.players[0].resources = [6, 4, 0, 2, 0]; composer.game.players[0].resourceCount = 12;
    await deliverFeedback(composer);
    await page.locator('[data-action="trade"]').click();
    await page.locator('[data-trade-mode="players"]').click();
    const addCard = (side, resource) => page.locator(`[data-add-trade="${side}"][data-resource="${resource}"]`);
    const removeCard = (side, resource) => page.locator(`[data-remove-trade="${side}"][data-resource="${resource}"]`).first();
    const draftCards = (side) => page.locator(`#draft${side} .trade-card`).evaluateAll((cards) => cards.map((c) => Number(c.dataset.resource)));
    assert.equal(await page.locator('#playerTradeFields input[type="number"]').count(), 0, "No numeric entry for player trades");
    assert.equal(await page.locator("[data-add-trade]").count(), 10, "Five resource buttons on each side");
    assert.equal(await page.locator("#confirmTrade").isDisabled(), true);
    assert.equal(await addCard("give", 2).isDisabled(), true, "Cannot offer an unowned resource");
    await addCard("give", 0).click(); await addCard("give", 0).press("Enter"); await addCard("give", 1).click();
    await addCard("want", 3).click(); await addCard("want", 3).press("Space"); await addCard("want", 4).click();
    assert.equal(await addCard("want", 0).isDisabled(), true, "The same resource cannot appear on both sides");
    assert.equal(await addCard("give", 3).isDisabled(), true);
    await removeCard("give", 0).click(); await removeCard("want", 4).press("Enter");
    assert.deepEqual(await draftCards("Give"), [0, 1]);
    assert.deepEqual(await draftCards("Want"), [3, 3]);
    assert.equal(await addCard("give", 4).isDisabled(), true, "Removing a request does not create owned cards");
    await addCard("give", 0).click(); await addCard("give", 0).click(); await addCard("want", 4).click();
    await deliverFeedback(composer);
    assert.deepEqual(await draftCards("Give"), [0, 0, 0, 1], "An incoming room update preserves the current draft");
    assert.deepEqual(await draftCards("Want"), [3, 3, 4]);
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.mouse.move(0, 0);
      const layout = await page.evaluate(() => {
        const dialog = document.getElementById("tradeDialog"), rect = dialog.getBoundingClientRect();
        const submit = document.getElementById("confirmTrade").getBoundingClientRect();
        return {
          inViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
          confirmVisible: submit.bottom <= rect.bottom && submit.top >= rect.top,
          overflow: dialog.scrollWidth > dialog.clientWidth,
          buttonsFit: [...dialog.querySelectorAll(".trade-resource-add")].every((b) => b.clientWidth >= 44 && b.scrollWidth <= b.clientWidth + 1),
          traysFit: [...dialog.querySelectorAll(".trade-card-list")].every((b) => b.scrollWidth <= b.clientWidth),
          separate: [...dialog.querySelectorAll(".trade-card-list")].every((list) => {
            const cards = [...list.querySelectorAll(".trade-card")].map((c) => c.getBoundingClientRect());
            return !cards.some((a, i) => cards.slice(i + 1).some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
          })
        };
      });
      assert.deepEqual(layout, { inViewport: true, confirmVisible: true, overflow: false, buttonsFit: true, traysFit: true, separate: true });
      await page.screenshot({ path: `test-results/catan-trade-composer-${viewport.width}.png` });
    }
    await page.locator("#tradeTarget").selectOption("2");
    await page.evaluate(() => { window.testActions = []; });
    await page.locator("#confirmTrade").click();
    assert.deepEqual(await page.evaluate(() => window.testActions), [{ type: "action", action: { type: "offerTrade", give: [3, 1, 0, 0, 0], want: [0, 0, 0, 2, 1], to: 2 } }]);
    assert.equal(await page.locator("#tradeDialog").isVisible(), false);
    await deliverFeedback(composer);
    await page.locator('[data-action="trade"]').click();
    assert.deepEqual(await draftCards("Give"), []); assert.deepEqual(await draftCards("Want"), []);
    assert.equal(await page.locator("#tradeTarget").inputValue(), "all", "New offers reset the recipient too");
    for (let i = 0; i < 6; i++) await addCard("give", 0).click();
    assert.equal(await addCard("give", 0).isDisabled(), true, "Give selection is capped at the actual hand");
    for (let i = 0; i < 19; i++) await addCard("want", 2).click();
    assert.equal(await addCard("want", 2).isDisabled(), true, "Requests are capped by the base game's 19 cards per resource");
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.locator("#draftWant .trade-card").evaluateAll((cards) => new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size > 1), "Trade cards wrap to another row");
      assert.equal(await page.locator("#tradeDialog").evaluate((d) => d.scrollWidth > d.clientWidth), false);
      const submit = await page.locator("#confirmTrade").boundingBox();
      assert.ok(submit.y >= 0 && submit.y + submit.height <= viewport.height, "Submit stays visible with a large trade");
      await page.screenshot({ path: `test-results/catan-trade-many-cards-${viewport.width}.png` });
    }
    await removeCard("give", 0).click(); await removeCard("want", 2).click();
    assert.equal(await addCard("give", 0).isDisabled(), false);
    assert.equal(await addCard("want", 2).isDisabled(), false);
    await page.locator('[data-trade-mode="bank"]').click();
    assert.equal(await page.locator("#confirmTrade").isDisabled(), false, "Bank trade remains independent from the draft");
    await page.locator('[data-trade-mode="players"]').click();
    assert.equal((await draftCards("Give")).length, 5, "Mode switches within one dialog do not erase the current draft");
    await page.locator('[data-close="tradeDialog"]').click();
    await page.locator('[data-action="trade"]').click();
    assert.deepEqual(await draftCards("Give"), []); assert.deepEqual(await draftCards("Want"), []);
    await addCard("give", 0).click(); await addCard("want", 1).click();
    await page.keyboard.press("Escape"); await page.locator('[data-action="trade"]').click();
    assert.deepEqual(await draftCards("Give"), []); assert.deepEqual(await draftCards("Want"), []);
    assert.equal(await page.locator("#confirmTrade").isDisabled(), true);
    await page.locator('[data-close="tradeDialog"]').click();
    const discarding = structuredClone(composer);
    discarding.game.phase = "discard"; discarding.game.current = 2;
    discarding.game.legal = { ...discarding.game.legal, discard: 6, trade: false, end: false, roll: false };
    discarding.game.players[0].resources = [4, 3, 2, 1, 2]; discarding.game.players[0].resourceCount = 12;
    await deliverFeedback(discarding);
    await page.evaluate(() => { window.testActions = []; });
    await page.locator('[data-special="discard"]').click();
    const discardCard = (side, r) => page.locator(`[data-discard-side="${side}"][data-resource="${r}"]`).first();
    const discardCards = (id) => page.locator(`#${id} .discard-card`).evaluateAll((cards) => cards.map((c) => Number(c.dataset.resource)));
    const originalHand = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 4];
    assert.deepEqual(await discardCards("discardHand"), originalHand);
    assert.deepEqual(await discardCards("discardSelected"), []);
    assert.equal(await page.locator('#resourceDialog input[type="number"]').count(), 0, "Discard uses actual cards, not numeric quantities");
    assert.equal(await page.locator("#confirmResources").isDisabled(), true);
    assert.equal(await page.locator("#resourceHint").textContent(), "已选 / Selected 0 / 6");
    const initialHandHeight = (await page.locator("#discardHand").boundingBox()).height;
    await discardCard("keep", 0).click(); await discardCard("keep", 0).press("Enter");
    await discardCard("keep", 1).click(); await discardCard("keep", 2).press("Space");
    await discardCard("keep", 3).click(); await discardCard("keep", 4).click();
    assert.deepEqual(await discardCards("discardSelected"), [0, 0, 1, 2, 3, 4]);
    assert.deepEqual(await discardCards("discardHand"), [0, 0, 1, 1, 2, 4]);
    assert.equal(await page.locator("#discardHand button:not(:disabled)").count(), 0, "Cannot select more than the required discard");
    assert.equal(await page.locator("#confirmResources").isDisabled(), false);
    assert.equal(await page.locator("#resourceHint").textContent(), "已选 / Selected 6 / 6");
    assert.equal((await page.locator("#discardHand").boundingBox()).height, initialHandHeight, "Card movements must not resize the hand area");
    assert.equal(await page.locator("#resources .resource-card").count(), 12, "The actual hand is not changed until confirmation");
    assert.deepEqual(await page.evaluate(() => window.testActions), [], "Picking cards must not send a discard yet");
    await discardCard("discard", 4).click();
    assert.equal(await page.locator("#confirmResources").isDisabled(), true);
    assert.deepEqual(await discardCards("discardHand"), [0, 0, 1, 1, 2, 4, 4]);
    await discardCard("keep", 4).press("Enter");
    await deliverFeedback(discarding);
    assert.deepEqual(await discardCards("discardSelected"), [0, 0, 1, 2, 3, 4], "Other players' updates must not reset the selection");
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.mouse.move(0, 0);
      const geometry = await page.evaluate(() => {
        const dialog = document.getElementById("resourceDialog"), d = dialog.getBoundingClientRect();
        const hand = document.getElementById("discardHand").getBoundingClientRect();
        const chosen = document.getElementById("discardSelected").getBoundingClientRect();
        const confirm = document.getElementById("confirmResources").getBoundingClientRect();
        return {
          dialogVisible: d.top >= 0 && d.bottom <= innerHeight && d.left >= 0 && d.right <= innerWidth,
          bothHandsVisible: hand.top >= d.top && hand.bottom < chosen.top && chosen.bottom < confirm.top,
          confirmVisible: confirm.bottom <= d.bottom,
          overflow: dialog.scrollWidth > dialog.clientWidth,
          cardsFit: [...dialog.querySelectorAll(".discard-card")].every((card) => card.getBoundingClientRect().width >= 44 && card.scrollWidth <= card.clientWidth),
          traysFit: [...dialog.querySelectorAll(".discard-hand")].every((list) => list.scrollWidth <= list.clientWidth)
        };
      });
      assert.deepEqual(geometry, { dialogVisible: true, bothHandsVisible: true, confirmVisible: true, overflow: false, cardsFit: true, traysFit: true });
      await page.screenshot({ path: `test-results/catan-discard-cards-${viewport.width}.png` });
    }
    await page.locator('[data-close="resourceDialog"]').click();
    await page.locator('[data-special="discard"]').click();
    assert.deepEqual(await discardCards("discardHand"), originalHand);
    assert.deepEqual(await discardCards("discardSelected"), [], "Reopening starts a fresh discard selection");
    assert.equal(await page.locator("#confirmResources").isDisabled(), true);
    for (const r of [0, 0, 1, 2, 3, 4]) await discardCard("keep", r).click();
    await page.locator("#confirmResources").click();
    assert.deepEqual(await page.evaluate(() => window.testActions), [{ type: "action", action: { type: "discard", resources: [2, 1, 1, 1, 1] } }]);
    assert.equal(await page.locator("#resourceDialog").isVisible(), false);
    const largeDiscard = structuredClone(discarding);
    largeDiscard.game.players[0].resources = [9, 8, 7, 6, 5]; largeDiscard.game.players[0].resourceCount = 35;
    largeDiscard.game.legal.discard = 17;
    await deliverFeedback(largeDiscard); await page.locator('[data-special="discard"]').click();
    for (let i = 0; i < 9; i++) await discardCard("keep", 0).click();
    for (let i = 0; i < 8; i++) await discardCard("keep", 1).click();
    assert.equal((await discardCards("discardHand")).length, 18);
    assert.equal((await discardCards("discardSelected")).length, 17);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const id of ["discardHand", "discardSelected"]) {
      assert.equal(await page.locator(`#${id}`).evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollWidth <= el.clientWidth), true, "Large hands scroll within their own area without hiding the other hand");
      await page.locator(`#${id}`).evaluate((el) => { el.scrollTop = el.scrollHeight; });
    }
    const largeConfirm = await page.locator("#confirmResources").boundingBox();
    assert.ok(largeConfirm.y > 0 && largeConfirm.y + largeConfirm.height <= 640);
    await page.screenshot({ path: "test-results/catan-discard-large-320.png" });
    const resolvedDiscard = structuredClone(discarding); resolvedDiscard.game.legal.discard = 0;
    await deliverFeedback(resolvedDiscard);
    assert.equal(await page.locator("#resourceDialog").isVisible(), false, "Auto-resolved discards close the stale selection");
    for (const mode of ["plenty", "monopoly"]) {
      const special = structuredClone(resolvedDiscard); special.game.phase = mode; special.game.current = 0;
      special.game.bank = mode === "monopoly" ? [0, 0, 0, 0, 0] : [1, 0, 19, 19, 19];
      await deliverFeedback(special); await page.locator(`[data-special="${mode}"]`).click();
      assert.equal(await page.locator("#discardChoices").isVisible(), false);
      assert.equal(await page.locator('#resourceDialog input[type="number"]').count(), 0, "All resources use card pickers");
      assert.equal(await page.locator("#resourceSupply button").count(), 5);
      assert.equal(await page.locator("#confirmResources").isDisabled(), true);
      const add = (r) => page.locator(`[data-add-resource="${r}"]`);
      await add(0).click();
      if (mode === "plenty") {
        assert.equal(await add(0).isDisabled(), true, "Cannot exceed bank stock");
        assert.equal(await add(1).isDisabled(), true, "Empty bank resources cannot be chosen for Plenty");
      }
      await add(4).click();
      assert.equal(await page.locator("#resourceSelected button").count(), mode === "plenty" ? 2 : 1, "Monopoly switches resource in one click, even with an empty bank");
      await page.locator(`#resourceSelected [data-remove-resource="${mode === "plenty" ? 0 : 4}"]`).click();
      assert.equal(await page.locator("#confirmResources").isDisabled(), true, "Clicking a selected card removes it");
      await add(4).focus(); await page.keyboard.press("Space");
      for (const viewport of [{width:320,height:568}, {width:740,height:320}, {width:1440,height:1000}]) {
        await page.setViewportSize(viewport);
        assert.equal(await page.locator("#resourceDialog").evaluate(dialog => {
          const box = dialog.getBoundingClientRect(), confirm = document.getElementById("confirmResources").getBoundingClientRect();
          const choices = document.getElementById("resourceChoices").getBoundingClientRect();
          const visibleCards = [...dialog.querySelectorAll("#resourceSupply button, #resourceSelected button")].every(card => {
            const r = card.getBoundingClientRect(); return r.top >= choices.top && r.bottom <= choices.bottom + 1 && r.left >= choices.left && r.right <= choices.right;
          });
          return visibleCards && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && confirm.bottom <= box.bottom && confirm.top >= box.top && dialog.scrollWidth <= dialog.clientWidth;
        }), true, "Card picker and confirmation fit on portrait and landscape phones");
        await page.screenshot({path:`test-results/catan-${mode}-picker-${viewport.width}.png`});
      }
      await page.locator("#confirmResources").click();
      assert.deepEqual(await page.evaluate(() => window.testActions.at(-1)), { type: "action", action: mode === "plenty" ? { type: "plenty", resources: [0, 0, 0, 0, 2] } : { type: "monopoly", resource: 4 } });
    }
    const scarce = structuredClone(resolvedDiscard); scarce.game.phase = "plenty"; scarce.game.current = 0;
    scarce.game.bank = [0, 1, 0, 0, 0];
    await deliverFeedback(scarce); await page.locator('[data-special="plenty"]').click();
    await page.locator('[data-add-resource="1"]').click();
    assert.equal(await page.locator("#confirmResources").isEnabled(), true, "Plenty can take the bank's last single card");
    scarce.game.bank = [0, 0, 0, 0, 0]; await deliverFeedback(scarce);
    assert.equal(await page.locator("#resourceSelected button").count(), 0, "Live supply changes remove unavailable choices");
    assert.equal(await page.locator("#confirmResources").isEnabled(), true, "An empty bank must not leave Plenty stuck");
    await page.locator("#confirmResources").click();
    assert.deepEqual(await page.evaluate(() => window.testActions.at(-1)), {type:"action",action:{type:"plenty",resources:[0,0,0,0,0]}});
    const E = require("./catan-engine");
    const devGame = E.createGame(actualState.seats.map((seat) => seat.name));
    while (devGame.phase.startsWith("setup")) E.act(devGame, devGame.current, E.chooseBotAction(devGame, devGame.current));
    for (const type of ["vp", "plenty", "roads", "monopoly", "knight"]) {
      devGame.deck.splice(devGame.deck.indexOf(type), 1); devGame.players[0].development.push({ type, turn: 0 });
    }
    const deliverDevelopment = () => deliverFeedback({ ...structuredClone(actualState), code: "CDEVS", game: E.publicGame(devGame, 0) });
    async function applyDevelopmentAction(expected) {
      const message = await page.evaluate(() => window.testActions.at(-1));
      assert.deepEqual(message, { type: "action", action: expected });
      E.act(devGame, 0, message.action); await deliverDevelopment();
    }
    await deliverDevelopment();
    const art = await page.locator("#development .development-card > svg use").evaluateAll((icons) => icons.map((icon) => icon.getAttribute("href")));
    assert.equal(new Set(art).size, 5, "Every development card has its own illustration");
    const sprite = await (await fetch(`http://127.0.0.1:${port}/catan-art.svg`)).text();
    for (const href of art) assert.ok(sprite.includes(`id="${href.replace("#catan-art-", "")}"`), "Each card illustration exists in the shared sprite");
    assert.equal(await page.locator('[data-dev="vp"]').isDisabled(), true);
    assert.equal(await page.locator('[data-dev="vp"]').evaluate((card) => getComputedStyle(card).opacity), "1", "Victory points stay readable even though they cannot be played");
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.locator("#development").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#development .development-card").evaluateAll((cards) => cards.every((card) => {
        const box = card.getBoundingClientRect(), image = card.firstElementChild.getBoundingClientRect(), label = card.lastElementChild.getBoundingClientRect();
        return image.bottom <= label.top + 1 && label.bottom <= box.bottom + 1 && label.left >= box.left && label.right <= box.right;
      })), true, "Bilingual labels and card art stay separate and within each card");
      await page.screenshot({ path: `test-results/catan-development-cards-${viewport.width}.png`, fullPage: true });
    }
    for (const phase of ["roll", "main"]) {
      if (phase === "main") E.act(devGame, 0, { type: "roll" }, () => 0);
      await deliverDevelopment();
      const hand = structuredClone(devGame.players[0].development), resources = [...devGame.players[0].resources];
      await page.setViewportSize({ width: 320, height: 640 });
      await page.locator('[data-dev="roads"]').click(); await applyDevelopmentAction({ type: "playDevelopment", card: "roads" });
      assert.match(await page.locator("[data-cancel-development]").textContent(), /撤回道路卡/);
      assert.ok(await page.locator("#board [data-edge]").count() > 0);
      await page.locator("[data-cancel-development]").scrollIntoViewIfNeeded();
      assert.equal(await page.locator("#special").evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      await page.screenshot({ path: `test-results/catan-roads-cancel-${phase}.png` });
      await page.locator("[data-cancel-development]").click(); await applyDevelopmentAction({ type: "cancelDevelopment" });
      assert.deepEqual(devGame.players[0].development, hand); assert.equal(devGame.phase, phase);
      assert.equal(devGame.developmentPlayed, false);
      assert.equal(await page.locator("#board [data-edge]").count(), 0, "Cancelling clears the free-road targets");
      assert.equal(await page.locator(`[data-action="${phase === "roll" ? "roll" : "end"}"]`).isDisabled(), false);
      await page.locator('[data-dev="plenty"]').click(); await applyDevelopmentAction({ type: "playDevelopment", card: "plenty" });
      await page.locator("[data-cancel-development]").click(); await applyDevelopmentAction({ type: "cancelDevelopment" });
      assert.deepEqual(devGame.players[0].development, hand); assert.equal(devGame.phase, phase);
      await page.locator('[data-dev="plenty"]').click(); await applyDevelopmentAction({ type: "playDevelopment", card: "plenty" });
      await page.locator('[data-special="plenty"]').click(); await page.locator('[data-add-resource="0"]').click();
      await page.setViewportSize({ width: 320, height: 640 });
      await page.locator("#cancelDevelopment").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/catan-plenty-cancel-${phase}.png` });
      await page.locator("#cancelDevelopment").click(); await applyDevelopmentAction({ type: "cancelDevelopment" });
      assert.equal(await page.locator("#resourceDialog").isVisible(), false);
      assert.equal(await page.locator("#special").isVisible(), false);
      assert.deepEqual(devGame.players[0].development, hand); assert.deepEqual(devGame.players[0].resources, resources);
      assert.equal(devGame.phase, phase); assert.equal(devGame.developmentPlayed, false);
      assert.equal(await page.locator(`[data-action="${phase === "roll" ? "roll" : "end"}"]`).isDisabled(), false);
    }
    await page.locator('[data-dev="plenty"]').click(); await applyDevelopmentAction({ type: "playDevelopment", card: "plenty" });
    await page.locator('[data-special="plenty"]').click();
    assert.equal(await page.locator("#resourceSelected button").count(), 0, "Cancelling clears the old resource choice");
    await page.locator('[data-add-resource="4"]').click(); await page.locator('[data-add-resource="4"]').click(); await page.locator("#confirmResources").click();
    await applyDevelopmentAction({ type: "plenty", resources: [0, 0, 0, 0, 2] });
    assert.equal(await page.locator("[data-cancel-development]").count(), 0);
    assert.equal(devGame.developmentPlayed, true);
    assert.equal(externalSpriteRequests, 0, "CATAN must not request the fragile external sprite during a game");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((snapshot) => {
      window.testCatanSocket.send = window.testOriginalSend;
      window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) }));
      delete window.testOriginalSend; delete window.testActions;
    }, actualState);
    assert.equal(await page.locator(".steal-halo, .steal-inactive").count(), 0, "Steal highlighting clears after the action");
    for (const viewport of [{ width: 320, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => window.scrollTo(0, 0));
      const layout = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const buttons = [...document.querySelectorAll("#actions button")].filter((b) => b.getBoundingClientRect().width);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          actionsBottom: rect("#actions").bottom,
          playersTop: rect(".player-overview").top,
          playersBottom: rect(".player-overview").bottom,
          bankTop: rect("#supplyDetails").top,
          resourcesTop: rect("#resources").top,
          boardBottom: rect("#boardViewport").bottom,
          promptTop: rect(".turn-banner").top,
          minButtonHeight: Math.min(...buttons.map((b) => b.getBoundingClientRect().height)),
          detailsClosed: [...document.querySelectorAll(".table-detail:not(#supplyDetails)")].every((d) => !d.open),
          bankOpen: document.getElementById("supplyDetails").open
        };
      });
      assert.equal(layout.overflow, false, `Horizontal overflow at ${viewport.width}`);
      assert.ok(layout.actionsBottom <= viewport.height, `Main actions below fold at ${viewport.width}: ${layout.actionsBottom}`);
      assert.ok(layout.actionsBottom <= layout.playersTop && layout.playersBottom <= layout.bankTop, "Player overview belongs between actions and bank");
      assert.ok(layout.boardBottom <= layout.promptTop + 1 && layout.boardBottom < layout.resourcesTop, "Board must not overlap controls");
      assert.ok(layout.minButtonHeight >= 44, "Touch actions should be at least 44px tall");
      assert.equal(layout.detailsClosed, true, "Other secondary panels start collapsed on mobile");
      assert.equal(layout.bankOpen, true, "Bank stock stays expanded on mobile");
      assert.equal(await page.locator("#bank .bank-item").count(), 5);
      await page.screenshot({ path: `test-results/catan-compact-${viewport.width}.png` });
    }
    await page.evaluate(() => {
      const hand = document.getElementById("resources"), card = hand.querySelector(".resource-card");
      for (let i = 0; i < 30; i++) { const extra = card.cloneNode(true); extra.dataset.testExtra = "true"; hand.append(extra); }
      const development = document.getElementById("development");
      development.dataset.wasEmpty = String(development.classList.contains("empty"));
      development.classList.remove("empty");
      for (let i = 0; i < 8; i++) {
        const extra = document.createElement("button");
        extra.className = "development-card"; extra.dataset.testExtra = "true";
        extra.textContent = "Knight"; extra.disabled = true; development.append(extra);
      }
    });
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await page.locator("#resources").scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Long hands must not stretch the page");
      for (const selector of ["#resources", "#development"]) {
        const layout = await page.locator(selector).evaluate((el) => {
          const parent = el.getBoundingClientRect(), cards = [...el.querySelectorAll(".resource-card, .development-card")].map((c) => c.getBoundingClientRect());
          return {
            rows: new Set(cards.map((c) => Math.round(c.top))).size,
            overflow: el.scrollWidth > el.clientWidth,
            contained: cards.every((c) => c.left >= parent.left && c.right <= parent.right + 1 && c.top >= parent.top && c.bottom <= parent.bottom + 1),
            overlap: cards.some((a, i) => cards.slice(i + 1).some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top))
          };
        });
        assert.ok(layout.rows >= 2, `${selector} should wrap onto the next row at ${viewport.width}px`);
        assert.equal(layout.overflow, false, "Hands no longer need horizontal scrolling");
        assert.equal(layout.contained, true, "Every card remains visible inside the hand");
        assert.equal(layout.overlap, false, "Wrapped cards must not overlap");
      }
      await page.screenshot({ path: `test-results/catan-long-hand-${viewport.width}.png`, fullPage: true });
    }
    await page.evaluate(() => {
      document.querySelectorAll("[data-test-extra]").forEach((card) => card.remove());
      const development = document.getElementById("development");
      development.classList.toggle("empty", development.dataset.wasEmpty === "true");
      delete development.dataset.wasEmpty;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("#players .summary-player").count(), 4);
    for (const [i, player] of catanState.game.players.entries()) {
      const row = page.locator("#players .summary-player").nth(i);
      assert.equal(await row.locator(".resource-count b").textContent(), String(player.resourceCount));
      assert.equal(await row.locator(".development-count b").textContent(), String(player.developmentCount));
      assert.equal(await row.locator(".knight-count b").textContent(), String(player.knights));
      assert.equal(await row.locator(".road-count b").textContent(), String(player.roads));
      assert.equal(await row.locator(".longest-count b").textContent(), String(catanState.game.roadLengths[player.id]));
      assert.equal(await row.locator(".island-points").count(), 0);
    }
    const beforeZoom = await page.locator("#boardViewport").boundingBox();
    assert.equal(await page.locator("#zoomIn,#zoomOut,.zoom-controls").count(), 0);
    await page.locator("#boardViewport").focus();
    await page.keyboard.press("+");
    const afterZoom = await page.locator("#boardViewport").boundingBox();
    assert.ok(Math.abs(beforeZoom.height - afterZoom.height) < 1, "Zoom should not stretch the page");
    assert.ok(await page.locator("#board").evaluate((board) => new DOMMatrixReadOnly(getComputedStyle(board).transform).a) > 1);
    await page.keyboard.press("0");
    await page.locator("#boardViewport").dispatchEvent("wheel", { ctrlKey: true, deltaY: -40, clientX: beforeZoom.x + beforeZoom.width / 2, clientY: beforeZoom.y + beforeZoom.height / 2 });
    assert.ok((await boardTransform()).scale > 1.4, "Trackpad pinch / Ctrl-wheel zoom remains available on computers");
    await page.keyboard.press("0");
    await page.locator("#chatDetails summary").click();
    await page.locator("#chatInput").fill("Compact chat test"); await page.locator("#chatForm button").click();
    await page.locator("#chatMessages").getByText("Compact chat test", { exact: false }).waitFor();
    await page.locator('[data-chat-bubble="0"]:not([hidden])').waitFor();
    assert.equal(await page.locator('[data-chat-bubble="0"]').textContent(), "Compact chat test");
    await page.locator("#chatDetails summary").click();
    await page.locator("#logDetails summary").click(); await page.locator("#gameLog").waitFor({ state: "visible" }); await page.locator("#logDetails summary").click();
    await page.locator("#bank").waitFor({ state: "visible" });
    await page.locator("#supplyDetails summary").click(); assert.equal(await page.locator("#bank").isVisible(), false);
    await page.locator("#supplyDetails summary").click(); await page.locator("#bank").waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "test-results/catan-playing-mobile.png", fullPage: true });
    await page.locator('[data-action="roll"]').click();
    await page.locator('[data-action="trade"]:not([disabled]),#board [data-tile]').first().waitFor();
    if (await page.locator("#board [data-tile]").count()) { await page.locator("#board [data-tile]").first().click(); await page.locator("#confirmBuild").click(); if (await page.locator("[data-victim]").count()) await page.locator("[data-victim]").first().click(); }
    await page.locator('[data-action="trade"]:not([disabled])').waitFor();
    await page.locator('[data-action="trade"]').click();
    await page.screenshot({ path: "test-results/catan-trade-mobile.png", fullPage: true });
    await page.locator('[data-trade-mode="players"]').click();
    assert.equal(await page.locator("#tradeTarget option").count(), 4);
    assert.equal(await page.locator('#tradeTarget option[value="0"]').count(), 0, "Cannot target yourself");
    assert.equal(await page.locator("#tradeTarget").inputValue(), "all");
    await page.screenshot({ path: "test-results/catan-player-trade-mobile.png", fullPage: true });
    await page.locator("#tradeTarget").selectOption("1");
    await page.screenshot({ path: "test-results/catan-targeted-trade-mobile.png", fullPage: true });
    for (const target of ["1", "all"]) {
      await page.locator("#tradeTarget").selectOption(target);
      const resource = catanState.game.players[catanState.you].resources.findIndex((n) => n > 0);
      assert.ok(resource >= 0);
      assert.equal(await page.locator("#tradeDraft .trade-card").count(), 0, "Every new live offer starts empty");
      await addCard("give", resource).click();
      await addCard("want", (resource + 1) % 5).click();
      const sent = catanSocket.waitForEvent("framesent", { predicate: ({ payload }) => JSON.parse(String(payload)).action?.type === "offerTrade" });
      await page.locator("#confirmTrade").click();
      assert.equal(JSON.parse(String((await sent).payload)).action.to, target === "all" ? null : Number(target));
      await page.locator('[data-action="trade"]:not([disabled])').waitFor();
      const settled = (g) => !g.trade || (g.trade.to == null ? g.trade.rejected.length === g.players.length - 1 : g.trade.rejected.includes(g.trade.to));
      if (!settled(catanState.game)) await catanSocket.waitForEvent("framereceived", { predicate: ({ payload }) => {
        const message = JSON.parse(String(payload)); return message.type === "state" && settled(message.game);
      } });
      if (catanState.game.trade) {
        await page.locator('[data-offer="cancelTrade"]').click();
        await page.locator('[data-action="trade"]:not([disabled])').waitFor();
      }
      await page.locator('[data-action="trade"]').click();
    }
    await page.locator('[data-close="tradeDialog"]').click();
    await page.locator("#helpButton").click(); await page.screenshot({ path: "test-results/catan-rules-mobile.png", fullPage: true });
    await page.locator('[data-close="helpDialog"]').click();
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: "test-results/catan-desktop.png", fullPage: true });
    await page.reload(); await page.locator("#game").waitFor({ state: "visible" });
    await page.locator("#autoButton").click();
    await page.locator("#victory").waitFor({ state: "visible", timeout: 60000 });
    await assertHandCards();
    assert.equal(await page.locator("#turnPrompt").textContent(), `${catanState.game.players[catanState.game.winner].name} 胜利${catanState.game.players[catanState.game.winner].name} wins`);
    await page.screenshot({ path: "test-results/catan-victory.png", fullPage: true });
    const winnerState = structuredClone(catanState);
    winnerState.game.current = 0; winnerState.game.winner = 1; winnerState.game.players[1].name = "Laura";
    winnerState.seats[1] = { ...winnerState.seats[1], name: "Laura", avatar: null, bot: false, connected: false };
    await deliverFeedback(winnerState);
    assert.equal(await page.locator("#turnPrompt").textContent(), "Laura 胜利Laura wins", "The prompt names the actual winner, even when the current actor differs");
    assert.equal(await page.locator("#turnAvatar .avatar-initial").textContent(), "L");
    assert.equal(await page.locator("#turnAvatar .seat-number").textContent(), "2");
    await assertPresence(page, '#players [data-player-id="0"] .presence-dot', true);
    await assertPresence(page, '#players [data-player-id="1"] .presence-dot', false);
    await assertPresence(page, '#turnAvatar .presence-dot', false);
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport); await page.locator(".turn-banner").scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/catan-winner-presence-${viewport.width}.png`, fullPage: true });
    }
    winnerState.seats[1].connected = true;
    await deliverFeedback(winnerState);
    await assertPresence(page, '#players [data-player-id="1"] .presence-dot', true);
    const speechBase = structuredClone(catanState);
    speechBase.game.players[1].name = "Alex"; speechBase.game.players[2].name = "Alex";
    speechBase.seats[1].name = "Alex"; speechBase.seats[2].name = "Alex";
    const speech = (id) => page.locator(`[data-chat-bubble="${id}"]`);
    const visibleSpeech = () => page.locator(".player-speech:not([hidden])").count();
    let speechState;
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      speechState = structuredClone(speechBase); speechState.code = `CB${viewport.width}`;
      speechState.chat = [{ id: "history", playerId: 0, name: speechState.seats[0].name, text: "Old chat", time: 1 }];
      await deliverFeedback(speechState);
      assert.equal(await visibleSpeech(), 0, "Entering a room does not replay its chat history");
      const height = (await page.locator("#players").boundingBox()).height;
      speechState.chat.push({ id: "same-name", playerId: 2, name: "Alex", text: "我有木头 / I have lumber", time: Date.now() });
      await deliverFeedback(speechState);
      assert.equal(await speech(2).isVisible(), true); assert.equal(await speech(1).isVisible(), false, "Use the seat ID when names are duplicated");
      const literal = '<img src=x onerror="alert(1)"> <b>Trade?</b>';
      speechState.chat.push(
        { id: "literal", playerId: 0, name: speechState.seats[0].name, text: literal, time: Date.now() },
        { id: "long", playerId: 1, name: "Alex", text: "我可以用羊毛换木头吗？CanWeTradeResources".repeat(8).slice(0, 160), time: Date.now() },
        { name: speechState.seats[3].name, text: "Hello from the old server", time: Date.now() }
      );
      await deliverFeedback(speechState);
      assert.equal(await visibleSpeech(), 4);
      assert.equal(await speech(0).textContent(), literal);
      assert.equal(await page.locator(".player-speech img, .player-speech b").count(), 0, "User chat is plain text, never executable markup");
      assert.equal((await page.locator("#players").boundingBox()).height, height, "Bubbles must not move player rows");
      await page.locator("#players").scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const bubbles = [...document.querySelectorAll(".player-speech:not([hidden])")];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          inOwnRow: bubbles.every((bubble) => {
            const b = bubble.getBoundingClientRect(), row = bubble.closest("tr"), r = row.getBoundingClientRect();
            const avatar = row.querySelector(".player-portrait").getBoundingClientRect();
            return b.top >= r.top && b.bottom <= r.bottom && b.left >= avatar.right && b.right <= r.right && b.width > 150;
          }),
          textFits: bubbles.every((b) => { const text = b.firstElementChild; return text.scrollWidth <= text.clientWidth; }),
          namesHidden: bubbles.every((b) => getComputedStyle(b.closest("tr").querySelector(".summary-person")).visibility === "hidden")
        };
      });
      assert.deepEqual(geometry, { overflow: false, inOwnRow: true, textFits: true, namesHidden: true });
      await page.screenshot({ path: `test-results/catan-chat-bubbles-${viewport.width}.png`, fullPage: true });
    }
    speechState.chat.push({ id: "replacement", playerId: 1, name: "Alex", text: "New message", time: Date.now() });
    await deliverFeedback(speechState);
    assert.equal(await speech(1).textContent(), "New message", "A new message replaces the same player's old bubble");
    assert.equal(await speech(2).textContent(), "我有木头 / I have lumber", "Other players keep their own bubbles");
    await page.evaluate((snapshot) => {
      window.testSpeechInterval = setInterval(() => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(snapshot) })), 150);
    }, speechState);
    await page.waitForFunction(() => !document.querySelector(".player-speech:not([hidden])"), null, { timeout: 7500 });
    await page.evaluate(() => { clearInterval(window.testSpeechInterval); delete window.testSpeechInterval; });
    assert.equal(await visibleSpeech(), 0, "Unchanged snapshots must not restart the bubble timer");
    assert.equal(await page.locator("#players .summary-person").evaluateAll((nodes) => nodes.every((n) => getComputedStyle(n).visibility === "visible")), true, "Player names return after the bubble expires");
    assert.match(await page.locator("#chatMessages").textContent(), /New message/, "Expired bubbles remain in the chat log");
    speechState.chat.push({ id: "repeated-text", playerId: 1, name: "Alex", text: "New message", time: Date.now() });
    await deliverFeedback(speechState);
    assert.equal(await speech(1).isVisible(), true, "A repeated message with a new ID should display again");
    await page.evaluate(() => window.testCatanSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "welcome", token: sessionStorage.getItem("catan-token") }) })));
    await deliverFeedback(speechState);
    assert.equal(await visibleSpeech(), 0, "Reconnecting must not replay chat bubbles");
    speechState.chat.push({ name: "Alex", text: "Ambiguous legacy sender", time: Date.now() });
    await deliverFeedback(speechState);
    assert.equal(await visibleSpeech(), 0, "Legacy messages must never guess between same-name players");

    const chatContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const chatHost = await chatContext.newPage(), chatGuest = await chatContext.newPage();
    for (const p of [chatHost, chatGuest]) p.on("pageerror", (e) => errors.push(e.message));
    await chatHost.goto(`http://127.0.0.1:${port}/catan.html`);
    await chatHost.getByText("已连接 / Connected", { exact: true }).waitFor();
    await chatHost.locator("#name").fill("Alex"); await chatHost.locator('[data-seats="3"]').click(); await chatHost.locator("#create").click();
    await chatHost.locator("#lobby").waitFor({ state: "visible" });
    const chatCode = await chatHost.locator("#copyCode").textContent();
    await assertPresence(chatHost, '#lobbySeats .lobby-seat:first-child .presence-dot', true);
    await chatGuest.goto(`http://127.0.0.1:${port}/catan.html`);
    await chatGuest.getByText("已连接 / Connected", { exact: true }).waitFor();
    await chatGuest.locator("#name").fill("Alex"); await chatGuest.locator("#code").fill(chatCode); await chatGuest.locator("#join").click();
    await chatGuest.locator("#lobby").waitFor({ state: "visible" });
    await chatHost.locator("#fillBots").click(); await chatHost.locator("#start:not([disabled])").click();
    for (const p of [chatHost, chatGuest]) {
      await p.locator("#game").waitFor({ state: "visible" }); await p.locator("#chatDetails summary").click();
    }
    await chatHost.locator("#chatInput").fill("谁有木头？ / Any lumber?"); await chatHost.locator("#chatForm button").click();
    for (const p of [chatHost, chatGuest]) {
      await p.locator('[data-chat-bubble="0"]:not([hidden])').waitFor();
      assert.equal(await p.locator('[data-chat-bubble="0"]').textContent(), "谁有木头？ / Any lumber?");
      assert.equal(await p.locator('[data-chat-bubble="1"]').isVisible(), false);
    }
    await chatGuest.locator("#chatInput").fill("我有 / I do."); await chatGuest.locator("#chatForm button").click();
    for (const p of [chatHost, chatGuest]) {
      await p.locator('[data-chat-bubble="1"]:not([hidden])').waitFor();
      assert.equal(await p.locator('[data-chat-bubble="1"]').textContent(), "我有 / I do.");
    }
    await chatGuest.locator("#players").scrollIntoViewIfNeeded();
    await chatGuest.screenshot({ path: "test-results/catan-chat-two-clients-390.png", fullPage: true });
    const guestToken = await chatGuest.evaluate(() => sessionStorage.getItem("catan-token"));
    await chatGuest.close();
    await chatHost.locator('#players [data-player-id="1"] .presence-dot[data-connected="false"]').waitFor();
    await assertPresence(chatHost, '#players [data-player-id="1"] .presence-dot', false);
    const returnedGuest = await chatContext.newPage();
    await returnedGuest.addInitScript((token) => sessionStorage.setItem("catan-token", token), guestToken);
    await returnedGuest.goto(`http://127.0.0.1:${port}/catan.html`);
    await returnedGuest.locator("#game").waitFor({ state: "visible" });
    await chatHost.locator('#players [data-player-id="1"] .presence-dot[data-connected="true"]').waitFor();
    await assertPresence(chatHost, '#players [data-player-id="1"] .presence-dot', true);
    await chatContext.close();

    const pokerContexts = [await browser.newContext({ viewport: { width: 390, height: 844 } }), await browser.newContext({ viewport: { width: 390, height: 844 } })];
    const pokerHost = await pokerContexts[0].newPage(), pokerGuest = await pokerContexts[1].newPage();
    for (const [i, p] of [pokerHost, pokerGuest].entries()) {
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(`http://127.0.0.1:${port}/index.html`); await p.locator(".poker-game").click();
      await p.locator('#onlineConnectionStatus[data-state="connected"]').waitFor();
      await p.locator("#onlineNameInput").fill(i ? "Guest" : "Host");
    }
    await pokerHost.locator('[data-online-count="8"]').click(); await pokerHost.locator("#createOnlineRoomBtn").click();
    await pokerHost.locator("#onlineLobby").waitFor({ state: "visible" });
    await assertPresence(pokerHost, '#onlineLobbyPlayers .lobby-player:first-child .presence-dot', true);
    const pokerCode = await pokerHost.locator("#onlineRoomCodeButton").textContent();
    await pokerGuest.locator("#onlineRoomCodeInput").fill(pokerCode); await pokerGuest.locator("#joinOnlineRoomBtn").click();
    await pokerGuest.locator("#onlineLobby").waitFor({ state: "visible" });
    await pokerHost.locator("#fillOnlineBotsBtn").click();
    await pokerHost.waitForFunction(() => document.querySelectorAll("#onlineLobbyPlayers .presence-dot").length === 8);
    await pokerHost.locator("#startOnlineGameBtn").click();
    await pokerHost.locator("#onlinePokerRoom").waitFor({ state: "visible" });
    await pokerGuest.locator("#onlinePokerRoom").waitFor({ state: "visible" });
    for (let id = 0; id < 8; id++) await assertPresence(pokerHost, `#onlinePlayersLayer [data-player-id="${id}"] .presence-dot`, true);
    const pokerClientId = await pokerGuest.evaluate(() => localStorage.getItem("holdem-online-client"));
    await pokerGuest.close();
    await pokerHost.locator('#onlinePlayersLayer [data-player-id="1"] .presence-dot[data-connected="false"]').waitFor();
    await assertPresence(pokerHost, '#onlinePlayersLayer [data-player-id="1"] .presence-dot', false);
    await pokerHost.waitForTimeout(1600);
    for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await pokerHost.setViewportSize(viewport);
      await pokerHost.waitForTimeout(100);
      assert.equal(await pokerHost.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await pokerHost.locator("#onlinePlayersLayer .seat-name").evaluateAll((nodes) => nodes.every((n) => {
        const name = n.getBoundingClientRect(), avatar = n.previousElementSibling.getBoundingClientRect(), parent = n.parentElement.getBoundingClientRect();
        return avatar.right <= name.left && name.right <= parent.right + 1;
      })), true, "Poker avatars must not overlap or push names outside their seat");
      assert.equal(await pokerHost.locator("#onlinePlayersLayer .mini-card").evaluateAll((cards) => cards.every((card) => {
        const bounds = card.getBoundingClientRect(), seat = card.closest(".player-seat").getBoundingClientRect();
        return bounds.height <= 34 && bounds.left >= seat.left && bounds.right <= seat.right && bounds.bottom <= seat.bottom;
      })), true, "Home-page decorative card styles must not resize poker hole cards");
      assert.equal(await pokerHost.evaluate(() => {
        const board = document.querySelector("#onlineCommunityCards").getBoundingClientRect();
        return [...document.querySelectorAll("#onlinePlayersLayer .player-seat")].every((seat) => {
          const box = seat.getBoundingClientRect();
          return box.right <= board.left || box.left >= board.right || box.bottom <= board.top || box.top >= board.bottom;
        });
      }), true, "Player seats must leave all five community cards unobstructed");
      assert.equal(await pokerHost.locator("#onlinePlayersLayer .player-seat").evaluateAll((seats) => {
        const boxes = seats.map((seat) => seat.getBoundingClientRect());
        return boxes.every((a, i) => boxes.slice(i + 1).every((b) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom));
      }), true, "Eight player seats must not overlap one another");
      await pokerHost.locator("#onlinePlayersLayer").scrollIntoViewIfNeeded();
      await pokerHost.screenshot({ path: `test-results/poker-presence-${viewport.width}.png`, fullPage: true });
    }
    const pokerRejoined = await pokerContexts[1].newPage();
    await pokerRejoined.addInitScript(({ id, code }) => {
      localStorage.setItem("holdem-online-client", id); sessionStorage.setItem("holdem-online-room", code);
    }, { id: pokerClientId, code: pokerCode });
    await pokerRejoined.goto(`http://127.0.0.1:${port}/index.html`); await pokerRejoined.locator(".poker-game").click();
    await pokerRejoined.locator("#onlinePokerRoom").waitFor({ state: "visible" });
    await pokerHost.locator('#onlinePlayersLayer [data-player-id="1"] .presence-dot[data-connected="true"]').waitFor();
    await assertPresence(pokerHost, '#onlinePlayersLayer [data-player-id="1"] .presence-dot', true);
    await pokerHost.evaluate(() => { setView("game"); startGame(); });
    await pokerHost.locator("#playersLayer .presence-dot").first().waitFor();
    assert.equal(await pokerHost.locator('#playersLayer .presence-dot[data-connected="false"]').count(), 0, "Local solo players remain online");
    await assertPresence(pokerHost, '#playersLayer .player-seat:first-child .presence-dot', true);
    for (const ctx of pokerContexts) await ctx.close();
    assert.deepEqual(errors, [], "Browser errors");
    console.log("PASS compact phone layouts, card-based trading and discarding, chat bubble identity/expiry/two-client delivery, draft resets, trade responses, signed card changes, reconnect and complete four-player match");
  } finally { await browser?.close(); server.kill(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
