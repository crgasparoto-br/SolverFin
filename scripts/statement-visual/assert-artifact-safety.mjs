import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".zip",
]);
const SAFE_PLACEHOLDERS = new Set([
  "[redacted]",
  "<redacted>",
  "redacted",
  "***",
  "****",
  "dummy",
  "example",
  "not-set",
  "none",
]);

const DIRECT_RULES = [
  {
    id: "SESSION_TOKEN",
    regex: /\bsf_[A-Za-z0-9_-]{12,}\b/g,
  },
  {
    id: "BEARER_TOKEN",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  },
  {
    id: "JWT_TOKEN",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: "URL_CREDENTIAL",
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]{4,}@/gi,
  },
];

const SENSITIVE_FIELD =
  /(?:^|["'\s,{])(?<key>authorization|set-cookie|cookie|access[_-]?token|refresh[_-]?token|session(?:[_-]?token)?|api[_-]?key|client[_-]?secret|password)["']?\s*[:=]\s*["']?(?<value>[^"',\s}\]]{4,})/gim;

function lineForIndex(text, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

function isSafePlaceholder(value) {
  return SAFE_PLACEHOLDERS.has(value.trim().toLowerCase());
}

export function findSensitiveEvidence(text, file = "<memory>") {
  const findings = [];

  for (const rule of DIRECT_RULES) {
    rule.regex.lastIndex = 0;
    for (const match of text.matchAll(rule.regex)) {
      findings.push({
        file,
        line: lineForIndex(text, match.index ?? 0),
        rule: rule.id,
      });
    }
  }

  SENSITIVE_FIELD.lastIndex = 0;
  for (const match of text.matchAll(SENSITIVE_FIELD)) {
    const value = match.groups?.value ?? "";
    if (isSafePlaceholder(value)) continue;
    findings.push({
      file,
      line: lineForIndex(text, match.index ?? 0),
      rule: "SENSITIVE_FIELD",
    });
  }

  return findings;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function readArtifactText(path) {
  if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  const metadata = await stat(path);
  if (metadata.size > MAX_TEXT_BYTES) {
    throw new Error(`Artifact exceeds text-scan limit: ${path}`);
  }
  const buffer = await readFile(path);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

export async function scanArtifactDirectory(root) {
  const absoluteRoot = resolve(root);
  const findings = [];
  for (const path of await listFiles(absoluteRoot)) {
    const text = await readArtifactText(path);
    if (text === null) continue;
    findings.push(...findSensitiveEvidence(text, relative(absoluteRoot, path)));
  }
  return findings;
}

export async function assertArtifactDirectorySafe(root) {
  const findings = await scanArtifactDirectory(root);
  if (findings.length === 0) return;
  const summary = findings.map(({ file, line, rule }) => `${rule} ${file}:${line}`).join("\n");
  throw new Error(`Sensitive evidence detected; artifact upload is blocked.\n${summary}`);
}

async function main() {
  const root = process.argv[2] ?? process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
  await assertArtifactDirectorySafe(root);
  console.log(`Artifact safety validation passed for ${root}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
