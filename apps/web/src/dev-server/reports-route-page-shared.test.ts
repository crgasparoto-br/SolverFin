import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderReportViewNavigation } from "./reports-route-page-shared.js";

describe("reports view navigation", () => {
  it("keeps active category navigation on the current URL", () => {
    const html = renderReportViewNavigation("category-evolution", "profile-1");

    assert.match(html, /<a href="#" aria-current="page">Evolução por categoria<\/a>/);
    assert.match(
      html,
      /href="\/relatorios\?view=installments&profileId=profile-1">Parcelas consolidadas<\/a>/,
    );
  });

  it("keeps active installment navigation on the current URL", () => {
    const html = renderReportViewNavigation("installments", "profile-1");

    assert.match(
      html,
      /href="\/relatorios\?view=category-evolution&profileId=profile-1">Evolução por categoria<\/a>/,
    );
    assert.match(html, /<a href="#" aria-current="page">Parcelas consolidadas<\/a>/);
  });
});
