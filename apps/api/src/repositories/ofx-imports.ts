import type { EntityId, ImportPreview, TenantContext } from "@solverfin/domain";

import { query, type QueryExecutor } from "../db.js";
import { ImportReviewError, type CreateImportBatchResult } from "./imports.js";
import { parseOfxImportPreview } from "./ofx-import-parser.js";
import { persistOfxImportBatchForContext } from "./ofx-import-store.js";
import type { OfxAccountRow, OfxImportPayload } from "./ofx-import-types.js";

export type { OfxImportPayload } from "./ofx-import-types.js";
export { parseOfxImportPreview } from "./ofx-import-parser.js";

export async function previewOfxImportForContext(
  context: TenantContext,
  payload: OfxImportPayload,
): Promise<ImportPreview> {
  const preview = await buildOfxImportPreviewForContext(context, payload);
  return { ...preview, suggestions: preview.suggestions.slice(0, 10) };
}

export async function createOfxImportBatchForContext(
  context: TenantContext,
  payload: OfxImportPayload,
): Promise<CreateImportBatchResult> {
  const preview = await buildOfxImportPreviewForContext(context, payload);
  if (preview.state === "blocked") {
    throw new ImportReviewError(
      "IMPORT_OFX_NO_VALID_ROWS",
      "O arquivo OFX nao possui linhas validas para revisao.",
      422,
    );
  }
  return persistOfxImportBatchForContext(context, payload, preview);
}

async function buildOfxImportPreviewForContext(
  context: TenantContext,
  payload: OfxImportPayload,
): Promise<ImportPreview> {
  if (payload.consentAccepted !== true) {
    throw new ImportReviewError(
      "IMPORT_CONSENT_REQUIRED",
      "Confirme que o arquivo pode ser processado neste perfil financeiro.",
    );
  }
  const account = await assertActiveOfxAccount(context, payload.accountId, query);
  return parseOfxImportPreview({
    context,
    now: new Date().toISOString(),
    originalFileName: payload.originalFileName,
    content: payload.content,
    accountId: payload.accountId,
    accountCurrency: account.currency,
  });
}

async function assertActiveOfxAccount(
  context: TenantContext,
  accountId: EntityId,
  executeQuery: QueryExecutor,
): Promise<OfxAccountRow> {
  const rows = await executeQuery<OfxAccountRow>(
    `select "id", "status", "currency" from "Account"
     where "id" = $1 and "organizationId" = $2 and "financialProfileId" = $3`,
    [accountId, context.organizationId, context.financialProfileId],
  );
  const account = rows[0];
  if (account === undefined) {
    throw new ImportReviewError(
      "TENANT_RESOURCE_NOT_FOUND",
      "Recurso nao encontrado no perfil financeiro ativo.",
      404,
    );
  }
  if (account.status !== "ACTIVE") {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_INVALID",
      "Conta selecionada nao esta disponivel neste perfil financeiro.",
    );
  }
  return account;
}
