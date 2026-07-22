import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareInboxDates,
  enhanceInboxListLayout,
  isInboxDateInRange,
  normalizeInboxDate,
} from "./inbox-list-layout-enhancement.js";

describe("Inbox list layout enhancement", () => {
  it("normalizes valid ISO and Brazilian dates", () => {
    assert.equal(normalizeInboxDate("2026-07-22"), "2026-07-22");
    assert.equal(normalizeInboxDate("22/07/2026"), "2026-07-22");
    assert.equal(normalizeInboxDate("31/02/2026"), undefined);
    assert.equal(normalizeInboxDate("sem data"), undefined);
  });

  it("filters dates using inclusive boundaries", () => {
    assert.equal(isInboxDateInRange("15/07/2026", "2026-07-15", "2026-07-20"), true);
    assert.equal(isInboxDateInRange("20/07/2026", "2026-07-15", "2026-07-20"), true);
    assert.equal(isInboxDateInRange("14/07/2026", "2026-07-15", "2026-07-20"), false);
    assert.equal(isInboxDateInRange("21/07/2026", "2026-07-15", "2026-07-20"), false);
  });

  it("sorts rows in both chronological directions and keeps missing dates last", () => {
    const dates = ["20/07/2026", "18/07/2026", "", "19/07/2026"];

    assert.deepEqual(
      [...dates].sort((left, right) => compareInboxDates(left, right, "date_desc")),
      ["20/07/2026", "19/07/2026", "18/07/2026", ""],
    );
    assert.deepEqual(
      [...dates].sort((left, right) => compareInboxDates(left, right, "date_asc")),
      ["18/07/2026", "19/07/2026", "20/07/2026", ""],
    );
  });

  it("injects compact list styles, date controls, icons and visible-only bulk selection", () => {
    const html = `<!doctype html><html><head></head><body>
      <div class="line-filter-bar"><label>Linhas<select id="import-line-filter"></select></label></div>
      <div id="import-batch-detail"></div>
    </body></html>`;
    const url = new URL(
      "https://solverfin.example/inbox?lineStart=2026-07-01&lineEnd=2026-07-22&lineSort=date_asc",
    );

    const enhanced = enhanceInboxListLayout(html, url);

    assert.match(enhanced, /id="inbox-list-layout-styles"/);
    assert.match(enhanced, /grid-template-columns: 26px minmax\(0, 1fr\)/);
    assert.match(enhanced, /id=\\?"inbox-date-start\\?"/);
    assert.match(enhanced, /id=\\?"inbox-date-end\\?"/);
    assert.match(enhanced, /id=\\?"inbox-date-sort\\?"/);
    assert.match(enhanced, /2026-07-01/);
    assert.match(enhanced, /2026-07-22/);
    assert.match(enhanced, /date_asc/);
    assert.match(enhanced, /visibleEligibleCheckboxes/);
    assert.match(enhanced, /stopImmediatePropagation/);
    assert.match(enhanced, /data-line-action='edit'/);
    assert.match(enhanced, /Nenhum lançamento no período selecionado/);
    assert.ok(enhanced.includes(html.split("<body>")[1]?.split("</body>")[0] ?? ""));
  });

  it("leaves unrelated pages untouched", () => {
    const html = "<!doctype html><html><head></head><body><main>Dashboard</main></body></html>";
    assert.equal(enhanceInboxListLayout(html, new URL("https://solverfin.example/dashboard")), html);
  });
});
