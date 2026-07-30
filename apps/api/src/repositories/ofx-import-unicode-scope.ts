import { ImportReviewError } from "./imports.js";

const OFX_SCOPED_FIELD_NAMES = new Set([
  "CURDEF",
  "DTPOSTED",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "TRNTYPE",
]);

interface OfxTagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  start: number;
  end: number;
}

interface UnicodeContainerRange {
  open: OfxTagToken;
  closeStart: number;
}

export function assertNoUnsupportedUnicodeOfxScope(content: string): void {
  const masked = maskInactiveOfxContent(content);
  const openUnicodeContainers: OfxTagToken[] = [];
  const ranges: UnicodeContainerRange[] = [];

  for (const token of readOfxTagTokens(masked)) {
    if (token.selfClosing || !hasNonAsciiName(token.name)) continue;

    if (!token.closing) {
      openUnicodeContainers.push(token);
      continue;
    }

    const openIndex = findLastMatchingOpen(openUnicodeContainers, token.name);
    if (openIndex < 0) continue;
    const [open] = openUnicodeContainers.splice(openIndex, 1);
    if (open !== undefined) ranges.push({ open, closeStart: token.start });
  }

  for (const open of openUnicodeContainers) {
    ranges.push({ open, closeStart: masked.length });
  }

  for (const range of ranges) {
    const body = masked.slice(range.open.end, range.closeStart);
    if (containsScopedOfxField(body)) {
      throw new ImportReviewError(
        "IMPORT_OFX_INVALID",
        "Campos OFX canonicos nao podem estar aninhados em conteineres com nomes nao suportados.",
        422,
      );
    }
  }
}

function readOfxTagTokens(value: string): OfxTagToken[] {
  const expression =
    /<\s*(\/?)\s*([\p{L}\p{Nl}_:][\p{L}\p{Nl}\p{N}\p{M}\u00b7_.:-]*)(?:\s[^>]*)?>/gu;
  return [...value.matchAll(expression)].map((match) => ({
    name: (match[2] ?? "").toUpperCase(),
    closing: match[1] === "/",
    selfClosing: /\/\s*>$/.test(match[0]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function findLastMatchingOpen(tokens: readonly OfxTagToken[], name: string): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index]?.name === name) return index;
  }
  return -1;
}

function containsScopedOfxField(value: string): boolean {
  return readOfxTagTokens(value).some((token) => {
    if (token.closing) return false;
    const localName = token.name.split(":").at(-1);
    return localName !== undefined && OFX_SCOPED_FIELD_NAMES.has(localName);
  });
}

function hasNonAsciiName(value: string): boolean {
  return /[^\u0000-\u007f]/u.test(value);
}

function maskInactiveOfxContent(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length))
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (match) => " ".repeat(match.length));
}
