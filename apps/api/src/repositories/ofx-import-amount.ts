import type {
  ImportPreview,
  ImportProblem,
  ImportTransactionSuggestion,
} from "@solverfin/domain";

type ParsedRowAmount =
  | { state: "valid"; signedAmountMinor: number }
  | { state: "invalid" };

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

export function applyCanonicalOfxAmountSemantics(
  content: string,
  preview: ImportPreview,
): ImportPreview {
  const amountByRow = readCanonicalOfxAmounts(content);
  const invalidRows = new Set(
    [...amountByRow.entries()]
      .filter(([, amount]) => amount.state === "invalid")
      .map(([rowNumber]) => rowNumber),
  );

  const problems = preview.problems.filter(
    (problem) =>
      !(
        invalidRows.has(problem.rowNumber) &&
        problem.code === "IMPORT_OFX_TRNTYPE_CONFLICT"
      ),
  );

  for (const rowNumber of invalidRows) {
    if (
      problems.some(
        (problem) =>
          problem.rowNumber === rowNumber && problem.code === "IMPORT_ROW_NUMBER_INVALID",
      )
    ) {
      continue;
    }
    problems.push(invalidAmountProblem(rowNumber));
  }

  const suggestions: ImportTransactionSuggestion[] = [];
  for (const suggestion of preview.suggestions) {
    const parsedAmount = amountByRow.get(suggestion.sourceRowNumber);
    if (parsedAmount?.state === "invalid") continue;
    if (parsedAmount?.state !== "valid") {
      suggestions.push(suggestion);
      continue;
    }

    const direction: "inflow" | "outflow" =
      parsedAmount.signedAmountMinor < 0 ? "outflow" : "inflow";
    suggestions.push({
      ...suggestion,
      amountMinor: Math.abs(parsedAmount.signedAmountMinor),
      direction,
      kind: direction === "outflow" ? "expense" : "income",
    });
  }

  const errorRows = new Set(
    problems
      .filter((problem) => problem.severity === "error")
      .map((problem) => problem.rowNumber),
  );
  const ready = suggestions.length > 0;

  return {
    ...preview,
    state: ready ? "ready" : "blocked",
    batch: {
      ...preview.batch,
      status: ready ? "reviewing" : "failed",
      validRows: suggestions.length,
      problemRows: errorRows.size,
    },
    suggestions,
    problems,
  };
}

function readCanonicalOfxAmounts(content: string): Map<number, ParsedRowAmount> {
  const masked = maskInactiveContent(content);
  const transactionOpens = [...masked.matchAll(/<\s*STMTTRN(?:\s[^>]*)?>/gi)];
  const amountByRow = new Map<number, ParsedRowAmount>();

  transactionOpens.forEach((open, index) => {
    const openEnd = (open.index ?? 0) + open[0].length;
    const nextOpenStart = transactionOpens[index + 1]?.index ?? masked.length;
    const segment = masked.slice(openEnd, nextOpenStart);
    const close = /<\s*\/\s*STMTTRN\s*>/i.exec(segment);
    const block = segment.slice(0, close?.index ?? segment.length);
    const amountTag = /<\s*TRNAMT\s*>\s*([^<\r\n]*)/i.exec(block);
    if (amountTag === null) return;

    const raw = (amountTag[1] ?? "").trim();
    if (raw.length === 0) return;
    amountByRow.set(index + 1, parseExactMinor(raw));
  });

  return amountByRow;
}

function parseExactMinor(value: string): ParsedRowAmount {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (match === null) return { state: "invalid" };

  const whole = BigInt(match[2] ?? "0");
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  const unsignedMinor = whole * 100n + fraction;
  if (unsignedMinor > MAX_SAFE_MINOR) return { state: "invalid" };

  const sign = match[1] === "-" ? -1 : 1;
  return { state: "valid", signedAmountMinor: sign * Number(unsignedMinor) };
}

function maskInactiveContent(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (match) => " ".repeat(match.length));
}

function invalidAmountProblem(rowNumber: number): ImportProblem {
  return {
    rowNumber,
    severity: "error",
    code: "IMPORT_ROW_NUMBER_INVALID",
    message: "O valor possui formato numerico invalido.",
  };
}
