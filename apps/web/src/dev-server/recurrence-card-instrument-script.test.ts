import assert from "node:assert/strict";

import { recurrencesSectionScript, renderRecurrenceEditModal } from "./recurrences-section.js";

const modal = renderRecurrenceEditModal([], "card");
const script = recurrencesSectionScript();

assert.match(modal, /name="cardInstrumentId"/);
assert.match(modal, /name="editScope"/);
assert.match(script, /function syncRecurrenceCardInstrumentOptions\(\)/);
assert.match(script, /purchaseInstrumentSelect\.innerHTML/);
assert.match(script, /recurrenceInstrumentSelect\.innerHTML = purchaseInstrumentSelect\.innerHTML/);
assert.match(script, /editForm\.cardInstrumentId\.value = recurrence\.cardInstrumentId \|\| ""/);
assert.match(script, /payload\.cardInstrumentId = cardInstrumentId/);
