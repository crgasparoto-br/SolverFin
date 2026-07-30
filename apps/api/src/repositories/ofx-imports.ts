import { randomUUID } from "node:crypto";

import type { EntityId, ImportPreview, TenantContext } from "@solverfin/domain";

import { query, type QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { ImportReviewError, type CreateImportBatchResult } from "./imports.js";
import { buildOfxFailureAuditEntry, buildOfxPreviewAuditEntry } from "./ofx-import-audit.js";
import { parseOfxImportPreview as parseOfxImportPreviewBase } from "./ofx-import-parser.js";
import { assertCanonicalOfxStructure } from "./ofx-import-structure.js";
import { persistOfxImportBatchForContext } from "./ofx-import-store.js";
import type { OfxAccountRow, OfxImportPayload } from "./ofx-import-types.js";

export type { OfxImportPayload } from "./ofx-import-types.js";

const MAX_OFX_BYTES = 5 * 1024 * 1024;

export function parseOfxImportPreview(input: {
  context: TenantContext;
  now: string;
  originalFileName: string;
  content: string;
  accountId: EntityId;
  accountCurrency: string;
}): ImportPreview {
  assertRawOfxInputBoundary(input.originalFileName, input.content);
  assertCanonicalOfxStructure(input.content);
  return parseOfxImportPreviewBase(input);
}

export async function previewOfxImportForContext(
  context: TenantContext,
  payload: OfxImportPayload,
): Promise<ImportPreview> {
  const attemptId = randomUUID();
  const occurredAt = new Date().toISOString();
  try {
    const preview = await buildOfxImportPreviewForContext(context, payload, occurredAt);
    await insertAuditLogEntry(query, buildOfxPreviewAuditEntry(context, attemptId, preview));
    return { ...preview, suggestions: preview.suggestions.slice(0, 10) };
  } catch (error) {
    await recordOfxFailure(context, attemptId, occurredAt, "preview", error);
    throw error;
  }
}

export async function createOfxImportBatchForContext(
  context: TenantContext,
  payload: OfxImportPayload,
): Promise<CreateImportBatchResult> {
  const attemptId = randomUUID();
  const occurredAt = new Date().toISOString();
  try {
    const preview = await buildOfxImportPreviewForContext(context, payload, occurredAt);
    if (preview.state === "blocked") {
      throw new ImportReviewError(
        "IMPORT_OFX_NO_VALID_ROWS",
        "O arquivo OFX nao possui linhas validas para revisao.",
        422,
      );
    }
    return await persistOfxImportBatchForContext(context, payload, preview);
  } catch (error) {
    await recordOfxFailure(context, attemptId, occurredAt, "creation", error);
    throw error;
  }
}

async function buildOfxImportPreviewForContext(
  context: TenantContext,
  payload: OfxImportPayload,
  now: string,
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
    now,
    originalFileName: payload.originalFileName,
    content: payload.content,
    accountId: payload.accountId,
    accountCurrency: account.currency,
  });
}

async function recordOfxFailure(
  context: TenantContext,
  attemptId: string,
  occurredAt: string,
  phase: "preview" | "creation",
  error: unknown,
): Promise<void> {
  const errorCode = error instanceof ImportReviewError ? error.code : "API_UNEXPECTED_ERROR";
  try {
    await insertAuditLogEntry(
      query,
      buildOfxFailureAuditEntry(context, {
        attemptId,
        occurredAt,
        phase,
        errorCode,
      }),
    );
  } catch {
    // Preserve the original controlled failure when the audit store is unavailable.
  }
}

async function assertActiveOfxAccount(
  context: TenantContext,
  accountId: EntityId,
  executeQuery: QueryExecutor,
): Promise<OfxAccountRow> {
  if (!isUuid(accountId)) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_INVALID",
      "Conta selecionada possui identificador invalido.",
      400,
    );
  }

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

function assertRawOfxInputBoundary(originalFileName: string, content: string): void {
  if (!originalFileName.trim().toLowerCase().endsWith(".ofx")) {
    throw new ImportReviewError(
      "IMPORT_FILE_KIND_UNSUPPORTED",
      "Selecione um arquivo com extensao .ofx.",
    );
  }
  if (content.trim().length === 0) {
    throw new ImportReviewError("IMPORT_FILE_EMPTY", "Arquivo de importacao vazio.");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_OFX_BYTES) {
    throw new ImportReviewError(
      "IMPORT_FILE_TOO_LARGE",
      "Arquivo excede o tamanho permitido de 5 MB.",
    );
  }
  if (content.includes("\u0000") || content.includes("\uFFFD")) {
    throw new ImportReviewError(
      "IMPORT_FILE_ENCODING_INVALID",
      "Nao foi possivel ler o OFX como texto UTF-8.",
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
