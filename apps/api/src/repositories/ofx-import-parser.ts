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

interface OfxEnvelope {
  body: string;
  maskedBody: string;
  strictXml: boolean;
}

interface TagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
}

interface ContainerSlice {
  name: string;
  body: string;
  maskedBody: string;
  open: TagToken;
  close: TagToken;
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
  const structure = parseRecognizedOfxStructure(normalizedContent);
  const currency = normalizeCurrency(structure.currency);
  const suggestions: ImportTransactionSuggestion[] = [];
  const problems: ImportProblem[] = [];

  structure.transactionBlocks.forEach((block, index) => {
    const rowNumber = index + 1;
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
    const kind =
      direction === undefined ? undefined : direction === "outflow" ? "expense" : "income";

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
    if (
      direction !== undefined &&
      trnTypeDirection !== undefined &&
      direction !== trnTypeDirection
    ) {
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

  return {
    ...(currency === undefined ? {} : { currency }),
    totalRows: structure.transactionBlocks.length,
    suggestions,
    problems,
  };
}

function parseRecognizedOfxStructure(content: string): {
  currency?: string;
  transactionBlocks: string[];
} {
  const envelope = readOfxEnvelope(content);
  const statement = readSingleContainer(
    envelope.body,
    envelope.maskedBody,
    ["STMTRS", "CCSTMTRS"],
    "OFX precisa conter exatamente uma secao de extrato reconhecida.",
  );

  assertNoTag(envelope.maskedBody.slice(0, statement.open.start), "STMTTRN");
  assertNoTag(envelope.maskedBody.slice(statement.close.end), "STMTTRN");

  const transactionList = readSingleContainer(
    statement.body,
    statement.maskedBody,
    ["BANKTRANLIST"],
    "OFX precisa conter uma unica lista BANKTRANLIST completa.",
  );

  assertNoTag(statement.maskedBody.slice(0, transactionList.open.start), "STMTTRN");
  assertNoTag(statement.maskedBody.slice(transactionList.close.end), "STMTTRN");

  const metadata = [
    statement.maskedBody.slice(0, transactionList.open.start),
    statement.maskedBody.slice(transactionList.close.end),
  ].join("\n");
  const currencyValues = readOfxTagValues(metadata, "CURDEF");
  if (currencyValues.length > 1) {
    throw invalidOfx("OFX possui mais de uma moeda CURDEF na secao de extrato.");
  }

  const transactionBlocks = envelope.strictXml
    ? readXmlTransactionBlocks(transactionList.maskedBody)
    : readSgmlTransactionBlocks(transactionList.maskedBody);
  if (transactionBlocks.length === 0) {
    throw invalidOfx("OFX precisa conter ao menos uma transacao STMTTRN na lista BANKTRANLIST.");
  }

  return {
    ...(currencyValues[0] === undefined ? {} : { currency: currencyValues[0] }),
    transactionBlocks,
  };
}

function readOfxEnvelope(content: string): OfxEnvelope {
  const trimmed = content.trim();
  const masked = maskInactiveContent(trimmed);
  const rootOpen = /<\s*OFX(?:\s[^>]*)?>/i.exec(masked);
  if (rootOpen === null) {
    throw invalidOfx("OFX precisa conter o envelope raiz OFX.");
  }

  const prefix = trimmed.slice(0, rootOpen.index).trim();
  if (prefix.length > 0 && !isRecognizedOfxPrefix(prefix)) {
    throw invalidOfx("Cabecalho OFX nao reconhecido.");
  }

  const afterRootOpen = rootOpen.index + rootOpen[0].length;
  const rootCloseExpression = /<\s*\/\s*OFX\s*>/gi;
  rootCloseExpression.lastIndex = afterRootOpen;
  const rootClose = rootCloseExpression.exec(masked);
  if (rootClose === null) {
    throw invalidOfx("Envelope OFX incompleto.");
  }

  if (masked.slice(rootClose.index + rootClose[0].length).trim().length > 0) {
    throw invalidOfx("OFX possui conteudo inesperado apos o envelope raiz.");
  }

  const nestedRoot = /<\s*OFX(?:\s[^>]*)?>/i.exec(masked.slice(afterRootOpen, rootClose.index));
  if (nestedRoot !== null) {
    throw invalidOfx("OFX possui envelope raiz aninhado ou duplicado.");
  }

  return {
    body: trimmed.slice(afterRootOpen, rootClose.index),
    maskedBody: masked.slice(afterRootOpen, rootClose.index),
    strictXml: /^<\?xml\b/i.test(prefix),
  };
}

function readSingleContainer(
  original: string,
  masked: string,
  names: string[],
  errorMessage: string,
): ContainerSlice {
  const tokens = readTagTokens(masked, names);
  const [open, close] = tokens;
  if (
    tokens.length !== 2 ||
    open === undefined ||
    close === undefined ||
    open.closing ||
    !close.closing ||
    open.selfClosing ||
    open.name !== close.name
  ) {
    throw invalidOfx(errorMessage);
  }

  return {
    name: open.name,
    body: original.slice(open.end, close.start),
    maskedBody: masked.slice(open.end, close.start),
    open,
    close,
  };
}

function readTagTokens(value: string, names: string[]): TagToken[] {
  const alternatives = names.map(escapeRegularExpression).join("|");
  const expression = new RegExp(`<\\s*(\\/?)\\s*(${alternatives})(?:\\s[^>]*)?>`, "gi");
  return [...value.matchAll(expression)].map((match) => ({
    name: (match[2] ?? "").toUpperCase(),
    closing: match[1] === "/",
    selfClosing: /\/\s*>$/.test(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function readXmlTransactionBlocks(value: string): string[] {
  const tokens = readTagTokens(value, ["STMTTRN"]);
  const blocks: string[] = [];
  let open: TagToken | undefined;

  for (const token of tokens) {
    if (token.selfClosing) {
      throw invalidOfx("Bloco STMTTRN XML nao pode ser autocontido.");
    }
    if (!token.closing) {
      if (open !== undefined) {
        throw invalidOfx("Blocos STMTTRN XML nao podem ser aninhados.");
      }
      open = token;
      continue;
    }
    if (open === undefined) {
      throw invalidOfx("Fechamento STMTTRN XML sem abertura correspondente.");
    }
    blocks.push(value.slice(open.end, token.start));
    open = undefined;
  }

  if (open !== undefined) {
    throw invalidOfx("Bloco STMTTRN XML incompleto.");
  }
  return blocks;
}

function readSgmlTransactionBlocks(value: string): string[] {
  const tokens = readTagTokens(value, ["STMTTRN"]);
  const opens = tokens.filter((token) => !token.closing && !token.selfClosing);
  const blocks: string[] = [];

  opens.forEach((open, index) => {
    const nextOpen = opens[index + 1];
    const segmentEnd = nextOpen?.start ?? value.length;
    const segment = value.slice(open.end, segmentEnd);
    const close = /<\s*\/\s*STMTTRN\s*>/i.exec(segment);
    blocks.push(segment.slice(0, close?.index ?? segment.length));
  });

  return blocks;
}

function readOfxTagValues(block: string, tagName: string): string[] {
  const expression = new RegExp(`<\\s*${tagName}\\s*>\\s*([^<\\r\\n]+)`, "gi");
  return [...block.matchAll(expression)]
    .map((match) => normalizeText(match[1]))
    .filter((value): value is string => value !== undefined);
}

function assertNoTag(value: string, tagName: string): void {
  if (readTagTokens(value, [tagName]).length > 0) {
    throw invalidOfx(`Bloco ${tagName} precisa pertencer a lista BANKTRANLIST suportada.`);
  }
}

function maskInactiveContent(value: string): string {
  const characters = [...value];
  let index = 0;

  while (index < value.length) {
    const isComment = value.startsWith("<!--", index);
    const isCdata = value.startsWith("<![CDATA[", index);
    if (!isComment && !isCdata) {
      index += 1;
      continue;
    }

    const terminator = isComment ? "-->" : "]]>";
    const end = value.indexOf(terminator, index + (isComment ? 4 : 9));
    if (end < 0) {
      throw invalidOfx(isComment ? "Comentario XML incompleto." : "Bloco CDATA incompleto.");
    }
    const maskedEnd = end + terminator.length;
    for (let cursor = index; cursor < maskedEnd; cursor += 1) {
      characters[cursor] = " ";
    }
    index = maskedEnd;
  }

  return characters.join("");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecognizedOfxPrefix(prefix: string): boolean {
  const normalized = prefix.replace(/\r\n?/g, "\n").trim();
  if (/^<\?xml[\s\S]*?\?>\s*(?:<!DOCTYPE[\s\S]*?>\s*)?$/i.test(normalized)) {
    return true;
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0 || !lines.every((line) => /^[A-Z0-9_]+\s*:[^\r\n]*$/i.test(line))) {
    return false;
  }
  return (
    lines.some((line) => /^OFXHEADER\s*:/i.test(line)) &&
    lines.some((line) => /^DATA\s*:\s*OFXSGML\s*$/i.test(line))
  );
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
    return rowError(rowNumber, "IMPORT_ROW_AMOUNT_ZERO", "O valor precisa ser diferente de zero.");
  }
  return rowError(
    rowNumber,
    "IMPORT_ROW_NUMBER_INVALID",
    "O valor possui formato numerico invalido.",
  );
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
  if (["DEBIT", "PAYMENT", "ATM", "CHECK", "DIRECTDEBIT", "FEE", "SRVCHG"].includes(value)) {
    return "outflow";
  }
  return undefined;
}

function readOfxTag(block: string, tagName: string): string | undefined {
  return readOfxTagValues(block, tagName)[0];
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)?.toUpperCase();
  if (normalized === undefined) return undefined;
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw invalidOfx("A moeda declarada no OFX e invalida.");
  }
  return normalized;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value === undefined ? undefined : decodeXmlEntities(value).trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";

    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (
      !Number.isInteger(codePoint) ||
      codePoint < 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function invalidOfx(message: string): ImportReviewError {
  return new ImportReviewError("IMPORT_OFX_INVALID", message, 422);
}

function rowError(rowNumber: number, code: string, message: string): ImportProblem {
  return { rowNumber, severity: "error", code, message };
}
