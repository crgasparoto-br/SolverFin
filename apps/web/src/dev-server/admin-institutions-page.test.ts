import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pageSource = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "admin-institutions-page.ts"),
  "utf8",
);

adminInstitutionsPageUsesBackendOnlyUpload();
adminInstitutionsPageKeepsLogoFallbackAndAccessiblePreview();
adminInstitutionsPageKeepsRefreshIdempotentAction();

function adminInstitutionsPageUsesBackendOnlyUpload(): void {
  assert.match(pageSource, /\/api\/admin\/institutions\/\$\{escapeHtml\(encodeURIComponent\(institution\.key\)\)\}\/logo/);
  assert.match(pageSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(pageSource, /JSON\.stringify\(\{ fileName: file\.name, mimeType: file\.type, contentBase64 \}\)/);
  assert.doesNotMatch(pageSource, /R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(pageSource, /R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(pageSource, /cloudflarestorage\.com/);
}

function adminInstitutionsPageKeepsLogoFallbackAndAccessiblePreview(): void {
  assert.match(pageSource, /alt="Logo \$\{escapeHtml\(institution\.label\)\}"/);
  assert.match(pageSource, /onerror="this\.hidden=true;this\.nextElementSibling\.hidden=false"/);
  assert.match(pageSource, /<span hidden>\$\{escapeHtml\(institution\.fallbackLabel\)\}<\/span>/);
  assert.match(pageSource, /return `<span>\$\{escapeHtml\(institution\.fallbackLabel\)\}<\/span>`/);
  assert.match(pageSource, /formatLogoStatus\(institution\.logoStatus\)/);
}

function adminInstitutionsPageKeepsRefreshIdempotentAction(): void {
  assert.match(pageSource, /data-admin-refresh/);
  assert.match(pageSource, /data-api-path="\/api\/admin\/institutions\/refresh"/);
  assert.match(pageSource, /Atualizando catálogo/);
  assert.match(pageSource, /Catálogo atualizado\./);
}
