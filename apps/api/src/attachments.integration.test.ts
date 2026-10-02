import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import { createAccountForContext } from "./repositories/accounts.js";
import {
  createAttachmentForContext,
  deleteAttachmentForContext,
  getAttachmentContentForContext,
  listAttachmentsForContext,
} from "./repositories/attachments.js";
import { createTransactionForContext } from "./repositories/transactions.js";

const CONTEXT: TenantContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  financialProfileId: "33333333-3333-4333-8333-333333333331",
  financialProfileKind: "personal",
  userId: "11111111-1111-4111-8111-111111111111",
};

const OTHER_PROFILE_CONTEXT: TenantContext = {
  ...CONTEXT,
  financialProfileId: "33333333-3333-4333-8333-333333333332",
  financialProfileKind: "mei",
};

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for attachment integration tests.");

  const suffix = Date.now().toString(36);
  const account = await createAccountForContext(CONTEXT, {
    name: `Conta anexos ${suffix}`,
    kind: "checking",
    openingBalanceMinor: 0,
  });
  const transaction = await createTransactionForContext(CONTEXT, {
    kind: "expense",
    amountMinor: 2_500,
    occurredOn: "2028-06-10",
    accountId: account.id,
    description: `Compra com comprovante ${suffix}`,
    status: "posted",
    source: "manual",
  });
  const content = Buffer.from("%PDF-1.7\nattachment-integration");
  const contentSha256 = createHash("sha256").update(content).digest("hex");

  const created = await createAttachmentForContext(CONTEXT, {
    kind: "receipt",
    fileName: "comprovante.pdf",
    mimeType: "application/pdf",
    byteSize: content.length,
    contentSha256,
    content,
    linkedEntityKind: "transaction",
    linkedEntityId: transaction.id,
    correlationId: "corr-attachment-integration",
  });

  assert.equal(created.linkedEntityId, transaction.id);
  assert.equal(created.byteSize, content.length);

  const retried = await createAttachmentForContext(CONTEXT, {
    kind: "receipt",
    fileName: "outro-nome.pdf",
    mimeType: "application/pdf",
    byteSize: content.length,
    contentSha256,
    content,
    linkedEntityKind: "transaction",
    linkedEntityId: transaction.id,
  });
  assert.equal(retried.id, created.id, "identical retry must not duplicate the active attachment");

  const listed = await listAttachmentsForContext(CONTEXT, "transaction", transaction.id);
  assert.equal(listed.filter((attachment) => attachment.id === created.id).length, 1);

  const downloaded = await getAttachmentContentForContext(CONTEXT, created.id);
  assert.deepEqual(downloaded.content, content);

  await assert.rejects(
    () => listAttachmentsForContext(OTHER_PROFILE_CONTEXT, "transaction", transaction.id),
    hasCode("ATTACHMENT_LINKED_ENTITY_NOT_FOUND"),
  );
  await assert.rejects(
    () => getAttachmentContentForContext(OTHER_PROFILE_CONTEXT, created.id),
    hasCode("ATTACHMENT_NOT_FOUND"),
  );
  await assert.rejects(
    () =>
      createAttachmentForContext(CONTEXT, {
        kind: "receipt",
        fileName: "inexistente.pdf",
        mimeType: "application/pdf",
        byteSize: content.length,
        contentSha256,
        content,
        linkedEntityKind: "transaction",
        linkedEntityId: "99999999-9999-4999-8999-999999999999",
      }),
    hasCode("ATTACHMENT_LINKED_ENTITY_NOT_FOUND"),
  );

  const redactedContent = Buffer.from("%PDF-1.7\nattachment-redacted");
  const redacted = await createAttachmentForContext(CONTEXT, {
    kind: "receipt",
    fileName: "comprovante-redacted.pdf",
    mimeType: "application/pdf",
    byteSize: redactedContent.length,
    contentSha256: createHash("sha256").update(redactedContent).digest("hex"),
    content: redactedContent,
    linkedEntityKind: "transaction",
    linkedEntityId: transaction.id,
  });

  await query(
    `update "Attachment"
        set "status" = 'REDACTED',
            "redactedAt" = $1,
            "updatedAt" = $1
      where "id" = $2
        and "organizationId" = $3
        and "financialProfileId" = $4`,
    [new Date(), redacted.id, CONTEXT.organizationId, CONTEXT.financialProfileId],
  );

  const afterRedaction = await listAttachmentsForContext(CONTEXT, "transaction", transaction.id);
  assert.equal(
    afterRedaction.some((attachment) => attachment.id === redacted.id),
    false,
    "redacted attachments must not be enumerated in normal listings",
  );
  await assert.rejects(
    () => getAttachmentContentForContext(CONTEXT, redacted.id),
    hasCode("ATTACHMENT_NOT_FOUND"),
    "redacted attachments must not expose content through normal access",
  );

  const deleted = await deleteAttachmentForContext(CONTEXT, created.id);
  assert.equal(deleted.status, "deleted");
  const deletedAgain = await deleteAttachmentForContext(CONTEXT, created.id);
  assert.equal(deletedAgain.status, "deleted");

  const afterDelete = await listAttachmentsForContext(CONTEXT, "transaction", transaction.id);
  assert.equal(
    afterDelete.some((attachment) => attachment.id === created.id),
    false,
  );
  await assert.rejects(
    () => getAttachmentContentForContext(CONTEXT, created.id),
    hasCode("ATTACHMENT_NOT_FOUND"),
  );
}

function hasCode(expected: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    typeof error === "object" && error !== null && "code" in error && error.code === expected;
}
