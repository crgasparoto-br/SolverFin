import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rankCardsForPurchase, validateDashboardPurchaseDate } from "./dashboard-overview.js";

const card = (
  id: string,
  closingDay: number,
  dueDay: number,
  status = "active",
  activeInstruments = "1",
) => ({ id, name: id, currency: "BRL", closingDay, dueDay, status, activeInstruments });

describe("dashboard recommended card", () => {
  it("ranks by actual payment delay using the canonical invoice period", () => {
    const ranked = rankCardsForPurchase([
      card("inter", 4, 10),
      card("porto", 13, 18),
      card("sem-parar", 8, 15),
    ], "2026-11-19");
    assert.deepEqual(ranked.map((item) => [item.name, item.daysUntilPayment]), [
      ["porto", 29], ["sem-parar", 26], ["inter", 21],
    ]);
    assert.equal(ranked[0]?.dueOn, "2026-12-18");
    assert.equal(ranked[0]?.closingOn, "2026-12-13");
    assert.equal(ranked[0]?.recommended, true);
    assert.equal(ranked[1]?.recommended, false);
  });

  it("keeps purchases made on closing day in the current cycle", () => {
    const dayOfClose = rankCardsForPurchase([card("close", 13, 18)], "2026-12-13");
    const dayAfter = rankCardsForPurchase([card("close", 13, 18)], "2026-12-14");
    assert.equal(dayOfClose[0]?.dueOn, "2026-12-18");
    assert.equal(dayOfClose[0]?.daysUntilPayment, 5);
    assert.equal(dayAfter[0]?.dueOn, "2027-01-18");
    assert.equal(dayAfter[0]?.daysUntilPayment, 35);
  });

  it("handles leap-year February and months with fewer than 31 days", () => {
    const leap = rankCardsForPurchase([card("feb", 31, 10)], "2028-02-29");
    assert.equal(leap[0]?.closingOn, "2028-02-29");
    assert.equal(leap[0]?.dueOn, "2028-03-10");
    assert.equal(leap[0]?.daysUntilPayment, 10);
  });

  it("excludes blocked, archived and instrument-less cards", () => {
    const ranked = rankCardsForPurchase([
      card("blocked", 1, 1, "blocked"),
      card("archived", 1, 1, "archived"),
      card("no-instrument", 1, 1, "active", "0"),
    ], "2026-11-19");
    assert.deepEqual(ranked, []);
  });

  it("identifies ties without inventing a unique winner", () => {
    const ranked = rankCardsForPurchase([
      card("zeta", 12, 19),
      card("alfa", 12, 19),
    ], "2026-11-19");
    assert.deepEqual(ranked.map((item) => item.name), ["alfa", "zeta"]);
    assert.ok(ranked.every((item) => item.recommended));
  });

  it("rejects invalid, historical and too-distant simulation dates", () => {
    assert.equal(validateDashboardPurchaseDate(null, "2026-11-19"), "2026-11-19");
    assert.equal(validateDashboardPurchaseDate("2026-11-20", "2026-11-19"), "2026-11-20");
    assert.equal(validateDashboardPurchaseDate("2026-02-30", "2026-01-01"), undefined);
    assert.equal(validateDashboardPurchaseDate("2026-11-18", "2026-11-19"), undefined);
    assert.equal(validateDashboardPurchaseDate("2028-11-19", "2026-11-19"), undefined);
    assert.equal(validateDashboardPurchaseDate("bad", "2026-11-19"), undefined);
  });
});
