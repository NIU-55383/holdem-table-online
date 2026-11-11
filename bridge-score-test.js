"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { explain } = require("./bridge-score"), { Score } = require("./vendor/bridge-core");

test("score explanations match the authoritative engine for all contracts, seats, vulnerabilities and trick counts", () => {
  let checked = 0;
  for (const declarer of ["N", "E", "S", "W"]) for (const vulnerability of ["NvNv", "VNv", "NvV", "VV"])
    for (const strain of ["C", "D", "H", "S", "NT"]) for (let level = 1; level <= 7; level++)
      for (const doubling of [{}, { doubled: true }, { redoubled: true }]) for (let tricks = 0; tricks <= 13; tricks++) {
        const contract = { declarer, strain, level, ...doubling }, before = JSON.stringify(contract);
        const detail = explain(contract, vulnerability, tricks), result = Score.calculate(contract, vulnerability, tricks);
        assert.equal(detail.nsScore, result.score, `${before} ${vulnerability} ${tricks}`);
        assert.equal(detail.rows.reduce((sum, row) => sum + row.points, 0), Math.abs(result.score));
        assert(detail.rows.every((row) => row.zh && row.en && row.formula && row.points > 0));
        assert.equal(detail.difference, result.result); assert.equal(JSON.stringify(contract), before); checked++;
      }
  assert.equal(checked, 23520);
});
test("120 points shows 70 NT contract points plus 50 partscore; overtricks never turn a partscore into game", () => {
  const c = { declarer: "N", level: 2, strain: "NT" };
  const detail = explain(c, "NvNv", 8);
  assert.equal(detail.total, 120); assert.equal(detail.winner, 0);
  assert.deepEqual(detail.rows.map((r) => [r.id, r.points]), [["contract", 70], ["bonus", 50]]);
  assert.equal(detail.rows[0].formula, "40 + 1 × 30");
  const over = explain(c, "VV", 9);
  assert.equal(over.total, 150); assert.equal(over.rows.find((r) => r.id === "bonus").points, 50);
  assert.equal(over.rows.find((r) => r.id === "overtricks").points, 30);
});
test("doubled game, slam and redoubled penalties have separate explanations and correct beneficiaries", () => {
  const game = explain({ declarer: "E", level: 2, strain: "H", doubled: true }, "NvV", 9);
  assert.equal(game.winner, 1); assert.equal(game.total, 870);
  assert.deepEqual(game.rows.map((r) => r.points), [120, 500, 50, 200]);
  const slam = explain({ declarer: "N", level: 7, strain: "NT" }, "VV", 13);
  assert.equal(slam.total, 2220); assert.equal(slam.rows.find((r) => r.id === "slam").points, 1500);
  const down = explain({ declarer: "E", level: 4, strain: "S", redoubled: true }, "NvNv", 6);
  assert.equal(down.winner, 0); assert.equal(down.nsScore, 1600);
  assert.deepEqual(down.rows.map((r) => r.points), [200, 800, 600]);
  assert(!down.rows.some((r) => ["contract", "bonus", "double-bonus"].includes(r.id)));
});
test("passed-out boards and unavailable records do not invent a breakdown", () => {
  assert.deepEqual(explain("Passout", "VV", 0), { passedOut: true, rows: [], total: 0, nsScore: 0, winner: null });
  assert.equal(explain(null, "VV", 0), null);
  const c = { declarer: "N", level: 1, strain: "NT" };
  assert.equal(explain(c, "unknown", 7), null); assert.equal(explain(c, "VV", undefined), null);
  assert.equal(explain({ ...c, doubled: true, redoubled: true }, "VV", 7), null);
});
