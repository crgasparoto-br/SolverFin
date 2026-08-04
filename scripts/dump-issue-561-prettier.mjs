import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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

for (const path of paths) {
  let source = await readFile(path, "utf8");
  if (path === "apps/api/src/repositories/ai-review-queue.ts") {
    source = source
      .replace(
        "    });\n  }\n\n  const direction =",
        "    }) as TransactionExtractionSuggestionPayload;\n  }\n\n  const direction =",
      )
      .replace(
        "    },\n  });\n}\n\nfunction readCurrentTransactionPayload",
        "    },\n  }) as TransactionExtractionSuggestionPayload;\n}\n\nfunction readCurrentTransactionPayload",
      );
  }
  if (path === "packages/domain/src/ai-suggestion-payload-public.ts") {
    source = source.replace(/^import \{/, "import type {");
  }
  if (path === "packages/domain/src/ai-suggestion-payload-types.ts") {
    source = source.replace(
      /export interface DeduplicationSuggestionPayloadV1\s+extends DeterministicSuggestionPayloadV1Base<"deduplication"> \{\}\s+\s+export interface ReconciliationSuggestionPayloadV1\s+extends DeterministicSuggestionPayloadV1Base<"reconciliation"> \{\}/,
      'export type DeduplicationSuggestionPayloadV1 =\n  DeterministicSuggestionPayloadV1Base<"deduplication">;\n\nexport type ReconciliationSuggestionPayloadV1 =\n  DeterministicSuggestionPayloadV1Base<"reconciliation">;',
    );
  }
  const output = await prettier.format(source, { filepath: path });
  await writeFile(path, output, "utf8");
}

const patch = execFileSync(
  "git",
  ["diff", "--no-ext-diff", "--binary", "--", ...paths],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);
const payload = gzipSync(Buffer.from(patch, "utf8")).toString("base64");
console.log("ISSUE561_PATCH_BEGIN");
for (let index = 0; index < payload.length; index += 5000) {
  console.log(payload.slice(index, index + 5000));
}
console.log("ISSUE561_PATCH_END");
console.log(`Issue #561: ${paths.length} arquivos formatados e corrigidos no checkout.`);
