import assert from "node:assert/strict";

import { enhanceInboxReviewQueueTargets } from "./inbox-review-queue-target-enhancement.js";

const base = `<!doctype html>
<html>
<head><style>.base { display: block; }</style></head>
<body>
<main data-ai-review-queue-enhanced="true"></main>
<dialog id="ai-review-dialog"><div id="ai-review-dialog-body"></div></dialog>
</body>
</html>`;

const enhanced = enhanceInboxReviewQueueTargets(base);
assert.match(enhanced, /data-ai-review-target-enhanced/);
assert.match(enhanced, /targetTransactionId/);
assert.match(enhanced, /\/api\/transactions\//);
assert.match(enhanced, /Lançamento alvo/);
assert.match(enhanced, /transaction\.description/);
assert.match(enhanced, /transaction\.amountMinor/);
assert.match(enhanced, /transaction\.occurredOn/);
assert.equal(enhanceInboxReviewQueueTargets(enhanced), enhanced);

const unrelated = "<html><body><main></main></body></html>";
assert.equal(enhanceInboxReviewQueueTargets(unrelated), unrelated);
