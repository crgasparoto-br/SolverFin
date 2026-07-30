import { ImportReviewError } from "./imports.js";

const OFX_SINGLE_VALUE_TRANSACTION_TAGS = [
  "DTPOSTED",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "TRNTYPE",
] as const;

const OFX_TRANSACTION_SCALAR_TAGS = new Set([
  ...OFX_SINGLE_VALUE_TRANSACTION_TAGS,
  "DTUSER",
  "DTAVAIL",
  "CORRECTFITID",
  "CORRECTACTION",
  "SERVERID",
  "CHECKNUM",
  "REFNUM",
  "SIC",
  "PAYEEID",
  "EXTDNAME",
]);

const OFX_STATEMENT_SCALAR_TAGS = new Set(["CURDEF", "DTASOF", "MKTGINFO"]);
const OFX_TRANSACTION_LIST_SCALAR_TAGS = new Set([
  ...OFX_TRANSACTION_SCALAR_TAGS,
  ...OFX_STATEMENT_SCALAR_TAGS,
  "STMTTRN",
]);

interface StructuralTagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
}

interface ExplicitContainerRange {
  openStart: number;
  closeStart: number;
}

export function assertCanonicalOfxStructure(content: string): void {
  assertCanonicalOfxProcessingInstructions(content);
  assertCanonicalOfxXmlHierarchy(content);
  assertCanonicalOfxCurrencyScope(content);
  assertCanonicalOfxTransactionFields(content);
}

function assertCanonicalOfxProcessingInstructions(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const starts = [...masked.matchAll(/<\?/g)];
  const instructions = [...masked.matchAll(/<\?[\s\S]*?\?>/g)];

  if (starts.length !== instructions.length) {
    throw invalidOfx("Instrucao de processamento XML incompleta.");
  }

  for (const instruction of instructions) {
    const position = instruction.index ?? -1;
    const isXmlDeclaration =
      /^<\?xml(?:\s+[\s\S]*?)?\?>$/i.test(instruction[0]) &&
      masked.slice(0, position).trim().length === 0;

    if (!isXmlDeclaration) {
      throw invalidOfx("OFX aceita somente a declaracao XML antes do envelope raiz.");
    }
  }
}

function assertCanonicalOfxXmlHierarchy(content: string): void {
  const masked = maskInactiveOfxContent(content);
  if (!isStrictXml(masked)) return;

  const stack: string[] = [];
  for (const token of readStructuralTagTokens(masked)) {
    if (token.selfClosing) continue;
    if (!token.closing) {
      stack.push(token.name);
      continue;
    }

    const expected = stack.pop();
    if (expected !== token.name) {
      throw invalidOfx("Estrutura XML OFX possui tags aninhadas ou fechamentos invalidos.");
    }
  }

  if (stack.length > 0) {
    throw invalidOfx("Estrutura XML OFX possui tag incompleta.");
  }
}

function assertCanonicalOfxCurrencyScope(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const strictXml = isStrictXml(masked);
  const statement = findContainer(masked, ["STMTRS", "CCSTMTRS"]);
  if (statement === undefined) return;

  const transactionList = findContainer(
    masked.slice(statement.contentStart, statement.contentEnd),
    ["BANKTRANLIST"],
    statement.contentStart,
  );
  if (transactionList === undefined) return;

  const currencyTags = [
    ...masked.matchAll(
      /<\s*(?:[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{N}\p{M}\u00b7_.-]*:)?CURDEF\b[^>]*>/giu,
    ),
  ];
  if (currencyTags.length === 0) return;

  const statementContainers = readExplicitContainerRanges(
    masked.slice(statement.contentStart, statement.contentEnd),
    OFX_STATEMENT_SCALAR_TAGS,
  );
  const hasNonCanonicalCurrency = currencyTags.some((match) => {
    const position = match.index ?? -1;
    const relativePosition = position - statement.contentStart;
    const canonicalTag = /^<\s*CURDEF\s*>$/i.test(match[0]);
    const insideStatement = position >= statement.contentStart && position < statement.contentEnd;
    const insideTransactionList =
      position >= transactionList.openStart && position < transactionList.closeEnd;
    const directStatementChild = strictXml
      ? ["STMTRS", "CCSTMTRS"].includes(readImmediateParentName(masked, position) ?? "")
      : insideStatement && !isNestedInsideExplicitContainer(statementContainers, relativePosition);
    return !canonicalTag || !insideStatement || !directStatementChild || insideTransactionList;
  });

  if (hasNonCanonicalCurrency) {
    throw invalidOfx("CURDEF precisa ser filho direto da secao de extrato, fora de BANKTRANLIST.");
  }

  if (currencyTags.length !== 1) {
    throw invalidOfx("CURDEF deve ocorrer no maximo uma vez na secao de extrato.");
  }

  const currencyTag = currencyTags[0];
  if (currencyTag === undefined) return;
  const valueStart = (currencyTag.index ?? 0) + currencyTag[0].length;
  const currencyValue = /^\s*([^<\r\n]*)/.exec(masked.slice(valueStart))?.[1]?.trim();
  if (!currencyValue) {
    throw invalidOfx("CURDEF precisa declarar uma moeda quando estiver presente.");
  }
}

function assertCanonicalOfxTransactionFields(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const strictXml = isStrictXml(masked);
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
  const transactionContainers = readExplicitContainerRanges(
    transactionListBody,
    OFX_TRANSACTION_LIST_SCALAR_TAGS,
  );
  const transactionOpens = [...transactionListBody.matchAll(/<\s*STMTTRN(?:\s[^>]*)?>/gi)];

  transactionOpens.forEach((open, index) => {
    const openStart = open.index ?? 0;
    const directTransactionListChild = strictXml
      ? readImmediateParentName(masked, transactionList.contentStart + openStart) === "BANKTRANLIST"
      : !isNestedInsideExplicitContainer(transactionContainers, openStart);
    if (!directTransactionListChild) {
      throw invalidOfx(`Transacao STMTTRN ${index + 1} precisa ser filha direta de BANKTRANLIST.`);
    }

    const openEnd = openStart + open[0].length;
    const nextOpenStart = transactionOpens[index + 1]?.index ?? transactionListBody.length;
    const segment = transactionListBody.slice(openEnd, nextOpenStart);
    const close = /<\s*\/\s*STMTTRN\s*>/i.exec(segment);
    const block = segment.slice(0, close?.index ?? segment.length);
    const blockStart = transactionList.contentStart + openEnd;
    const explicitContainers = readExplicitContainerRanges(block, OFX_TRANSACTION_SCALAR_TAGS);

    for (const tagName of OFX_SINGLE_VALUE_TRANSACTION_TAGS) {
      const tagPattern = new RegExp(
        `<\\s*(?:[\\p{L}\\p{Nl}_][\\p{L}\\p{Nl}\\p{N}\\p{M}\\u00b7_.-]*:)?${tagName}\\b[^>]*>`,
        "giu",
      );
      const tags = [...block.matchAll(tagPattern)];
      if (tags.length > 1) {
        throw invalidOfx(`Transacao STMTTRN ${index + 1} possui mais de um campo ${tagName}.`);
      }

      for (const tag of tags) {
        const position = tag.index ?? -1;
        const canonicalTag = new RegExp(`^<\\s*${tagName}\\s*>$`, "i").test(tag[0]);
        const directTransactionChild = strictXml
          ? readImmediateParentName(masked, blockStart + position) === "STMTTRN"
          : !isNestedInsideExplicitContainer(explicitContainers, position);
        if (!canonicalTag || !directTransactionChild) {
          throw invalidOfx(
            `Campo ${tagName} da transacao STMTTRN ${index + 1} precisa ser filho direto.`,
          );
        }
      }
    }
  });
}

function readExplicitContainerRanges(
  value: string,
  scalarTags: ReadonlySet<string>,
): ExplicitContainerRange[] {
  const openByName = new Map<string, StructuralTagToken[]>();
  const ranges: ExplicitContainerRange[] = [];

  for (const token of readStructuralTagTokens(value)) {
    if (token.selfClosing) continue;
    if (!token.closing) {
      if (scalarTags.has(token.name)) continue;
      const stack = openByName.get(token.name) ?? [];
      stack.push(token);
      openByName.set(token.name, stack);
      continue;
    }

    const stack = openByName.get(token.name);
    const open = stack?.pop();
    if (open !== undefined) {
      ranges.push({ openStart: open.start, closeStart: token.start });
    }
  }

  for (const stack of openByName.values()) {
    for (const open of stack) {
      ranges.push({ openStart: open.start, closeStart: value.length });
    }
  }

  return ranges;
}

function readImmediateParentName(value: string, position: number): string | undefined {
  const stack: string[] = [];
  for (const token of readStructuralTagTokens(value.slice(0, position))) {
    if (token.selfClosing) continue;
    if (!token.closing) {
      stack.push(token.name);
      continue;
    }
    if (stack[stack.length - 1] === token.name) stack.pop();
  }
  return stack[stack.length - 1];
}

function readStructuralTagTokens(value: string): StructuralTagToken[] {
  const expression =
    /<\s*(\/?)\s*([\p{L}\p{Nl}_:][\p{L}\p{Nl}\p{N}\p{M}\u00b7_.:-]*)(?:\s[^>]*)?>/gu;
  return [...value.matchAll(expression)].map((match) => ({
    name: (match[2] ?? "").toUpperCase(),
    closing: match[1] === "/",
    selfClosing: /\/\s*>$/.test(match[0]),
    start: match.index ?? 0,
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

function isStrictXml(value: string): boolean {
  return /^\s*<\?xml\b/i.test(value);
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

function invalidOfx(message: string): ImportReviewError {
  return new ImportReviewError("IMPORT_OFX_INVALID", message, 422);
}
