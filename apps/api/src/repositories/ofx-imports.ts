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

const OFX_SINGLE_VALUE_TRANSACTION_TAGS = [
  "DTPOSTED",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "TRNTYPE",
] as const;

interface StructuralTagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
}

interface ExplicitContainerRange {
  name: string;
  openStart: number;
  closeStart: number;
}

export function parseOfxImportPreview(input: {
  context: TenantContext;
  now: string;
  originalFileName: string;
  content: string;
  accountId: EntityId;
  accountCurrency: string;
}): ImportPreview {
  assertCanonicalOfxProcessingInstructions(input.content);
  assertCanonicalOfxCurrencyScope(input.content);
  assertCanonicalOfxTransactionFields(input.content);
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

function assertCanonicalOfxProcessingInstructions(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const starts = [...masked.matchAll(/<\?/g)];
  const instructions = [...masked.matchAll(/<\?[\s\S]*?\?>/g)];

  if (starts.length !== instructions.length) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "Instrucao de processamento XML incompleta.",
      422,
    );
  }

  for (const instruction of instructions) {
    const position = instruction.index ?? -1;
    const isXmlDeclaration =
      /^<\?xml(?:\s+[\s\S]*?)?\?>$/i.test(instruction[0]) &&
      masked.slice(0, position).trim().length === 0;

    if (!isXmlDeclaration) {
      throw new ImportReviewError(
        "IMPORT_OFX_INVALID",
        "OFX aceita somente a declaracao XML antes do envelope raiz.",
        422,
      );
    }
  }
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

  const currencyTagPattern = /<\s*(?:[A-Za-z_][\w.-]*:)?CURDEF\b[^>]*>/gi;
  const currencyTags = [...masked.matchAll(currencyTagPattern)];
  if (currencyTags.length === 0) return;

  const statementBody = masked.slice(statement.contentStart, statement.contentEnd);
  const statementContainers = readExplicitContainerRanges(statementBody);
  const hasNonCanonicalCurrency = currencyTags.some((match) => {
    const position = match.index ?? -1;
    const relativePosition = position - statement.contentStart;
    const canonicalTag = /^<\s*CURDEF\s*>$/i.test(match[0]);
    const insideStatement = position >= statement.contentStart && position < statement.contentEnd;
    const insideTransactionList =
      position >= transactionList.openStart && position < transactionList.closeEnd;
    const directStatementChild =
      insideStatement && !isNestedInsideExplicitContainer(statementContainers, relativePosition);
    return !canonicalTag || !directStatementChild || insideTransactionList;
  });

  if (hasNonCanonicalCurrency) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "CURDEF precisa ser filho direto da secao de extrato, fora de BANKTRANLIST.",
      422,
    );
  }

  if (currencyTags.length !== 1) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "CURDEF deve ocorrer no maximo uma vez na secao de extrato.",
      422,
    );
  }

  const currencyTag = currencyTags[0];
  if (currencyTag === undefined) return;

  const valueStart = (currencyTag.index ?? 0) + currencyTag[0].length;
  const currencyValue = /^\s*([^<\r\n]*)/.exec(masked.slice(valueStart))?.[1]?.trim();
  if (!currencyValue) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "CURDEF precisa declarar uma moeda quando estiver presente.",
      422,
    );
  }
}

function assertCanonicalOfxTransactionFields(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const statement = findContainer(masked, ["STMTRS", "CCSTMTRS"]);
  if (statement === undefined) return;

  const transactionList = findContainer(
    masked.slice(statement.contentStart, statement.contentEnd),
    ["BANKTRANLIST"],
    statement.contentStart,
  );
  if (transactionList === undefined) return;

  const transactionListBody = masked.slice(
    transactionList.contentStart,
    transactionList.contentEnd,
  );
  const transactionOpenPattern = /<\s*STMTTRN(?:\s[^>]*)?>/gi;
  const transactionOpens = [...transactionListBody.matchAll(transactionOpenPattern)];

  transactionOpens.forEach((open, index) => {
    const openEnd = (open.index ?? 0) + open[0].length;
    const nextOpenStart = transactionOpens[index + 1]?.index ?? transactionListBody.length;
    const segment = transactionListBody.slice(openEnd, nextOpenStart);
    const close = /<\s*\/\s*STMTTRN\s*>/i.exec(segment);
    const block = segment.slice(0, close?.index ?? segment.length);
    const explicitContainers = readExplicitContainerRanges(block);

    for (const tagName of OFX_SINGLE_VALUE_TRANSACTION_TAGS) {
      const tagPattern = new RegExp(
        `<\\s*(?:[A-Za-z_][\\w.-]*:)?${tagName}\\b[^>]*>`,
        "gi",
      );
      const tags = [...block.matchAll(tagPattern)];
      if (tags.length > 1) {
        throw new ImportReviewError(
          "IMPORT_OFX_INVALID",
          `Transacao STMTTRN ${index + 1} possui mais de um campo ${tagName}.`,
          422,
        );
      }

      for (const tag of tags) {
        const position = tag.index ?? -1;
        const canonicalTag = new RegExp(`^<\\s*${tagName}\\s*>$`, "i").test(tag[0]);
        const directTransactionChild = !isNestedInsideExplicitContainer(
          explicitContainers,
          position,
        );
        if (!canonicalTag || !directTransactionChild) {
          throw new ImportReviewError(
            "IMPORT_OFX_INVALID",
            `Campo ${tagName} da transacao STMTTRN ${index + 1} precisa ser filho direto.`,
            422,
          );
        }
      }
    }
  });
}

function readExplicitContainerRanges(value: string): ExplicitContainerRange[] {
  const tokens = readStructuralTagTokens(value);
  const openByName = new Map<string, StructuralTagToken[]>();
  const ranges: ExplicitContainerRange[] = [];

  for (const token of tokens) {
    if (token.selfClosing) continue;
    const stack = openByName.get(token.name) ?? [];
    if (!token.closing) {
      stack.push(token);
      openByName.set(token.name, stack);
      continue;
    }

    const open = stack.pop();
    if (open !== undefined) {
      ranges.push({ name: token.name, openStart: open.start, closeStart: token.start });
    }
  }

  return ranges;
}

function readStructuralTagTokens(value: string): StructuralTagToken[] {
  const expression = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)(?:\s[^>]*)?>/g;
  return [...value.matchAll(expression)].map((match) => ({
    name: (match[2] ?? "").toUpperCase(),
    closing: match[1] === "/",
    selfClosing: /\/\s*>$/.test(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function isNestedInsideExplicitContainer(
  containers: readonly ExplicitContainerRange[],
  position: number,
): boolean {
  return containers.some(
    (container) => container.openStart < position && position < container.closeStart,
  );
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
