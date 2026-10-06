import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachmentWorkspaceScript, renderAttachmentWorkspace } from "./attachment-workspace.js";

describe("operational attachment workspace", () => {
  it("renders a private attachment control for a persisted entity", () => {
    const html = renderAttachmentWorkspace({
      entityKind: "invoice",
      entityId: "invoice-1",
      title: "Anexos da fatura",
    });

    assert.match(html, /data-attachment-workspace/);
    assert.match(html, /data-entity-kind="invoice"/);
    assert.match(html, /data-entity-id="invoice-1"/);
    assert.match(html, /Até 5 MiB/);
    assert.doesNotMatch(html, /storageKey/);
  });

  it("keeps a transaction workspace hidden until a persisted transaction is selected", () => {
    const html = renderAttachmentWorkspace({
      entityKind: "transaction",
      title: "Anexos do lançamento",
    });

    assert.match(html, /data-entity-id=""/);
    assert.match(html, / hidden>/);
  });

  it("uses authenticated API routes for list, upload, open and logical deletion", () => {
    const script = attachmentWorkspaceScript();

    assert.match(script, /\/api\/attachments\?linkedEntityKind=/);
    assert.match(script, /fetch\(withProfile\("\/api\/attachments"\)/);
    assert.match(script, /\/content/);
    assert.match(script, /method: "DELETE"/);
    assert.match(script, /profileId/);
    assert.doesNotMatch(script, /storageKey/);
  });
});
