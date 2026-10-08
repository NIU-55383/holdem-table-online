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
  function prepare(dialog) {
    if (prepared.has(dialog)) return;
    const body = dialog.querySelector("[data-rules-body]");
    if (!body) return;
    prepared.add(dialog); dialog.classList.add("bg-rules-dialog"); body.classList.add("bg-rules-body");
    body.tabIndex = 0; body.setAttribute("role", "region"); body.setAttribute("aria-label", "规则正文 / Rules text");
    const title = dialog.querySelector("h2");
    if (title) { title.id ||= `${dialog.id}Title`; dialog.setAttribute("aria-labelledby", title.id); }
    dialog.addEventListener("close", () => { body.scrollTop = 0; });
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
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
    const section = [...body.querySelectorAll("[data-rule-section]")].find((s) => s.dataset.ruleSection === sectionId);
    if (section) body.scrollTop = section.offsetTop - body.offsetTop;
    return true;
  }
  document.querySelectorAll("[data-rules-dialog]").forEach(prepare);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rules-game]");
    if (button) open(button.dataset.rulesGame, button.dataset.rulesSection);
  });
  window.BoardGameRules = Object.freeze({ open, prepare });
})();
