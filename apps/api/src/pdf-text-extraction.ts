import { spawnSync } from "node:child_process";

import { StructuredImportError, type PdfExtractedPage } from "@solverfin/domain";

const EXTRACTOR_TIMEOUT_MS = 8_000;
const MAX_EXTRACTED_BYTES = 12 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_WORDS = 40_000;

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, key: string) => {
    switch (key) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default: {
        const hex = key.startsWith("#x");
        const number = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
          ? String.fromCodePoint(number)
          : "\ufffd";
      }
    }
  });
}

export function parsePopplerWordLayout(xml: string): PdfExtractedPage[] {
  const pages: PdfExtractedPage[] = [];
  const pagePattern = /<page\b[^>]*>([\s\S]*?)<\/page>/g;
  let count = 0;
  for (const pageMatch of xml.matchAll(pagePattern)) {
    const words: { text: string; x: number; y: number }[] = [];
    const wordPattern = /<word\b([^>]*)>([\s\S]*?)<\/word>/g;
    for (const match of pageMatch[1]!.matchAll(wordPattern)) {
      const x = /\bxMin="([\d.]+)"/.exec(match[1]!);
      const y = /\byMin="([\d.]+)"/.exec(match[1]!);
      if (!x || !y) throw new StructuredImportError("IMPORT_PDF_INVALID", "Texto do PDF invalido.");
      const xx = Number(x[1]),
        yy = Number(y[1]);
      if (!Number.isFinite(xx) || !Number.isFinite(yy) || xx < 0 || yy < 0)
        throw new StructuredImportError("IMPORT_PDF_INVALID", "Coordenadas do PDF invalidas.");
      words.push({ text: decodeXmlText(match[2]!), x: xx, y: yy });
      count += 1;
      if (count > MAX_WORDS)
        throw new StructuredImportError("IMPORT_PDF_INVALID", "PDF excede o limite de texto.");
    }
    if (words.length !== (pageMatch[1]!.match(/<word\b/g) ?? []).length)
      throw new StructuredImportError("IMPORT_PDF_INVALID", "Palavras do PDF incompletas.");
    pages.push({ words });
    if (pages.length > MAX_PAGES)
      throw new StructuredImportError("IMPORT_PDF_INVALID", "PDF excede o limite de paginas.");
  }
  if (pages.length !== (xml.match(/<page\b/g) ?? []).length)
    throw new StructuredImportError("IMPORT_PDF_INVALID", "Paginas do PDF incompletas.");
  if (pages.length === 0 || count === 0)
    throw new StructuredImportError(
      "IMPORT_PDF_LAYOUT_UNSUPPORTED",
      "O PDF nao possui texto extraivel.",
    );
  return pages;
}

export function classifyPopplerFailure(
  result: {
    status: number | null;
    stderr: string | Buffer;
    error?: Error;
  },
  executable: "pdftotext" | "pdfinfo" = "pdftotext",
): StructuredImportError | undefined {
  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    return new StructuredImportError(
      "IMPORT_PDF_EXTRACTOR_UNAVAILABLE",
      `O servidor precisa do utilitario ${executable} (Poppler) para ler extratos PDF.`,
      503,
    );
  }
  if (result.status !== 0 || result.error) {
    const stderr = String(result.stderr ?? "");
    if (result.status === 3 || /password|senha|encrypted/i.test(stderr)) {
      return new StructuredImportError(
        "IMPORT_PDF_PROTECTED",
        "Este PDF exige senha ou nao permite extracao de texto.",
        422,
      );
    }
    return new StructuredImportError(
      "IMPORT_PDF_INVALID",
      "Nao foi possivel extrair o texto do PDF.",
      422,
    );
  }
  return undefined;
}

/**
 * Rejects encrypted PDFs unless Poppler explicitly reports copy permission.
 * pdftotext alone may succeed on a copy:no PDF when the user password is empty.
 */
export function assertPdfCopyPermitted(pdfInfo: string): void {
  // PDF-controlled metadata can contain newlines and forged Encrypted fields.
  // Never choose the first or last field when the output is ambiguous.
  const fields = pdfInfo.match(/^Encrypted:[^\r\n]*$/gim) ?? [];
  const encryption =
    fields.length === 1 ? /^Encrypted:[ \t]*(yes|no)\b([^\r\n]*)$/i.exec(fields[0]!) : null;
  const encrypted = encryption?.[1]?.toLowerCase() === "yes";
  const details = encryption?.[2]?.trim() ?? "";
  const copy = /(?:^|[ \t(])copy:[ \t]*(yes|no)(?=[ \t)]|$)/i.exec(details);
  if (
    !encryption ||
    (encrypted
      ? !/^\([^()\r\n]*\)$/.test(details) ||
        (details.match(/\bcopy:/gi) ?? []).length !== 1 ||
        !copy
      : details !== "")
  ) {
    throw new StructuredImportError(
      "IMPORT_PDF_INVALID",
      "Nao foi possivel verificar as permissoes do PDF.",
      422,
    );
  }
  if (encrypted && copy![1]!.toLowerCase() !== "yes") {
    throw new StructuredImportError(
      "IMPORT_PDF_PROTECTED",
      "Este PDF nao permite extracao de texto.",
      422,
    );
  }
}

/**
 * Extracts a real text layer, not OCR. Only the default empty user password is
 * attempted; password-protected and copy-restricted documents remain blocked.
 * No raw PDF is saved.
 */
export function extractPdfWordLayout(
  bytes: Buffer,
  run: typeof spawnSync = spawnSync,
): PdfExtractedPage[] {
  // pdfinfo and pdftotext ship together with Poppler. Reject denied or unknown
  // permissions before attempting text extraction, including an empty user password.
  const info = run("pdfinfo", ["-upw", "", "-"], {
    input: bytes,
    encoding: "utf8",
    timeout: EXTRACTOR_TIMEOUT_MS,
    maxBuffer: MAX_EXTRACTED_BYTES,
    windowsHide: true,
  });
  const infoFailure = classifyPopplerFailure(info, "pdfinfo");
  if (infoFailure) throw infoFailure;
  assertPdfCopyPermitted(String(info.stdout ?? ""));

  const result = run(
    "pdftotext",
    // Do not use -q: Poppler can exit with code 1 for a password and only
    // explain that failure on stderr. The output remains private.
    ["-bbox-layout", "-enc", "UTF-8", "-upw", "", "-", "-"],
    {
      input: bytes,
      encoding: "utf8",
      timeout: EXTRACTOR_TIMEOUT_MS,
      maxBuffer: MAX_EXTRACTED_BYTES,
      windowsHide: true,
    },
  );
  const failure = classifyPopplerFailure(result);
  if (failure) throw failure;
  return parsePopplerWordLayout(String(result.stdout ?? ""));
}
