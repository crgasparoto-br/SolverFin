import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StructuredImportError } from "@solverfin/domain";

import { classifyPopplerFailure, parsePopplerWordLayout } from "./pdf-text-extraction.js";

describe("Poppler text-position adapter", () => {
  it("extracts page boundaries, coordinates and HTML-escaped words", () => {
    const pages = parsePopplerWordLayout(`<html><body><doc>
      <page width="446.25" height="632.25">
        <word xMin="40.000" yMin="75.100" xMax="60" yMax="83">01-10-2026</word>
        <word xMin="89" yMin="75.1" xMax="130" yMax="83">Conta&amp;Servi&#231;os</word>
      </page>
      <page width="446.25" height="632.25">
        <word xMin="40" yMin="45" xMax="85" yMax="55">Saldo</word>
      </page>
    </doc></body></html>`);
    assert.equal(pages.length, 2);
    assert.deepEqual(pages[0]!.words[0], { text: "01-10-2026", x: 40, y: 75.1 });
    assert.equal(pages[0]!.words[1]?.text, "Conta&Serviços");
    assert.equal(pages[1]!.words[0]?.text, "Saldo");
  });

  it("does not accept missing pages or invalid coordinates", () => {
    assert.throws(
      () => parsePopplerWordLayout("<html>empty</html>"),
      (e: unknown) =>
        e instanceof StructuredImportError && e.code === "IMPORT_PDF_LAYOUT_UNSUPPORTED",
    );
    assert.throws(
      () => parsePopplerWordLayout('<page><word xMin="bogus" yMin="2">Text</word></page>'),
      (e: unknown) => e instanceof StructuredImportError && e.code === "IMPORT_PDF_INVALID",
    );
  });

  it("rejects truncated Poppler pages and silently omitted words", () => {
    const brokenPage =
      '<page><word xMin="20" yMin="30">valid</word><word xMin="40" yMin="30">missing';
    assert.throws(
      () => parsePopplerWordLayout(brokenPage),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_INVALID",
    );
    const brokenWord =
      '<page><word xMin="20" yMin="30">valid</word><word xMin="40" yMin="30">missing</page>';
    assert.throws(
      () => parsePopplerWordLayout(brokenWord),
      (error: unknown) =>
        error instanceof StructuredImportError && error.code === "IMPORT_PDF_INVALID",
    );
  });

  it("distinguishes missing extractor, a password-protected PDF and invalid output", () => {
    const absent = Object.assign(new Error("spawn pdftotext ENOENT"), { code: "ENOENT" });
    const missing = classifyPopplerFailure({ status: null, stderr: "", error: absent });
    assert.equal(missing?.code, "IMPORT_PDF_EXTRACTOR_UNAVAILABLE");
    assert.equal(missing?.statusCode, 503);
    assert.equal(classifyPopplerFailure({ status: 3, stderr: "" })?.code, "IMPORT_PDF_PROTECTED");
    assert.equal(
      classifyPopplerFailure({ status: 1, stderr: "Incorrect password" })?.code,
      "IMPORT_PDF_PROTECTED",
    );
    assert.equal(
      classifyPopplerFailure({ status: 1, stderr: "Invalid file" })?.code,
      "IMPORT_PDF_INVALID",
    );
    assert.equal(classifyPopplerFailure({ status: 0, stderr: "" }), undefined);
  });
});
