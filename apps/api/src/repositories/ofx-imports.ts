import { randomUUID } from "node:crypto";

import type { EntityId, ImportPreview, TenantContext } from "@solverfin/domain";

import { query, type QueryExecutor } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";
import { ImportReviewError, type CreateImportBatchResult } from "./imports.js";
import { buildOfxFailureAuditEntry, buildOfxPreviewAuditEntry } from "./ofx-import-audit.js";
import { parseOfxImportPreview as parseOfxImportPreviewBase } from "./ofx-import-parser.js";
import { persistOfxImportBatchForContext } from "./ofx-import-store.js";
import type { OfxAccountRow, OfxImportPayload } from "./ofx-import-types.js";

export type { OfxImportPayload } from "./ofx-import-types.js";

export function parseOfxImportPreview(input: {
  context: TenantContext;
  now: string;
  originalFileName: string;
  content: string;
  accountId: EntityId;
  accountCurrency: string;
}): ImportPreview {
  const preview = parseOfxImportPreviewBase(input);
  assertCanonicalOfxCurrencyScope(input.content);
  return preview;
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

function assertCanonicalOfxCurrencyScope(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const statement = findContainer(masked, ["STMTRS", "CCSTMTRS"]);
  if (statement === undefined) return;

  const transactionList = findContainer(
    masked.slice(statement.contentStart, statement.contentEnd),
    ["BANKTRANLIST"],
    statement.contentStart,
  );
  if (transactionList === undefined) return;

  const currencyTags = [...masked.matchAll(/<\s*CURDEF\b[^>]*>/gi)];
  const hasNonCanonicalCurrency = currencyTags.some((match) => {
    const position = match.index ?? -1;
    const insideStatement =
      position >= statement.contentStart && position < statement.contentEnd;
    const insideTransactionList =
      position >= transactionList.openStart && position < transactionList.closeEnd;
    return !insideStatement || insideTransactionList;
  });

  if (hasNonCanonicalCurrency) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "CURDEF precisa pertencer aos metadados da secao de extrato, fora de BANKTRANLIST.",
      422,
    );
  }
}

function maskInactiveOfxContent(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (match) => " ".repeat(match.length));
}

function findContainer(
  value: string,
  names: readonly string[],
  offset = 0,
):
  | {
      openStart: number;
      contentStart: number;
      contentEnd: number;
      closeEnd: number;
    }
  | undefined {
  const alternatives = names.join("|");
  const openExpression = new RegExp(`<\\s*(${alternatives})(?:\\s[^>]*)?>`, "i");
  const open = openExpression.exec(value);
  if (open === null || open[1] === undefined) return undefined;

  const contentStart = open.index + open[0].length;
  const closeExpression = new RegExp(`<\\s*\\/\\s*${open[1]}\\s*>`, "i");
  const close = closeExpression.exec(value.slice(contentStart));
  if (close === null) return undefined;

  return {
    openStart: offset + open.index,
    contentStart: offset + contentStart,
    contentEnd: offset + contentStart + close.index,
    closeEnd: offset + contentStart + close.index + close[0].length,
  };
}
