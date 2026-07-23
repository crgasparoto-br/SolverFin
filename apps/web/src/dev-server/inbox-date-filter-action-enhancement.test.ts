import assert from "node:assert/strict";
import test from "node:test";

import { enhanceInboxDateFilterAction } from "./inbox-date-filter-action-enhancement.js";

const page = `<!doctype html>
<html lang="pt-BR">
  <head><title>Inbox - SolverFin</title></head>
  <body>
    <div class="line-filter-bar inbox-list-toolbar"></div>
    <script id="inbox-list-layout-script"></script>
  </body>
</html>`;

test("injeta botão explícito para aplicar o filtro de datas", () => {
  const enhanced = enhanceInboxDateFilterAction(page);

  assert.match(enhanced, /data-inbox-date-filter-action="explicit"/);
  assert.match(enhanced, /apply-inbox-date-filters/);
  assert.match(enhanced, /Aplicar filtro/);
  assert.match(enhanced, /Aplicar filtro de datas/);
  assert.match(enhanced, /clearButton\.before\(applyButton\)/);
  assert.match(enhanced, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(enhanced, /event\.key !== "Enter"/);
});

test("mantém ocultas as linhas removidas pelo filtro no layout tabular", () => {
  const enhanced = enhanceInboxDateFilterAction(page);

  assert.match(
    enhanced,
    /\.inbox-page \.import-row\[hidden\] \{[\s\S]*?display: none !important;/,
  );
  assert.doesNotMatch(enhanced, /function applyDateFilter/);
});

test("não duplica o botão e não altera páginas sem o aprimoramento da lista", () => {
  const enhanced = enhanceInboxDateFilterAction(page);
  assert.equal(enhanceInboxDateFilterAction(enhanced), enhanced);
  assert.equal(
    enhanceInboxDateFilterAction(
      "<!doctype html><html><head></head><body><main>Dashboard</main></body></html>",
    ),
    "<!doctype html><html><head></head><body><main>Dashboard</main></body></html>",
  );
});
