(function () {
  "use strict";
  let reader;
  const prepared = new WeakSet();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function bilingual(tag, pair) {
    const node = element(tag, pair[0]);
    const en = element("small", pair[1]); en.lang = "en"; node.append(en);
    return node;
  }
  function saveRules(body) {
    if (body.querySelector('[data-rule-section="saves"]')) return;
    const section = element("section"); section.dataset.ruleSection = "saves";
    section.append(bilingual("h3", ["保存与续局（小馆功能）", "Saving and resuming (club feature)"]));
    for (const pair of [
      ["房主在房间管理中选择保存并退出。先暂停并下载存档，再确认退出；所有玩家及机器人离开，进度、手牌、资产与座位顺序保留。未完成保存时可取消，原局继续。", "The host selects Save & leave in room management. Play pauses for the download; confirm afterwards to disconnect everyone. Progress, hands, assets and seat order are kept. Cancel to continue the original game."],
      ["下次在对应游戏页面导入文件，会生成新的房间码。每位玩家选择一个空位，继承该座位的进度，入座后不能再换座。第一位入座者为房主，可用机器人补齐空位；坐齐后由房主点击继续对局。", "Import the file on the same game's page to create a new room code. Each player claims one empty seat and its progress; seats cannot then be changed. The first player seated hosts and may fill empty seats with bots. The host resumes after every seat is filled."],
      ["存档保存在下载文件中，不是云存档。文件包含完整暗牌，勿交给不信任的人。聊天、头像、登录身份、托管设置及未完成的交易确认不保留。真心话、五子棋和象棋同设备局也可保存，导入后以在线房间续玩。", "The downloaded file is the save, not a cloud backup. It includes hidden cards; share it only with trusted people. Chat, avatars, login identities, auto-play settings and pending trade consent are not saved. Truth or Dare, Gomoku and Xiangqi pass-and-play saves resume as online rooms."]
    ]) section.append(bilingual("p", pair));
    body.append(section);
  }
  function prepare(dialog) {
    if (prepared.has(dialog)) return;
    const body = dialog.querySelector("[data-rules-body]");
    if (!body) return;
    prepared.add(dialog); dialog.classList.add("bg-rules-dialog"); body.classList.add("bg-rules-body");
    body.tabIndex = 0; body.setAttribute("role", "region"); body.setAttribute("aria-label", "规则正文 / Rules text");
    const title = dialog.querySelector("h2");
    if (title) { title.id ||= `${dialog.id}Title`; dialog.setAttribute("aria-labelledby", title.id); }
    dialog.addEventListener("close", () => { body.scrollTop = 0; });
    new MutationObserver(() => { if (dialog.open) saveRules(body); }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }
  function createReader() {
    const dialog = element("dialog"); dialog.id = "gameRulesDialog";
    const header = element("div", "", "dialog-heading"), title = element("h2"); title.id = "gameRulesTitle";
    const close = element("button", "", "icon-button"); close.type = "button";
    close.setAttribute("aria-label", "关闭 / Close"); close.title = "关闭 / Close";
    const icon = element("i"); icon.dataset.lucide = "x"; close.append(icon); close.onclick = () => dialog.close();
    const body = element("div"); body.dataset.rulesBody = "";
    header.append(title, close); dialog.append(header, body); document.body.append(dialog);
    prepare(dialog); window.lucide?.createIcons();
    return { dialog, title, body };
  }
  function open(game, sectionId) {
    const rules = window.BoardGameRuleData?.[game]; if (!rules) return false;
    reader ||= createReader();
    const { dialog, title, body } = reader;
    title.replaceChildren(...bilingual("span", rules.title).childNodes);
    const content = document.createDocumentFragment();
    for (const item of rules.sections) {
      const section = element("section"); section.dataset.ruleSection = item.id;
      section.append(bilingual("h3", item.title));
      for (const pair of item.paragraphs || []) section.append(bilingual("p", pair));
      if (item.items) {
        const list = element(game === "poker" && item.id === "rankings" ? "ol" : "ul");
        for (const pair of item.items) list.append(bilingual("li", pair));
        section.append(list);
      }
      content.append(section);
    }
    const sources = element("footer", "", "bg-rules-sources"); sources.append(bilingual("p", ["规则参考", "References"]));
    for (const [label, url] of rules.sources || []) {
      const a = element("a", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; sources.append(a);
    }
    content.append(sources); body.replaceChildren(content);
    saveRules(body);
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
    const section = [...body.querySelectorAll("[data-rule-section]")].find((s) => s.dataset.ruleSection === sectionId);
    if (section) body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top;
    return true;
  }
  document.querySelectorAll("[data-rules-dialog]").forEach(prepare);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rules-game]");
    if (button) open(button.dataset.rulesGame, button.dataset.rulesSection);
  });
  window.BoardGameRules = Object.freeze({ open, prepare });
})();
