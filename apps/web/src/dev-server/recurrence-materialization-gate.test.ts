import assert from "node:assert/strict";

import {
  renderRecurrenceMaterializationGate,
  requiresRecurrenceMaterialization,
} from "./recurrence-materialization.js";

const initial = new URL(
  "https://app.example.invalid/lancamentos?accountId=account-1&month=2026-12",
);
assert.equal(requiresRecurrenceMaterialization(initial), true);

const html = renderRecurrenceMaterializationGate("account", initial);
assert.match(html, /Atualizando lançamentos recorrentes/);
assert.match(html, /method: "POST"/);
assert.match(html, /credentials: "same-origin"/);
assert.match(
  html,
  /\/api\/recurrence-materialization\?surface=account&amp;|\/api\/recurrence-materialization\?surface=account/,
);
assert.match(html, /materialized=1/);
assert.doesNotMatch(html, /Authorization|Bearer/);

const completed = new URL(
  "https://app.example.invalid/lancamentos?accountId=account-1&month=2026-12&materialized=1",
);
assert.equal(requiresRecurrenceMaterialization(completed), false);
