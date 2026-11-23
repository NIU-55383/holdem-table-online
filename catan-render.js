/* Catan keeps rendered DOM nodes so SVG sprites and icons do not reload on every action. */
(function () {
  "use strict";
  const SVG = "http://www.w3.org/2000/svg";

  function iconName(name) {
    return name.replace(/(\w)(\w*)(_|-|\s*)/g, (_, first, rest) => first.toUpperCase() + rest.toLowerCase());
  }
  function classes(value) {
    return (Array.isArray(value) ? value : typeof value === "string" ? value.split(/\s+/) : []).filter(Boolean);
  }
  function expandIcons(root, options = {}) {
    const library = window.lucide;
    if (!library?.createElement || !library.icons) return;
    const nameAttr = options.nameAttr || "data-lucide", icons = options.icons || library.icons, attrs = options.attrs || {};
    const names = nameAttr === "data-lucide" ? [nameAttr, "icon-name"] : [nameAttr];
    for (const attr of names) {
      const nodes = [...(root.querySelectorAll?.(`[${attr}]`) || [])];
      if (root.nodeType === 1 && root.hasAttribute(attr)) nodes.unshift(root);
      for (const node of nodes) {
        // Lucide keeps data-lucide on its output. Its bundled createIcons replaces that SVG again.
        if (node.namespaceURI === SVG && node.localName === "svg") continue;
        const name = node.getAttribute(attr), definition = icons[iconName(name)];
        if (!definition) continue;
        const original = Object.fromEntries([...node.attributes].map(a => [a.name, a.value]));
        const attributes = { ...definition[1], "data-lucide": name, ...attrs, ...original };
        attributes.class = [...new Set(["lucide", `lucide-${name}`, ...classes(original.class), ...classes(attrs.class)])].join(" ");
        const svg = library.createElement([definition[0], attributes, definition[2]]);
        node.replaceWith(svg);
      }
    }
  }
  if (window.lucide) {
    window.lucide.createIcons = function (options = {}) {
      expandIcons(options.root || document, options);
    };
  }

  function key(node) {
    if (node.nodeType !== 1) return null;
    if (node.hasAttribute("data-render-key")) return `key:${node.getAttribute("data-render-key")}`;
    return node.id ? `id:${node.id}` : null;
  }
  function compatible(a, b) {
    return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.namespaceURI === b.namespaceURI && a.localName === b.localName);
  }
  function attributes(current, wanted) {
    const valueChanged = current.getAttribute("value") !== wanted.getAttribute("value");
    const checkedChanged = current.hasAttribute("checked") !== wanted.hasAttribute("checked");
    for (const attr of [...current.attributes]) {
      if (!wanted.hasAttributeNS(attr.namespaceURI, attr.localName)) current.removeAttributeNS(attr.namespaceURI, attr.localName);
    }
    for (const attr of wanted.attributes) {
      if (current.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value) current.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
    }
    // Keep in-progress input untouched when its rendered value is unchanged.
    if (current.localName === "input") {
      if (valueChanged && wanted.hasAttribute("value")) current.value = wanted.getAttribute("value");
      if (checkedChanged) current.checked = wanted.hasAttribute("checked");
    }
  }
  function patch(current, wanted) {
    if (current.nodeType === 1) {
      attributes(current, wanted);
      children(current, wanted);
    } else if (current.nodeValue !== wanted.nodeValue) current.nodeValue = wanted.nodeValue;
  }
  function children(parent, wantedParent) {
    const old = [...parent.childNodes], remaining = new Set(old), keyed = new Map(), unkeyed = new Map();
    const type = node => `${node.nodeType}:${node.namespaceURI || ""}:${node.localName || ""}`;
    for (const node of old) {
      const id = key(node);
      if (id !== null) { if (!keyed.has(id)) keyed.set(id, node); }
      else {
        const name = type(node);
        if (!unkeyed.has(name)) unkeyed.set(name, { nodes: [], index: 0 });
        unkeyed.get(name).nodes.push(node);
      }
    }
    const plan = [];
    for (const wanted of [...wantedParent.childNodes]) {
      const id = key(wanted);
      const pool = id === null ? unkeyed.get(type(wanted)) : null;
      let current = id === null ? pool?.nodes[pool.index++] : keyed.get(id);
      if (!current || !remaining.has(current) || !compatible(current, wanted)) current = null;
      if (current) remaining.delete(current);
      plan.push({ current, wanted });
    }
    // Remove obsolete siblings first. Otherwise deleting the first card would move every
    // retained card before it and unnecessarily detach all of their SVG/use descendants.
    for (const node of remaining) node.remove();
    let cursor = parent.firstChild;
    for (let { current, wanted } of plan) {
      if (current) {
        if (current !== cursor) parent.insertBefore(current, cursor);
        patch(current, wanted);
      } else {
        current = wanted;
        parent.insertBefore(current, cursor);
      }
      cursor = current.nextSibling;
    }
  }

  function removeScripts(root) {
    root.querySelectorAll("script").forEach(script => script.remove());
    root.querySelectorAll("template").forEach(template => removeScripts(template.content));
  }
  function html(element, markup) {
    if (!element || element.nodeType !== 1) throw new TypeError("CatanRender.html requires an element");
    const doc = element.ownerDocument;
    let source;
    if (element.namespaceURI === SVG && element.localName !== "foreignObject") {
      source = doc.createElementNS(SVG, "svg");
      source.innerHTML = String(markup ?? "");
    } else {
      const template = doc.createElement("template");
      template.innerHTML = String(markup ?? "");
      source = template.content;
    }
    removeScripts(source);
    // Expand off-DOM before reconciling, so an old SVG is compared with a new SVG, not an <i>.
    expandIcons(source);
    children(element, source);
    return element;
  }
  window.CatanRender = { html };
})();
