import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { financialTodayInSaoPaulo } from "./financial-calendar.js";

describe("Brazil civil-day calendar", () => {
  it("uses Sao Paulo's date, not the server's UTC date, around midnight", () => {
    assert.equal(financialTodayInSaoPaulo(new Date("2026-10-18T01:20:00.000Z")), "2026-10-17");
    assert.equal(financialTodayInSaoPaulo(new Date("2026-11-01T03:10:00.000Z")), "2026-11-01");
  });
});
