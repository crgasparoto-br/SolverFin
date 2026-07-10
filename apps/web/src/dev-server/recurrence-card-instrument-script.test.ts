import assert from "node:assert/strict";

import { recurrencesSectionScript, renderRecurrenceEditModal } from "./recurrences-section.js";

const modal = renderRecurrenceEditModal([], "card");
const script = recurrencesSectionScript();

assert.match(modal, /name="cardInstrumentId"/);
assert.match(modal, /name="editScope"/);
assert.match(modal, /data-recurrence-edit-form hidden/);
assert.doesNotMatch(script, /function syncRecurrenceCardInstrumentOptions\(\)/);
assert.doesNotMatch(script, /data-recurrence-edit/);
assert.doesNotMatch(
  script,
  /editForm\.cardInstrumentId\.value = recurrence\.cardInstrumentId \|\| ""/,
);
assert.match(script, /setupCardPurchaseFormOverride/);
assert.match(script, /form\.dataset\.recurrenceId/);
assert.match(script, /requestPayload\.editScope = "current_and_future"/);
assert.match(script, /requestPayload\.cardInstrumentId = cardInstrumentId/);
assert.doesNotMatch(script, /editScope: "recurrence_and_future_pending"/);
