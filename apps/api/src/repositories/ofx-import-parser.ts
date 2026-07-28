import {
  buildImportContentHash,
  buildSecureImportHash,
  type EntityId,
  type ImportPreview,
  type ImportProblem,
  type ImportTransactionSuggestion,
  type TenantContext,
} from "@solverfin/domain";

import { ImportReviewError } from "./imports.js";

interface ParsedAmount {
  state: "valid" | "empty" | "zero" | "invalid";
  amountMinor?: number;
  signedAmountMinor?: number;
}

interface ParsedOfxDocument {
  currency?: string;
  totalRows: number;
  suggestions: ImportTransactionSuggestion[];
  problems: ImportProblem[];
}

const MAX_OFX_BYTES = 5 * 1024 * 1024;

export function parseOfxImportPreview(input: {
  context: TenantContext;
  now: string;
  originalFileName: string;
  content: string;
  accountId: EntityId;
  accountCurrency: string;
}): ImportPreview {
  assertOfxInput(input.originalFileName, input.content);
  const parsed = parseOfxDocument(input);
  const accountCurrency = input.accountCurrency.trim().toUpperCase();
  if (parsed.currency !== undefined && parsed.currency !== accountCurrency) {
    throw new ImportReviewError(
      "IMPORT_ACCOUNT_CURRENCY_MISMATCH",
      "A moeda declarada no OFX precisa ser a mesma moeda da conta selecionada.",
      422,
    );
  }

  const currency = parsed.currency ?? accountCurrency;
  const suggestions = parsed.suggestions.map((suggestion) => ({ ...suggestion, currency }));
  const errorRows = new Set(
    parsed.problems
      .filter((problem) => problem.severity === "error")
      .map((problem) => problem.rowNumber),
  );
  const contentHash = buildImportContentHash(input.content);
  const sourceHash = buildSecureImportHash(
    [
      "ofx",
      input.context.organizationId,
      input.context.financialProfileId,
      input.accountId,
      contentHash,
    ].join(":"),
  );

  return {
    state: suggestions.length > 0 ? "ready" : "blocked",
    persisted: false,
    batch: {
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      sourceKind: "ofx",
      status: suggestions.length > 0 ? "reviewing" : "failed",
      originalFileName: input.originalFileName,
      sourceHash,
      contentHash,
      receivedAt: input.now,
      defaultAccountId: input.accountId,
      totalRows: parsed.totalRows,
      validRows: suggestions.length,
      duplicateRows: 0,
      problemRows: errorRows.size,
    },
    suggestions,
    problems: parsed.problems,
  };
}

function parseOfxDocument(input: {
  context: TenantContext;
  content: string;
  accountId: EntityId;
}): ParsedOfxDocument {
  const normalizedContent = stripUtf8Bom(input.content);
  const currency = normalizeCurrency(readOfxTag(normalizedContent, "CURDEF"));
  const blocks = [
    ...normalizedContent.matchAll(
      /<\s*STMTTRN\s*>([\s\S]*?)(?=<\s*\/\s*STMTTRN\s*>|<\s*STMTTRN\s*>|<\s*\/\s*BANKTRANLIST\s*>|$)/gi,
    ),
  ];
  if (blocks.length === 0) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "OFX precisa conter ao menos uma transacao STMTTRN.",
      422,
    );
  }

  const suggestions: ImportTransactionSuggestion[] = [];
  const problems: ImportProblem[] = [];
  blocks.forEach((match, index) => {
    const rowNumber = index + 1;
    const block = match[1] ?? "";
    const dateText = readOfxTag(block, "DTPOSTED");
    const amountText = readOfxTag(block, "TRNAMT");
    const parsedAmount = parseAmountMinor(amountText);
    const fitId = normalizeText(readOfxTag(block, "FITID"));
    const description = normalizeText(
      readOfxTag(block, "NAME") ?? readOfxTag(block, "MEMO") ?? fitId,
    );
    const occurredOn = normalizeOfxDate(dateText);
    const direction =
      parsedAmount.signedAmountMinor === undefined
        ? undefined
        : parsedAmount.signedAmountMinor < 0
          ? "outflow"
          : "inflow";
    const kind = direction === undefined ? undefined : direction === "outflow" ? "expense" : "income";

    if (occurredOn === undefined) {
      problems.push(rowError(rowNumber, "IMPORT_ROW_DATE_INVALID", "Informe uma data valida."));
    }
    if (description === undefined) {
      problems.push(
        rowError(rowNumber, "IMPORT_ROW_DESCRIPTION_REQUIRED", "Informe uma descricao."),
      );
    }
    const amountProblem = buildAmountProblem(rowNumber, parsedAmount.state);
    if (amountProblem !== undefined) problems.push(amountProblem);

    const trnType = normalizeText(readOfxTag(block, "TRNTYPE"))?.toUpperCase();
    const trnTypeDirection = inferTrnTypeDirection(trnType);
    if (direction !== undefined && trnTypeDirection !== undefined && direction !== trnTypeDirection) {
      problems.push({
        rowNumber,
        severity: "warning",
        code: "IMPORT_OFX_TRNTYPE_CONFLICT",
        message: "O tipo informado pelo banco diverge do sinal do valor; o sinal foi mantido.",
      });
    }

    if (
      occurredOn === undefined ||
      description === undefined ||
      parsedAmount.amountMinor === undefined ||
      direction === undefined ||
      kind === undefined
    ) {
      return;
    }

    const sourceHash = buildSecureImportHash(
      [
        "ofx-row",
        input.context.organizationId,
        input.context.financialProfileId,
        input.accountId,
        occurredOn,
        parsedAmount.signedAmountMinor,
        description,
        fitId ?? "",
      ].join(":"),
    );
    suggestions.push({
      id: `import-suggestion-${sourceHash.slice(-36)}`,
      payloadVersion: 2,
      organizationId: input.context.organizationId,
      financialProfileId: input.context.financialProfileId,
      status: "pending_review",
      sourceKind: "ofx",
      sourceHash,
      sourceRowNumber: rowNumber,
      occurredOn,
      description,
      kind,
      direction,
      amountMinor: parsedAmount.amountMinor,
      currency: currency ?? "BRL",
      accountId: input.accountId,
      ...(fitId === undefined ? {} : { externalId: fitId }),
    });
  });

  return { currency, totalRows: blocks.length, suggestions, problems };
}

function assertOfxInput(originalFileName: string, content: string): void {
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

function parseAmountMinor(value: string | undefined): ParsedAmount {
  const raw = normalizeText(value);
  if (raw === undefined) return { state: "empty" };
  const normalized = raw.replace(/\s/g, "").replace(/,/g, ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return { state: "invalid" };
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return { state: "invalid" };
  const signedAmountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(signedAmountMinor)) return { state: "invalid" };
  if (signedAmountMinor === 0) return { state: "zero" };
  return {
    state: "valid",
    amountMinor: Math.abs(signedAmountMinor),
    signedAmountMinor,
  };
}

function buildAmountProblem(
  rowNumber: number,
  state: ParsedAmount["state"],
): ImportProblem | undefined {
  if (state === "valid") return undefined;
  if (state === "empty") {
    return rowError(rowNumber, "IMPORT_ROW_AMOUNT_REQUIRED", "Informe um valor nesta linha.");
  }
  if (state === "zero") {
    return rowError(
      rowNumber,
      "IMPORT_ROW_AMOUNT_ZERO",
      "O valor precisa ser diferente de zero.",
    );
  }
  return rowError(rowNumber, "IMPORT_ROW_NUMBER_INVALID", "O valor possui formato numerico invalido.");
}

function normalizeOfxDate(value: string | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (normalized === undefined || !/^\d{8}/.test(normalized)) return undefined;
  const year = normalized.slice(0, 4);
  const month = normalized.slice(4, 6);
  const day = normalized.slice(6, 8);
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }
  return `${year}-${month}-${day}`;
}

function inferTrnTypeDirection(value: string | undefined): "inflow" | "outflow" | undefined {
  if (value === undefined) return undefined;
  if (["CREDIT", "DEP", "DIRECTDEP", "INT", "DIV"].includes(value)) return "inflow";
  if (
    ["DEBIT", "PAYMENT", "ATM", "CHECK", "DIRECTDEBIT", "FEE", "SRVCHG"].includes(value)
  ) {
    return "outflow";
  }
  return undefined;
}

function readOfxTag(block: string, tagName: string): string | undefined {
  const expression = new RegExp(`<\s*${tagName}\\s*>\\s*([^<\\r\\n]+)`, "i");
  return normalizeText(expression.exec(block)?.[1]);
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)?.toUpperCase();
  if (normalized === undefined) return undefined;
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ImportReviewError(
      "IMPORT_OFX_INVALID",
      "A moeda declarada no OFX e invalida.",
      422,
    );
  }
  return normalized;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function rowError(rowNumber: number, code: string, message: string): ImportProblem {
  return { rowNumber, severity: "error", code, message };
}
