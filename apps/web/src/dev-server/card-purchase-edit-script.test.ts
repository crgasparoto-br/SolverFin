import assert from "node:assert/strict";

import { recurrencesSectionScript } from "./recurrences-section.js";

const script = recurrencesSectionScript();

assert.match(script, /function setupCardPurchaseEditOverride\(\)/);
assert.match(
  script,
  /\/api\/credit-card-accounts\/" \+ purchase\.cardId \+ "\/purchases\/" \+ purchase\.id/,
);
assert.match(script, /isCardPurchaseEdit\(path, method\)/);
assert.match(script, /send\(path, "PATCH", payload\)/);
assert.match(script, /payload\.cardInstrumentId = cardInstrumentId/);
assert.match(script, /instrumentLabel\.hidden = false/);
