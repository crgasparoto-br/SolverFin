import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ATTACHMENT_MAX_BYTES,
  parseAttachmentUpload,
} from "./attachment-upload.js";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "receipt",
    fileName: "comprovante.pdf",
    mimeType: "application/pdf",
    linkedEntityKind: "transaction",
    linkedEntityId: "22222222-2222-4222-8222-222222222222",
    contentBase64: Buffer.from("%PDF-1.7\nfixture").toString("base64"),
    ...overrides,
  };
}

describe("parseAttachmentUpload", () => {
  it("accepts a valid attachment and sanitizes traversal from the display name", () => {
    const parsed = parseAttachmentUpload(
      body({ fileName: "../../segredo/comprovante.pdf" }),
    );

    assert.equal(parsed.fileName, "comprovante.pdf");
    assert.equal(parsed.mimeType, "application/pdf");
    assert.equal(parsed.linkedEntityKind, "transaction");
    assert.equal(parsed.byteSize, Buffer.from("%PDF-1.7\nfixture").length);
    assert.match(parsed.contentSha256, /^[0-9a-f]{64}$/);
  });

  it("rejects an unsupported MIME", () => {
    assert.throws(
      () => parseAttachmentUpload(body({ mimeType: "application/x-msdownload" })),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_MIME_NOT_ALLOWED",
    );
  });

  it("rejects a mismatched extension", () => {
    assert.throws(
      () => parseAttachmentUpload(body({ fileName: "comprovante.png" })),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_EXTENSION_MISMATCH",
    );
  });

  it("rejects a mismatched file signature", () => {
    assert.throws(
      () =>
        parseAttachmentUpload(
          body({ contentBase64: Buffer.from("not-a-pdf").toString("base64") }),
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_CONTENT_MISMATCH",
    );
  });

  it("rejects empty files", () => {
    assert.throws(
      () =>
        parseAttachmentUpload(
          body({ contentBase64: Buffer.alloc(0).toString("base64") }),
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_CONTENT_REQUIRED",
    );
  });

  it("rejects files above the documented limit", () => {
    const oversized = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0x61);

    assert.throws(
      () =>
        parseAttachmentUpload(
          body({
            fileName: "arquivo.txt",
            mimeType: "text/plain",
            contentBase64: oversized.toString("base64"),
          }),
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_TOO_LARGE",
    );
  });

  it("rejects ai_suggestion as a public upload journey", () => {
    assert.throws(
      () => parseAttachmentUpload(body({ linkedEntityKind: "ai_suggestion" })),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ATTACHMENT_LINKED_ENTITY_KIND_INVALID",
    );
  });
});
