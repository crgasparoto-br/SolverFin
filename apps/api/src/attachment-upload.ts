import { createHash } from "node:crypto";
import { extname } from "node:path";

import type { AttachmentKind } from "@solverfin/domain";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_KINDS = new Set<AttachmentKind>([
  "receipt",
  "invoice",
  "statement",
  "message",
  "contract",
  "other",
]);

const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

export interface ParsedAttachmentUpload {
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentSha256: string;
  content: Buffer;
  linkedEntityKind: "transaction" | "invoice" | "import_batch";
  linkedEntityId: string;
}

export function parseAttachmentUpload(body: unknown): ParsedAttachmentUpload {
  const input = requireObject(body);
  const kind = readAttachmentKind(input.kind);
  const linkedEntityKind = readLinkedEntityKind(input.linkedEntityKind);
  const linkedEntityId = readRequiredString(
    input.linkedEntityId,
    "ATTACHMENT_LINKED_ENTITY_REQUIRED",
  );
  const mimeType = readMimeType(input.mimeType);
  const fileName = sanitizeAttachmentFileName(
    readRequiredString(input.fileName, "ATTACHMENT_FILE_NAME_REQUIRED"),
  );
  const content = decodeBase64(input.contentBase64);

  if (content.length === 0) {
    throw uploadError("ATTACHMENT_EMPTY", "O arquivo não pode estar vazio.");
  }

  if (content.length > ATTACHMENT_MAX_BYTES) {
    throw uploadError("ATTACHMENT_TOO_LARGE", "O arquivo excede o limite de 5 MiB.", 413);
  }

  assertExtensionMatchesMime(fileName, mimeType);
  assertContentSignature(content, mimeType);

  return {
    kind,
    fileName,
    mimeType,
    byteSize: content.length,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    content,
    linkedEntityKind,
    linkedEntityId,
  };
}

export function sanitizeAttachmentFileName(value: string): string {
  const normalized = value.normalize("NFKC").replaceAll("\\", "/");
  const baseName = normalized.split("/").pop()?.trim() ?? "";
  const withoutControlCharacters = Array.from(baseName)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
    .join("");
  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw uploadError("ATTACHMENT_FILE_NAME_INVALID", "Informe um nome de arquivo válido.");
  }

  return cleaned;
}

function readAttachmentKind(value: unknown): AttachmentKind {
  if (typeof value !== "string" || !ALLOWED_ATTACHMENT_KINDS.has(value as AttachmentKind)) {
    throw uploadError("ATTACHMENT_KIND_INVALID", "O tipo funcional do anexo não é suportado.");
  }

  return value as AttachmentKind;
}

function readLinkedEntityKind(value: unknown): "transaction" | "invoice" | "import_batch" {
  if (value === "transaction" || value === "invoice" || value === "import_batch") {
    return value;
  }

  throw uploadError(
    "ATTACHMENT_LINKED_ENTITY_KIND_INVALID",
    "O tipo de entidade vinculada não é suportado para upload.",
  );
}

function readMimeType(value: unknown): string {
  const mimeType = readRequiredString(value, "ATTACHMENT_MIME_REQUIRED").toLowerCase();
  if (!(mimeType in MIME_EXTENSIONS)) {
    throw uploadError("ATTACHMENT_MIME_NOT_ALLOWED", "O tipo de arquivo não é permitido.");
  }

  return mimeType;
}

function readRequiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw uploadError(code, "Preencha os dados obrigatórios do anexo.");
  }

  return value.trim();
}

function decodeBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.trim() === "") {
    throw uploadError("ATTACHMENT_CONTENT_REQUIRED", "Envie o conteúdo do arquivo.");
  }

  const normalized = value.replace(/\s+/g, "");
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw uploadError("ATTACHMENT_CONTENT_INVALID", "O conteúdo do arquivo é inválido.");
  }

  const content = Buffer.from(normalized, "base64");
  const canonical = content.toString("base64");

  if (canonical.replace(/=+$/u, "") !== normalized.replace(/=+$/u, "")) {
    throw uploadError("ATTACHMENT_CONTENT_INVALID", "O conteúdo do arquivo é inválido.");
  }

  return content;
}

function assertExtensionMatchesMime(fileName: string, mimeType: string): void {
  const extension = extname(fileName).toLowerCase();
  if (!extension) {
    return;
  }

  const expected = MIME_EXTENSIONS[mimeType] ?? [];
  if (!expected.includes(extension)) {
    throw uploadError(
      "ATTACHMENT_EXTENSION_MISMATCH",
      "A extensão do arquivo não corresponde ao tipo informado.",
    );
  }
}

function assertContentSignature(content: Buffer, mimeType: string): void {
  let matches = true;

  if (mimeType === "application/pdf") {
    matches = content.subarray(0, 5).toString("ascii") === "%PDF-";
  } else if (mimeType === "image/png") {
    matches = content
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } else if (mimeType === "image/jpeg") {
    matches =
      content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  } else if (mimeType === "image/webp") {
    matches =
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WEBP";
  } else if (mimeType === "application/vnd.ms-excel") {
    matches = content
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  } else if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    matches = content.subarray(0, 2).toString("ascii") === "PK";
  }

  if (!matches) {
    throw uploadError(
      "ATTACHMENT_CONTENT_MISMATCH",
      "O conteúdo do arquivo não corresponde ao tipo informado.",
    );
  }
}

function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw uploadError("ATTACHMENT_BODY_INVALID", "Envie os dados do anexo em formato JSON.");
  }

  return body as Record<string, unknown>;
}

function uploadError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
