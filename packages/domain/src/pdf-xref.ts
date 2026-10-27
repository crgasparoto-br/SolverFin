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
    if (header === null) return undefined;
    const first = Number(header[1]);
    const count = Number(header[2]);
    const entries = lines.slice(index + 1, index + 1 + count);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(count) ||
      entries.length !== count ||
      entries.some((entry) => !/^\d{10}\s+\d{5}\s+[nf]\b/.test(entry))
    ) {
      return undefined;
    }
    const entry = entries[objectNumber - first];
    const match = entry && /^(\d{10})\s+(\d{5})\s+n\b/.exec(entry);
    if (match && Number(match[2]) === generation) resolved = Number(match[1]);
    index += count + 1;
  }
  return resolved;
}
