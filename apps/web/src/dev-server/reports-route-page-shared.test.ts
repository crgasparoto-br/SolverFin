import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderReportViewNavigation } from "./reports-route-page-shared.js";

describe("reports view navigation", () => {
  it("keeps the active category view on the current URL so account filters are not discarded", () => {
    const html = renderReportViewNavigation("category-evolution", "profile-1");

    assert.match(html, /<a href="#" aria-current="page">Evolução por categoria<\/a>/);
    assert.match(
      html,
      /href="\/relatorios\?view=installments&profileId=profile-1">Parcelas consolidadas<\/a>/,
    );
  });

  it("keeps the active installments view on the current URL while preserving profile on view changes", () => {
    const html = renderReportViewNavigation("installments", "profile-1");

    assert.match(
      html,
      /href="\/relatorios\?view=category-evolution&profileId=profile-1">Evolução por categoria<\/a>/,
    );
    assert.match(html, /<a href="#" aria-current="page">Parcelas consolidadas<\/a>/);
  });
});
