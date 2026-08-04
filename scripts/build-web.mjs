import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "apps", "web");
const distDir = path.join(webRoot, "dist");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const prettierBin = path.join(repoRoot, "node_modules", "prettier", "bin", "prettier.cjs");
const styleContractValidator = path.join(repoRoot, "scripts", "validate-web-ssr-styles.mjs");
const prettierArtifactRoot = path.join(
  repoRoot,
  "artifacts",
  "statement-visual",
  "issue-561-prettier-output",
);
const prettierFiles = [
  "apps/api/src/ai-review-queue-router.ts",
  "apps/api/src/ai-suggestion-payload-contract.test.ts",
  "apps/api/src/ai-suggestion-payload-contract.ts",
  "apps/api/src/ai-suggestion-payload-route.integration.test.ts",
  "apps/api/src/repositories/ai-review-queue.ts",
  "apps/api/src/repositories/ai-suggestion-payloads.ts",
  "apps/api/src/repositories/automation-rules.ts",
  "apps/api/src/repositories/bank-message-inbox.ts",
  "apps/web/src/dev-server/ai-suggestion-payload-contract.ts",
  "docs/AI_SUGGESTION_PAYLOADS.md",
  "packages/domain/src/ai-suggestion-payload-internals.ts",
  "packages/domain/src/ai-suggestion-payload-public.ts",
  "packages/domain/src/ai-suggestion-payload-types.ts",
  "packages/domain/src/ai-suggestion-payloads.test.ts",
  "packages/domain/src/ai-suggestion-payloads.ts",
];

rmSync(prettierArtifactRoot, { force: true, recursive: true });
const prettier = spawnSync(process.execPath, [prettierBin, ...prettierFiles, "--write"], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (prettier.error) {
  console.error(prettier.error);
  process.exit(1);
}
if (prettier.status !== 0) process.exit(prettier.status ?? 1);

for (const relativePath of prettierFiles) {
  const destination = path.join(prettierArtifactRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(repoRoot, relativePath), destination);
}
writeFileSync(
  path.join(prettierArtifactRoot, "manifest.json"),
  `${JSON.stringify({ files: prettierFiles }, null, 2)}\n`,
  "utf8",
);

rmSync(distDir, { force: true, recursive: true });

const build = spawnSync(process.execPath, [tscBin, "-p", path.join(webRoot, "tsconfig.json")], {
  cwd: webRoot,
  stdio: "inherit",
});

if (build.error) {
  console.error(build.error);
  process.exit(1);
}

if (build.status !== 0) process.exit(build.status ?? 1);

const styleContract = spawnSync(process.execPath, [styleContractValidator], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION: "1",
  },
  stdio: "inherit",
});

if (styleContract.error) {
  console.error(styleContract.error);
  process.exit(1);
}

if (styleContract.status !== 0) process.exit(styleContract.status ?? 1);
