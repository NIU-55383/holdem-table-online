"use strict";
(() => {
  const A = window.AvatarData, storageKey = "boardclub-avatar";
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function getAvatar() {
    try { return A.normalize(JSON.parse(localStorage.getItem(storageKey) || "null")); } catch { return null; }
  }
  function presence(connected) {
    const online = connected === true, label = online ? "在线 / Online" : "离线 / Offline";
    return `<i class="presence-dot" data-connected="${online}" role="img" aria-label="${label}" title="${label}"></i>`;
  }
  function face(player) {
    let value; try { value = A.normalize(player?.avatar, true); } catch { value = null; }
    const initial = `<span class="avatar-initial">${escape(A.firstLetter(player?.name))}</span>`;
    const content = !value ? initial : value.kind === "photo" ? `${initial}<img class="avatar-photo" src="${value.value}" alt="">`
      : value.kind === "emoji" ? `<span class="avatar-emoji">${escape(value.value)}</span>`
        : `<svg viewBox="0 0 48 48" aria-hidden="true"><use href="catan-art.svg#${value.value}"/></svg>`;
    return `<span class="avatar-face" aria-hidden="true">${content}</span>`;
  }
  function avatar(player, connected, className = "seat-avatar", editable = false) {
    const social = player?.socialId ? `data-social-id="${escape(player.socialId)}"` : "";
    const interactive = !editable && social;
    return `<span class="${className} game-avatar presence-anchor" ${social} ${editable ? 'role="button" tabindex="0" data-edit-avatar aria-label="更换头像 / Change avatar"' : `${interactive ? 'role="button" tabindex="0" data-social-target' : 'role="img"'} aria-label="${escape(player?.name || "Player")}${interactive ? ' · 互动 / React' : ''}"`}>${face(player)}${presence(connected)}</span>`;
  }
  document.addEventListener("error", (event) => {
    if (event.target.matches?.("img.avatar-photo")) event.target.hidden = true;
  }, true);
  function mountAvatarPicker(container, nameInput) {
    container.classList.add("avatar-picker");
    container.innerHTML = '<button type="button" class="avatar-picker-trigger" data-edit-avatar aria-label="更换头像 / Change avatar"><span class="avatar-preview game-avatar"></span><small>头像 / Avatar</small></button>';
    const dialog = document.createElement("dialog");
    dialog.id = "avatarDialog"; dialog.className = "avatar-dialog"; dialog.setAttribute("aria-labelledby", "avatarTitle");
    dialog.innerHTML = `<div class="avatar-dialog-heading"><h2 id="avatarTitle">选择头像 <small>Choose avatar</small></h2><button type="button" data-avatar-close aria-label="取消 / Cancel">×</button></div>
      <div class="avatar-editor-preview game-avatar" aria-label="头像预览 / Avatar preview"></div>
      <div class="avatar-photo-actions"><button type="button" data-avatar-upload>上传照片 / Upload photo</button><button type="button" data-avatar-camera>拍照 / Camera</button></div>
      <input id="avatarUpload" type="file" accept="image/jpeg,image/png,image/webp" hidden><input id="avatarCamera" type="file" accept="image/*" capture="user" hidden>
      <label class="avatar-emoji-label" for="avatarEmoji">Emoji<input id="avatarEmoji" maxlength="64" autocomplete="off" spellcheck="false" placeholder="Emoji"></label>
      <button type="button" data-avatar-initial>用名字首字 / Use initial</button>
      <p class="avatar-error" id="avatarError" role="alert"></p>
      <div class="avatar-dialog-actions"><button type="button" data-avatar-close>取消 / Cancel</button><button type="button" id="avatarSave">保存 / Save</button></div>`;
    document.body.append(dialog);
    const find = (selector) => dialog.querySelector(selector), emoji = find("#avatarEmoji"), save = find("#avatarSave"), error = find("#avatarError");
    let draft = null, job = 0;
    const player = (value) => ({ name: nameInput.value, avatar: value });
    const refresh = () => { container.querySelector(".avatar-preview").innerHTML = face(player(getAvatar())); };
    const preview = () => { find(".avatar-editor-preview").innerHTML = face(player(draft)); };
    const close = () => { job++; dialog.close(); };
    function open() {
      job++; draft = getAvatar(); emoji.value = draft?.kind === "emoji" ? draft.value : "";
      error.textContent = ""; save.disabled = false; preview(); dialog.showModal();
    }
    document.addEventListener("click", (event) => { if (event.target.closest("[data-edit-avatar]")) open(); });
    document.addEventListener("keydown", (event) => {
      if (event.target.matches("[data-edit-avatar][role=button]") && ["Enter", " "].includes(event.key)) { event.preventDefault(); open(); }
    });
    dialog.querySelectorAll("[data-avatar-close]").forEach((button) => { button.onclick = close; });
    dialog.addEventListener("cancel", () => { job++; });
    find("[data-avatar-upload]").onclick = () => find("#avatarUpload").click();
    find("[data-avatar-camera]").onclick = () => find("#avatarCamera").click();
    find("[data-avatar-initial]").onclick = () => { job++; draft = null; emoji.value = ""; error.textContent = ""; save.disabled = false; preview(); };
    emoji.addEventListener("input", () => {
      job++;
      try { draft = emoji.value.trim() ? A.normalize({ kind: "emoji", value: emoji.value }) : null; error.textContent = ""; save.disabled = false; preview(); }
      catch (e) { error.textContent = e.message; save.disabled = true; }
    });
    async function photo(input) {
      const file = input.files[0]; if (!file) return;
      const currentJob = ++job; save.disabled = true; error.textContent = "处理中 / Processing";
      let bitmap;
      try {
        if (file.size > 10 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("请选择 10 MB 以内的 JPG、PNG 或 WebP 照片 / Choose a JPG, PNG or WebP under 10 MB");
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: 256, resizeQuality: "high" });
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d"), size = Math.min(bitmap.width, bitmap.height);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 128, 128);
        ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 128, 128);
        let value;
        for (const quality of [.82, .68, .52, .4]) { value = canvas.toDataURL("image/jpeg", quality); if (value.length <= A.MAX_PHOTO_LENGTH) break; }
        const processed = A.normalize({ kind: "photo", value });
        if (job !== currentJob || !dialog.open) return;
        draft = processed; emoji.value = ""; error.textContent = ""; save.disabled = false; preview();
      } catch (e) { if (job === currentJob) { error.textContent = e.message || "照片无法读取 / Unable to read photo"; save.disabled = false; } }
      finally { bitmap?.close(); input.value = ""; }
    }
    find("#avatarUpload").onchange = (event) => photo(event.target);
    find("#avatarCamera").onchange = (event) => photo(event.target);
    save.onclick = () => {
      if (save.disabled) return;
      try { localStorage.setItem(storageKey, JSON.stringify(A.normalize(draft))); }
      catch { error.textContent = "头像无法保存，请检查浏览器存储空间 / Unable to save avatar in browser storage"; return; }
      close(); refresh(); window.dispatchEvent(new CustomEvent("board-avatar-change", { detail: { avatar: getAvatar() } }));
    };
    nameInput.addEventListener("input", refresh);
    window.addEventListener("storage", (event) => { if (event.key === storageKey) refresh(); });
    refresh();
  }
  const socialContexts = [], effects = new Set();
  let reactionMenu = null, menuContext = null, menuTarget = "", returnFocus = null;
  function socialAnchor(id) {
    return [...document.querySelectorAll("[data-social-id]")].find((el) => el.dataset.socialId === id && el.getClientRects().length && !el.closest("[hidden]"));
  }
  function closeReactions(focus = false) {
    reactionMenu?.remove(); reactionMenu = null; menuContext = null;
    if (focus && returnFocus?.isConnected) returnFocus.focus();
  }
  function openReactions(anchor) {
    const id = anchor.dataset.socialId;
    const context = socialContexts.find((c) => c.view()?.players.some((p) => p?.socialId === id));
    const view = context?.view(), player = view?.players.find((p) => p?.socialId === id);
    if (!player || id === view.you || !view.connected) return;
    closeReactions(); menuContext = context; menuTarget = id; returnFocus = anchor;
    const room = view.code;
    reactionMenu = document.createElement("div"); reactionMenu.className = "reaction-menu";
    reactionMenu.setAttribute("role", "dialog"); reactionMenu.setAttribute("aria-label", "互动 / Reactions");
    reactionMenu.innerHTML = `<div class="reaction-heading"><strong>${escape(player.name)}</strong><button type="button" data-reaction-close aria-label="关闭 / Close">×</button></div><div class="reaction-options">${Object.entries(window.GameSocialData.reactions).map(([id, r]) => `<button type="button" data-reaction="${id}" title="${r.label}" aria-label="${r.label}"><span>${r.emoji}</span><small>${r.label}</small></button>`).join("")}</div>`;
    document.body.append(reactionMenu);
    const box = anchor.getBoundingClientRect(), menu = reactionMenu.getBoundingClientRect();
    reactionMenu.style.left = `${Math.max(8, Math.min(innerWidth - menu.width - 8, box.left))}px`;
    reactionMenu.style.top = `${Math.max(8, Math.min(innerHeight - menu.height - 8, box.bottom + 8))}px`;
    reactionMenu.onclick = (event) => {
      const button = event.target.closest("[data-reaction]");
      if (event.target.closest("[data-reaction-close]")) return closeReactions(true);
      if (!button) return;
      const current = context.view();
      if (current?.code === room && current.connected && current.players.some((p) => p?.socialId === id)) context.send({ type: "reaction", target: id, kind: button.dataset.reaction });
      closeReactions(true);
    };
    reactionMenu.querySelector("[data-reaction]").focus();
  }
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("[data-social-target]");
    if (anchor) openReactions(anchor);
    else if (!event.target.closest(".reaction-menu")) closeReactions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reactionMenu) { event.preventDefault(); closeReactions(true); }
    else if (["Enter", " "].includes(event.key) && event.target.matches("[data-social-target]")) { event.preventDefault(); openReactions(event.target); }
    else if (event.key === "Tab" && reactionMenu) {
      const buttons = [...reactionMenu.querySelectorAll("button")], index = buttons.indexOf(document.activeElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  window.addEventListener("resize", () => closeReactions());
  document.addEventListener("scroll", (event) => { if (!reactionMenu?.contains(event.target)) closeReactions(); }, true);
  function mountInteractions(view, send) {
    const context = { view, send }, seen = new Set(); socialContexts.push(context);
    return {
      sync() {
        if (menuContext === context && (!view()?.connected || !view()?.players.some((p) => p?.socialId === menuTarget))) closeReactions();
      },
      receive(event) {
        const current = view(), reaction = window.GameSocialData.reactions[event.kind];
        if (!reaction || !current || current.code !== event.room || seen.has(event.id) || !current.players.some((p) => p?.socialId === event.to) || !current.players.some((p) => p?.socialId === event.from)) return;
        seen.add(event.id); if (seen.size > 100) seen.delete(seen.values().next().value);
        if (effects.size >= 4) return;
        const effect = document.createElement("div"); effect.className = "avatar-reaction"; effect.dataset.reactionKind = event.kind;
        effect.setAttribute("role", "status"); effect.setAttribute("aria-label", `${event.fromName} → ${event.toName}: ${reaction.label}`);
        effect.innerHTML = `<span>${reaction.emoji}</span><small>${escape(event.fromName)} → ${escape(event.toName)}</small>`;
        document.body.append(effect); effects.add(effect);
        const start = performance.now(), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        function frame(now) {
          const elapsed = now - start, anchor = socialAnchor(event.to);
          if (elapsed > 2400 || view()?.code !== event.room) { effect.remove(); effects.delete(effect); return; }
          const box = anchor?.getBoundingClientRect();
          // Keep the receipt visible when a mobile layout puts the target off-screen.
          const visible = box && box.bottom > 0 && box.top < innerHeight;
          const x = visible ? box.left + box.width / 2 : innerWidth / 2, y = visible ? box.top : 60;
          effect.style.left = `${Math.max(8, Math.min(innerWidth - effect.offsetWidth - 8, x - effect.offsetWidth / 2))}px`;
          effect.style.top = `${Math.max(8, Math.min(innerHeight - effect.offsetHeight - 8, y - 50 - (reduced ? 0 : Math.min(elapsed / 90, 16))))}px`;
          effect.style.opacity = String(Math.min(1, (2400 - elapsed) / 450));
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      },
    };
  }
  window.BoardGameUI = Object.freeze({ presence, face, avatar, getAvatar, mountAvatarPicker, mountInteractions });
})();
