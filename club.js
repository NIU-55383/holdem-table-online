"use strict";
fetch("/api/catan-preview").then((r) => r.json()).then((board) => {
  document.getElementById("clubIsland").innerHTML = window.CatanBoard.render(board, { preview: true });
}).catch(() => {
  document.getElementById("clubIsland").innerHTML = '<svg viewBox="0 0 48 48" class="club-fallback"><use href="catan-art.svg#settlement"/></svg>';
});
if (new URLSearchParams(location.search).get("game") === "poker") setView("online");
