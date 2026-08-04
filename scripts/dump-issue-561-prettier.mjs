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

const formatted = {};
for (const path of paths) {
  let source = await readFile(path, "utf8");
  if (path === "apps/api/src/repositories/ai-review-queue.ts") {
    source = source.replace(
      "): TransactionExtractionSuggestionPayload {\n  const current =",
      "): ReturnType<typeof buildAiSuggestionPayload> {\n  const current =",
    );
  }
  const output = await prettier.format(source, { filepath: path });
  formatted[path] = output;
  await writeFile(path, output, "utf8");
}

const archive = gzipSync(Buffer.from(JSON.stringify(formatted), "utf8"));
await uploadLegacyArtifact(archive);
console.log(`Issue #561: ${paths.length} arquivos formatados no checkout de validacao.`);

async function uploadLegacyArtifact(content) {
  const runtimeUrl = process.env.ACTIONS_RUNTIME_URL;
  const runtimeToken = process.env.ACTIONS_RUNTIME_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  if (!runtimeUrl || !runtimeToken || !runId) {
    console.log("Artifact runtime indisponivel; validacao local do checkout continua.");
    return;
  }

  const artifactName = `issue-561-formatted-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`;
  const headers = {
    authorization: `Bearer ${runtimeToken}`,
    "content-type": "application/json",
  };
  const createUrl = new URL(
    `_apis/pipelines/workflows/${runId}/artifacts?api-version=6.0-preview`,
    runtimeUrl,
  );
  const created = await fetch(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ Type: "actions_storage", Name: artifactName }),
  });
  if (!created.ok) {
    console.log(`Artifact create indisponivel: ${created.status} ${await created.text()}`);
    return;
  }

  const metadata = await created.json();
  const containerUrl = metadata.fileContainerResourceUrl;
  if (typeof containerUrl !== "string") {
    console.log("Artifact create nao retornou fileContainerResourceUrl.");
    return;
  }

  const uploadUrl = new URL(containerUrl);
  uploadUrl.searchParams.set("itemPath", `${artifactName}/formatted.json.gz`);
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: content,
  });
  if (!uploaded.ok) {
    console.log(`Artifact upload indisponivel: ${uploaded.status} ${await uploaded.text()}`);
    return;
  }

  const finalizeUrl = new URL(
    `_apis/pipelines/workflows/${runId}/artifacts?artifactName=${encodeURIComponent(artifactName)}&api-version=6.0-preview`,
    runtimeUrl,
  );
  const finalized = await fetch(finalizeUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ Size: content.length }),
  });
  console.log(`Artifact finalize: ${finalized.status}`);
}
