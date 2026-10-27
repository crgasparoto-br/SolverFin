import { inflateSync } from "node:zlib";

type PdfValue =
  | { kind: "name"; value: string }
  | { kind: "number"; value: number }
  | { kind: "reference"; object: number; generation: number }
  | { kind: "array"; values: PdfValue[] }
  | { kind: "dictionary"; entries: Map<string, PdfValue> }
  | { kind: "other" };

type Cursor = { text: string; index: number };
const PDF_SPACE = /[\0\t\n\f\r ]/;
const MAX_XREF_BYTES = 24 * 1024 * 1024;

function isPdfDelimiter(char: string): boolean {
  return PDF_SPACE.test(char) || "()<>[]{}/%".includes(char);
}

function skipSpace(cursor: Cursor): void {
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (PDF_SPACE.test(char ?? "")) cursor.index++;
    else if (char === "%") {
      while (cursor.index < cursor.text.length && !/[\r\n]/.test(cursor.text[cursor.index]!)) {
        cursor.index++;
      }
    } else break;
  }
}

function pdfName(cursor: Cursor): string | undefined {
  if (cursor.text[cursor.index] !== "/") return undefined;
  cursor.index++;
  const start = cursor.index;
  while (cursor.index < cursor.text.length && !isPdfDelimiter(cursor.text[cursor.index]!)) {
    cursor.index++;
  }
  const name = cursor.text.slice(start, cursor.index);
  if (!name || /#(?![\da-f]{2})/i.test(name)) return undefined;
  return name.replace(/#([\da-f]{2})/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function pdfValue(cursor: Cursor, depth = 0): PdfValue | undefined {
  if (depth > 16) return undefined;
  skipSpace(cursor);
  const text = cursor.text;
  const char = text[cursor.index];
  if (char === "/") {
    const name = pdfName(cursor);
    return name === undefined ? undefined : { kind: "name", value: name };
  }
  if (text.startsWith("<<", cursor.index)) {
    cursor.index += 2;
    const entries = new Map<string, PdfValue>();
    while (entries.size < 1024) {
      skipSpace(cursor);
      if (text.startsWith(">>", cursor.index)) {
        cursor.index += 2;
        return { kind: "dictionary", entries };
      }
      const key = pdfName(cursor);
      if (!key || entries.has(key)) return undefined;
      const value = pdfValue(cursor, depth + 1);
      if (!value) return undefined;
      entries.set(key, value);
    }
    return undefined;
  }
  if (char === "[") {
    cursor.index++;
    const values: PdfValue[] = [];
    while (values.length < 65536) {
      skipSpace(cursor);
      if (text[cursor.index] === "]") {
        cursor.index++;
        return { kind: "array", values };
      }
      const value = pdfValue(cursor, depth + 1);
      if (!value) return undefined;
      values.push(value);
    }
    return undefined;
  }
  if (char === "(") {
    cursor.index++;
    let level = 1;
    while (cursor.index < text.length && level > 0) {
      const next = text[cursor.index++];
      if (next === "\\") cursor.index++;
      else if (next === "(") level++;
      else if (next === ")") level--;
    }
    return level === 0 ? { kind: "other" } : undefined;
  }
  if (char === "<") {
    const end = text.indexOf(">", cursor.index + 1);
    if (end < 0) return undefined;
    cursor.index = end + 1;
    return { kind: "other" };
  }
  const start = cursor.index;
  while (cursor.index < text.length && !isPdfDelimiter(text[cursor.index]!)) cursor.index++;
  if (start === cursor.index) return undefined;
  const token = text.slice(start, cursor.index);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return { kind: "other" };
  const number = Number(token);
  if (!Number.isFinite(number)) return undefined;
  if (Number.isSafeInteger(number) && number >= 0) {
    const saved = cursor.index;
    skipSpace(cursor);
    const generation = /^(\d+)/.exec(text.slice(cursor.index));
    if (generation) {
      cursor.index += generation[1]!.length;
      skipSpace(cursor);
      if (text[cursor.index] === "R" && isPdfDelimiter(text[cursor.index + 1] ?? " ")) {
        cursor.index++;
        const value = Number(generation[1]);
        if (Number.isSafeInteger(value) && value >= 0) {
          return { kind: "reference", object: number, generation: value };
        }
      }
    }
    cursor.index = saved;
  }
  return { kind: "number", value: number };
}

function pdfDictionary(cursor: Cursor): Map<string, PdfValue> | undefined {
  const value = pdfValue(cursor);
  return value?.kind === "dictionary" ? value.entries : undefined;
}

function nonnegative(value: PdfValue | undefined): number | undefined {
  return value?.kind === "number" && Number.isSafeInteger(value.value) && value.value >= 0
    ? value.value
    : undefined;
}

function nameIs(value: PdfValue | undefined, expected: string): boolean {
  return value?.kind === "name" && value.value === expected;
}

function rootReference(
  dict: Map<string, PdfValue>,
): { object: number; generation: number } | undefined {
  const root = dict.get("Root");
  return root?.kind === "reference" ? root : undefined;
}

function indirectObject(
  text: string,
  offset: number,
): { object: number; generation: number; cursor: Cursor } | undefined {
  const header = /^(\d+)[\0\t\n\f\r ]+(\d+)[\0\t\n\f\r ]+obj\b/.exec(text.slice(offset));
  if (!header) return undefined;
  const object = Number(header[1]);
  const generation = Number(header[2]);
  if (!Number.isSafeInteger(object) || !Number.isSafeInteger(generation)) return undefined;
  return { object, generation, cursor: { text, index: offset + header[0].length } };
}

function validCatalog(
  text: string,
  offset: number | undefined,
  root: { object: number; generation: number },
  bound: number,
): boolean {
  if (offset === undefined || offset < 0 || offset >= bound) return false;
  const indirect = indirectObject(text, offset);
  if (!indirect || indirect.object !== root.object || indirect.generation !== root.generation)
    return false;
  const dict = pdfDictionary(indirect.cursor);
  if (!dict || !nameIs(dict.get("Type"), "Catalog")) return false;
  skipSpace(indirect.cursor);
  return text.startsWith("endobj", indirect.cursor.index) && indirect.cursor.index + 6 <= bound;
}

export function resolveClassicXrefObjectOffset(
  xrefSection: string,
  trailerIndex: number,
  objectNumber: number,
  generation: number,
): number | undefined {
  const lines = xrefSection
    .slice(4, trailerIndex)
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let resolved: number | undefined;
  for (let index = 0; index < lines.length; ) {
    const header = /^(\d+)\s+(\d+)$/.exec(lines[index] ?? "");
    if (!header) return undefined;
    const first = Number(header[1]);
    const count = Number(header[2]);
    const entries = lines.slice(index + 1, index + 1 + count);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(count) ||
      entries.length !== count ||
      entries.some((entry) => !/^\d{10}\s+\d{5}\s+[nf]\b/.test(entry))
    )
      return undefined;
    const entry = entries[objectNumber - first];
    const match = entry && /^(\d{10})\s+(\d{5})\s+n\b/.exec(entry);
    if (match && Number(match[2]) === generation) resolved = Number(match[1]);
    index += count + 1;
  }
  return resolved;
}

function xrefStreamRootOffset(
  text: string,
  offset: number,
): { root: { object: number; generation: number }; location: number } | undefined {
  const indirect = indirectObject(text, offset);
  if (!indirect) return undefined;
  const dictionary = pdfDictionary(indirect.cursor);
  if (!dictionary || !nameIs(dictionary.get("Type"), "XRef")) return undefined;
  const root = rootReference(dictionary);
  const size = nonnegative(dictionary.get("Size"));
  const length = nonnegative(dictionary.get("Length"));
  const widthsValue = dictionary.get("W");
  const indexValue = dictionary.get("Index");
  if (
    !root ||
    size === undefined ||
    size === 0 ||
    root.object >= size ||
    length === undefined ||
    widthsValue?.kind !== "array" ||
    widthsValue.values.length !== 3
  )
    return undefined;
  const widths = widthsValue.values.map(nonnegative);
  if (widths.some((value) => value === undefined || value > 8)) return undefined;
  const [typeWidth, offsetWidth, generationWidth] = widths as number[];
  const entryWidth = typeWidth! + offsetWidth! + generationWidth!;
  if (entryWidth === 0 || entryWidth > 24) return undefined;
  const segments =
    indexValue === undefined
      ? [0, size]
      : indexValue.kind === "array"
        ? indexValue.values.map(nonnegative)
        : [];
  if (segments.length === 0 || segments.length % 2 !== 0 || segments.some((n) => n === undefined))
    return undefined;
  let total = 0;
  for (let i = 0; i < segments.length; i += 2) {
    const first = segments[i]!;
    const count = segments[i + 1]!;
    if (first + count > size || count > MAX_XREF_BYTES / entryWidth!) return undefined;
    total += count;
  }
  if (total * entryWidth! > MAX_XREF_BYTES) return undefined;
  skipSpace(indirect.cursor);
  if (!text.startsWith("stream", indirect.cursor.index)) return undefined;
  indirect.cursor.index += 6;
  if (text.startsWith("\r\n", indirect.cursor.index)) indirect.cursor.index += 2;
  else if (/[\r\n]/.test(text[indirect.cursor.index] ?? "")) indirect.cursor.index++;
  else return undefined;
  const streamStart = indirect.cursor.index;
  const streamEnd = streamStart + length;
  if (streamEnd > text.length) return undefined;
  const filter = dictionary.get("Filter");
  const flate =
    nameIs(filter, "FlateDecode") ||
    (filter?.kind === "array" &&
      filter.values.length === 1 &&
      nameIs(filter.values[0], "FlateDecode"));
  if ((filter !== undefined && !flate) || dictionary.has("DecodeParms")) return undefined;
  let data = Buffer.from(text.slice(streamStart, streamEnd), "latin1");
  try {
    if (flate) data = inflateSync(data, { maxOutputLength: MAX_XREF_BYTES });
  } catch {
    return undefined;
  }
  const end = { text, index: streamEnd };
  if (text.startsWith("\r\n", end.index)) end.index += 2;
  else if (/[\r\n]/.test(text[end.index] ?? "")) end.index++;
  else return undefined;
  skipSpace(end);
  if (!text.startsWith("endstream", end.index)) return undefined;
  end.index += 9;
  skipSpace(end);
  if (!text.startsWith("endobj", end.index) || data.length !== total * entryWidth!)
    return undefined;
  let position = 0;
  let location: number | undefined;
  function read(width: number): number | undefined {
    let value = 0;
    for (let i = 0; i < width; i++) {
      value = value * 256 + data[position++]!;
      if (!Number.isSafeInteger(value)) return undefined;
    }
    return value;
  }
  for (let i = 0; i < segments.length; i += 2) {
    for (let id = segments[i]!; id < segments[i]! + segments[i + 1]!; id++) {
      const type = typeWidth === 0 ? 1 : read(typeWidth!);
      const field2 = read(offsetWidth!);
      const field3 = read(generationWidth!);
      if (type === undefined || field2 === undefined || field3 === undefined) return undefined;
      if (id === root.object) {
        if (type !== 1 || field3 !== root.generation || location !== undefined) return undefined;
        location = field2;
      }
    }
  }
  return location === undefined ? undefined : { root, location };
}

export function hasValidPdfCatalog(
  text: string,
  xrefOffset: number,
  startxrefIndex: number,
): boolean {
  const section = text.slice(xrefOffset, startxrefIndex);
  if (section.startsWith("xref")) {
    const trailerIndex = section.lastIndexOf("trailer");
    if (trailerIndex < 0) return false;
    const cursor = { text, index: xrefOffset + trailerIndex + 7 };
    const dict = pdfDictionary(cursor);
    const root = dict && rootReference(dict);
    if (!root) return false;
    const offset = resolveClassicXrefObjectOffset(
      section,
      trailerIndex,
      root.object,
      root.generation,
    );
    return validCatalog(text, offset, root, xrefOffset);
  }
  const stream = xrefStreamRootOffset(text, xrefOffset);
  return !!stream && validCatalog(text, stream.location, stream.root, xrefOffset);
}
