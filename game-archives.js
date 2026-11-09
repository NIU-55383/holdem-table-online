"use strict";
(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const names = { catan: "卡坦岛 / Catan", bridge: "桥牌 / Bridge", gomoku: "五子棋 / Gomoku", xiangqi: "中国象棋 / Xiangqi", truth: "真心话与大冒险 / Truth or Dare", million: "百万美金 / Millions of Dollars", poker: "德州扑克 / Hold'em" };
  function mount({ game, send, view, name, anchor, beforeImport, local }) {
    const dialog = document.createElement("dialog"), input = document.createElement("input"), button = document.createElement("button");
    dialog.className = "room-control-dialog archive-dialog";
    dialog.setAttribute("aria-label", "游戏存档 / Game saves");
    input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
    button.type = "button"; button.className = "archive-import";
    button.innerHTML = '<i data-lucide="folder-open"></i>导入存档 / Load save';
    anchor.append(button, input); document.body.append(dialog);
    let ticket = null, lobby = null, mode = "", ownerKey = "", downloaded = false, leaveAfterSave = true;
    const key = c => `${c?.code}:${c?.host}:${c?.you}`;
    function show(title, body, actions) {
      dialog.innerHTML = `<header><h2>${title}</h2><button type="button" data-archive="cancel" aria-label="关闭 / Close">×</button></header><div class="archive-body">${body}<p data-archive-error role="alert"></p></div><footer>${actions}</footer>`;
      if (!dialog.open) dialog.showModal();
      window.lucide?.createIcons();
      dialog.querySelector('footer [data-archive="cancel"]')?.focus();
    }
    function close() { dialog.close(); mode = ""; ticket = null; lobby = null; }
    function cancel() {
      if (ticket && ticket !== "local") send({ type: "archiveCancel", ticket });
      if (lobby) send({ type: "archiveCancelJoin" });
      close();
    }
    function requestSave(leave = true) {
      const c = view(); if (!c?.started || c.host !== c.you || c.archive?.saving) return;
      ownerKey = key(c); mode = "confirm"; leaveAfterSave = leave;
      if (!leave) {
        show("保存 / Save", "<p>下载当前进度，所有人继续留在本局。<small>Download the current position and keep playing with everyone in this room.</small></p><p>存档包含暗牌，请交给可信任的朋友。<small>The file contains hidden cards. Share it only with trusted friends.</small></p>", '<button data-archive="cancel">取消 / Cancel</button><button data-archive="prepare"><i data-lucide="download"></i>下载存档 / Download save</button>');
        return;
      }
      show("保存并退出 / Save & leave", `<p>保留当前进度和各座位的手牌、资产。文件下载后再确认退出，所有玩家和机器人都将离开。<small>Keep progress, hands and assets. After downloading, confirm to remove all players and bots.</small></p>${c.seats ? `<p>本次退出 / Leaving: ${c.seats.filter(s => s && !s.vacant).map(s => esc(s.name)).join("、")}</p>` : ""}<p>存档包含暗牌，请交给可信任的朋友。<small>The file contains hidden cards. Share it only with trusted friends.</small></p>`, '<button data-archive="cancel">取消 / Cancel</button><button data-archive="prepare"><i data-lucide="download"></i>下载存档 / Download save</button>');
    }
    function download(archive) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `boardclub-${archive.game}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); downloaded = true;
    }
    function ready(data) {
      ticket = data.ticket; downloaded = false;
      try { download(data.archive); } catch (error) { if (ticket !== "local") send({ type: "archiveCancel", ticket }); close(); return; }
      mode = "downloaded";
      show("确认文件已下载 / Check your download", "<p>确认下载列表里已有存档，再结束本次连接。<small>Check that the save is in your downloads before ending this session.</small></p><p>确定后，所有人退出，原房间关闭。下次导入文件会创建新房间码。<small>Everyone leaves and this room closes. Importing creates a new room code.</small></p>", '<button data-archive="cancel">继续本局 / Keep playing</button><button data-archive="commit"><i data-lucide="save"></i>已拿到文件，保存退出 / File received, save & leave</button>');
    }
    function exported(archive) {
      try {
        download(archive); mode = "saved";
        show("存档已生成 / Save created", "<p>存档已发起下载，本局继续。<small>The download has started. Your game continues.</small></p>", '<button data-archive="cancel">继续 / Continue</button>');
      } catch { mode = "error"; show("下载失败 / Download failed", "<p>请重试。本局没有退出。<small>Please retry. Your game is still open.</small></p>", '<button data-archive="cancel">关闭 / Close</button>'); }
    }
    function drawLobby() {
      mode = "lobby";
      const sides = lobby.game === "bridge" ? ["北 / North", "东 / East", "南 / South", "西 / West"] : lobby.game === "xiangqi" ? ["红方 / Red", "黑方 / Black"] : lobby.game === "gomoku" ? ["黑棋 / Black", "白棋 / White"] : null;
      show("选择座位 / Choose a seat", `<p>${esc(names[lobby.game])}</p><p class="archive-code">房间 / Room <strong>${esc(lobby.code)}</strong><button data-archive="copy" title="复制房间码 / Copy room code"><i data-lucide="copy"></i></button></p><p>入座后继承该位置的牌和资产，不能再换座。第一位入座者为房主；坐齐后由房主继续。<small>Your seat keeps its cards and assets and cannot be changed. The first seated player hosts; the host resumes after all seats are filled.</small></p><div class="archive-seats">${lobby.seats.map(s => `<button data-archive-seat="${s.index}" ${s.vacant ? "" : "disabled"}><strong>${s.position + 1}. ${esc(sides?.[s.index] || "座位 / Seat")}</strong><span>${esc(s.vacant ? "入座 / Take seat" : s.name)}</span></button>`).join("")}</div>`, '<button data-archive="cancel">暂不入座 / Not now</button>');
    }
    button.onclick = () => {
      if (!name()?.trim()) { mode = "error"; show("导入存档 / Load save", "<p>请先填写你的名字。<small>Enter your name first.</small></p>", '<button data-archive="cancel">关闭 / Close</button>'); return; }
      input.value = ""; input.click();
    };
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      mode = "import";
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error("文件过大，最大 2 MB / File too large; maximum 2 MB");
        const archive = JSON.parse(await file.text());
        const expected = typeof game === "function" ? game() : game;
        if (archive.format !== "boardclub-save" || archive.version !== 1 || archive.game !== expected) throw new Error(`请在对应游戏页面导入有效存档 / Open a valid save on its game page: ${names[archive.game] || "Unknown"}`);
        show("导入存档 / Load save", "<p>正在检查存档…<small>Checking the save…</small></p>", '<button data-archive="cancel">取消 / Cancel</button>');
        if (beforeImport) await beforeImport();
        if (!send({ type: "archiveImport", archive, name: name().trim(), avatar: BoardGameUI.getAvatar() })) throw new Error("请等待连接后重试 / Wait for the connection, then retry");
      } catch (error) {
        mode = "error"; show("导入失败 / Could not load", `<p>${esc(error.message)}</p>`, '<button data-archive="cancel">关闭 / Close</button>');
      }
    };
    dialog.addEventListener("cancel", e => { e.preventDefault(); cancel(); });
    dialog.addEventListener("click", async e => {
      const seat = e.target.closest("[data-archive-seat]");
      if (seat && lobby) { if (send({ type: "archiveClaim", seat: Number(seat.dataset.archiveSeat) })) seat.disabled = true; return; }
      const action = e.target.closest("[data-archive]")?.dataset.archive;
      if (action === "cancel") cancel();
      if (action === "prepare") {
        if (ownerKey !== key(view())) { close(); return; }
        if (!leaveAfterSave) {
          if (local?.active()) { exported(local.snapshot()); return; }
          mode = "exporting";
          if (send({ type: "archiveExport" })) e.target.closest("button").disabled = true;
          else { mode = "confirm"; dialog.querySelector("[data-archive-error]").textContent = "连接尚未恢复，请稍后重试 / Not connected. Reconnect and try again."; }
          return;
        }
        if (local?.active()) { ready({ ticket: "local", archive: local.snapshot() }); return; }
        mode = "preparing"; if (send({ type: "archivePrepare" })) e.target.closest("button").disabled = true;
      }
      if (action === "commit" && ticket && downloaded && ownerKey === key(view())) {
        if (ticket === "local") { local.finish(); close(); } else send({ type: "archiveCommit", ticket });
      }
      if (action === "copy" && lobby) { try { await navigator.clipboard.writeText(lobby.code); } catch {} }
    });
    window.addEventListener("board-archive-save", event => requestSave(event.detail?.leave !== false));
    window.lucide?.createIcons();
    return { saveLocal: requestSave, receive(data) {
      if (data.type === "archiveExported") {
        if (mode === "exporting" && ownerKey === key(view())) exported(data.archive);
        return true;
      }
      if (data.type === "archiveReady") {
        if (mode !== "preparing") { send({ type: "archiveCancel", ticket: data.ticket }); return true; }
        ready(data); return true;
      }
      if (data.type === "archiveLobby") { lobby = data; drawLobby(); return true; }
      if (data.type === "archiveClosed") { close(); return true; }
      if (data.type === "error" && dialog.open) {
        dialog.querySelector("[data-archive-error]").textContent = data.message;
        dialog.querySelectorAll("[data-archive-seat]").forEach(b => { b.disabled = !lobby?.seats.find(s => s.index === Number(b.dataset.archiveSeat))?.vacant; });
        const prepare = dialog.querySelector('[data-archive="prepare"]'); if (prepare) prepare.disabled = false;
      }
      if (data.type === "state") {
        const c = (data.room || data).control;
        if (lobby || (ownerKey && key(c) !== ownerKey) || (ticket && !c?.archive?.saving)) close();
      }
      if (data.type === "left") close();
      return false;
    } };
  }
  window.BoardGameArchives = Object.freeze({ mount });
})();
