import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import * as prettier from "prettier";

const paths = [
  "apps/api/src/ai-review-queue-router.ts",
  "apps/api/src/ai-suggestion-payload-contract.test.ts",
  "apps/api/src/ai-suggestion-payload-contract.ts",
  "apps/api/src/ai-suggestion-payload-remediation.integration.test.ts",
  "apps/api/src/ai-suggestion-payload-route.integration.test.ts",
  "apps/api/src/errors.test.ts",
  "apps/api/src/repositories/ai-review-queue.ts",
  "apps/api/src/repositories/ai-suggestion-payloads.ts",
  "apps/api/src/repositories/automation-rules.ts",
  "apps/api/src/repositories/bank-message-inbox.ts",
  "apps/web/src/dev-server/ai-suggestion-payload-contract.ts",
  "apps/web/src/dev-server/inbox-structured-payload-enhancement.ts",
  "docs/AI_SUGGESTION_PAYLOADS.md",
  "packages/domain/src/ai-suggestion-payload-internals.ts",
  "packages/domain/src/ai-suggestion-payload-public.ts",
  "packages/domain/src/ai-suggestion-payload-types.ts",
  "packages/domain/src/ai-suggestion-payloads.test.ts",
  "packages/domain/src/ai-suggestion-payloads.ts",
];

const formatted = {};
for (const path of paths) {
  const source = await readFile(path, "utf8");
  formatted[path] = await prettier.format(source, { filepath: path });
}

const payload = gzipSync(Buffer.from(JSON.stringify(formatted), "utf8")).toString("base64");
console.log("ISSUE561_FORMATTED_BEGIN");
for (let index = 0; index < payload.length; index += 8000) {
  console.log(payload.slice(index, index + 8000));
}
console.log("ISSUE561_FORMATTED_END");
throw new Error("Temporary issue #561 formatting diagnostic completed.");
