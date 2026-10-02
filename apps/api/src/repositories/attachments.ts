import { createHash, randomUUID } from "node:crypto";

import type {
  Attachment,
  AttachmentKind,
  AttachmentStatus,
  EntityId,
  TenantContext,
} from "@solverfin/domain";

import { type QueryExecutor, query, withTransaction } from "../db.js";
import { insertAuditLogEntry } from "./audit.js";

export type AttachmentLinkedEntityKind =
  | "transaction"
  | "invoice"
  | "import_batch"
  | "ai_suggestion";

export interface CreateAttachmentPayload {
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentSha256: string;
  content: Buffer;
  linkedEntityId: EntityId;
  linkedEntityKind: AttachmentLinkedEntityKind;
  correlationId?: string;
}

export interface AttachmentContent {
  attachment: Attachment;
  content: Buffer;
}

interface AttachmentRow {
  id: string;
  organizationId: string;
  financialProfileId: string;
  kind: string;
  status: string;
  fileName: string;
  mimeType: string;
  byteSize: number | null;
  contentSha256: string | null;
  storageKey: string;
  linkedEntityId: string;
  linkedEntityKind: string;
  redactedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AttachmentContentRow extends AttachmentRow {
  content: Buffer | null;
}

const ATTACHMENT_COLUMNS = `"id", "organizationId", "financialProfileId", "kind", "status",
  "fileName", "mimeType", "byteSize", "contentSha256", "storageKey", "linkedEntityId",
  "linkedEntityKind", "redactedAt", "createdAt", "updatedAt"`;

export async function createAttachmentForContext(
  context: TenantContext,
  input: CreateAttachmentPayload,
): Promise<Attachment> {
  return withTransaction(async (executeQuery) => {
    await assertLinkedEntityForContext(
      executeQuery,
      context,
      input.linkedEntityKind,
      input.linkedEntityId,
    );

    const existing = await executeQuery<AttachmentRow>(
      `select ${ATTACHMENT_COLUMNS}
         from "Attachment"
        where "organizationId" = $1
          and "financialProfileId" = $2
          and "linkedEntityKind" = $3
          and "linkedEntityId" = $4
          and "kind" = $5
          and "mimeType" = $6
          and "contentSha256" = $7
          and "status" = 'ACTIVE'
        order by "createdAt" desc
        limit 1`,
      [
        context.organizationId,
        context.financialProfileId,
        toDatabaseLinkedEntityKind(input.linkedEntityKind),
        input.linkedEntityId,
        input.kind.toUpperCase(),
        input.mimeType,
        input.contentSha256,
      ],
    );

    if (existing[0] !== undefined) {
      return mapAttachment(existing[0]);
    }

    const id = randomUUID();
    const storageKey = `attachment/${randomUUID()}`;
    const now = new Date();

    await executeQuery(
      `insert into "AttachmentObject"
        ("storageKey", "content", "byteSize", "contentSha256", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $5)`,
      [storageKey, input.content, input.byteSize, input.contentSha256, now],
    );

    const rows = await executeQuery<AttachmentRow>(
      `insert into "Attachment"
        ("id", "organizationId", "financialProfileId", "kind", "status", "fileName",
         "mimeType", "byteSize", "contentSha256", "storageKey", "linkedEntityId",
         "linkedEntityKind", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8, $9, $10, $11, $12, $12)
       returning ${ATTACHMENT_COLUMNS}`,
      [
        id,
        context.organizationId,
        context.financialProfileId,
        input.kind.toUpperCase(),
        input.fileName,
        input.mimeType,
        input.byteSize,
        input.contentSha256,
        storageKey,
        input.linkedEntityId,
        toDatabaseLinkedEntityKind(input.linkedEntityKind),
        now,
      ],
    );
    const row = rows[0];
    if (row === undefined) {
      throw attachmentError(
        "ATTACHMENT_CREATE_FAILED",
        "Não foi possível registrar o anexo.",
        500,
      );
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now.toISOString(),
      actorKind: "user",
      actorId: context.userId,
      action: "create",
      entityKind: "attachment",
      entityId: id,
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      reason: "attachment_uploaded",
    });

    return mapAttachment(row);
  });
}

export async function listAttachmentsForContext(
  context: TenantContext,
  linkedEntityKind: AttachmentLinkedEntityKind,
  linkedEntityId: EntityId,
): Promise<Attachment[]> {
  await assertLinkedEntityForContext(
    query,
    context,
    linkedEntityKind,
    linkedEntityId,
  );

  const rows = await query<AttachmentRow>(
    `select ${ATTACHMENT_COLUMNS}
       from "Attachment"
      where "organizationId" = $1
        and "financialProfileId" = $2
        and "linkedEntityKind" = $3
        and "linkedEntityId" = $4
        and "status" = 'ACTIVE'
      order by "createdAt" desc, "id" desc`,
    [
      context.organizationId,
      context.financialProfileId,
      toDatabaseLinkedEntityKind(linkedEntityKind),
      linkedEntityId,
    ],
  );

  return rows.map(mapAttachment);
}

export async function getAttachmentContentForContext(
  context: TenantContext,
  attachmentId: EntityId,
): Promise<AttachmentContent> {
  const rows = await query<AttachmentContentRow>(
    `select a."id", a."organizationId", a."financialProfileId", a."kind", a."status",
            a."fileName", a."mimeType", a."byteSize", a."contentSha256", a."storageKey",
            a."linkedEntityId", a."linkedEntityKind", a."redactedAt", a."createdAt",
            a."updatedAt", o."content"
       from "Attachment" a
       left join "AttachmentObject" o on o."storageKey" = a."storageKey"
      where a."id" = $1
        and a."organizationId" = $2
        and a."financialProfileId" = $3
      limit 1`,
    [attachmentId, context.organizationId, context.financialProfileId],
  );
  const row = rows[0];

  if (row === undefined || row.status !== "ACTIVE") {
    throw attachmentError("ATTACHMENT_NOT_FOUND", "Anexo não encontrado.", 404);
  }

  const linkedEntityKind = fromDatabaseLinkedEntityKind(
    row.linkedEntityKind,
  );
  await assertLinkedEntityForContext(
    query,
    context,
    linkedEntityKind,
    row.linkedEntityId,
  );

  if (!Buffer.isBuffer(row.content)) {
    throw attachmentError(
      "ATTACHMENT_CONTENT_UNAVAILABLE",
      "O conteúdo deste anexo não está disponível.",
      409,
    );
  }

  if (row.byteSize !== null) {
    const actualHash = createHash("sha256").update(row.content).digest("hex");
    if (
      row.content.length !== row.byteSize ||
      row.contentSha256 === null ||
      actualHash !== row.contentSha256
    ) {
      throw attachmentError(
        "ATTACHMENT_CONTENT_INTEGRITY_FAILED",
        "O conteúdo deste anexo não está íntegro.",
        409,
      );
    }
  }

  return { attachment: mapAttachment(row), content: row.content };
}

export async function deleteAttachmentForContext(
  context: TenantContext,
  attachmentId: EntityId,
  correlationId?: string,
): Promise<Attachment> {
  return withTransaction(async (executeQuery) => {
    const rows = await executeQuery<AttachmentRow>(
      `select ${ATTACHMENT_COLUMNS}
         from "Attachment"
        where "id" = $1
          and "organizationId" = $2
          and "financialProfileId" = $3
        for update`,
      [attachmentId, context.organizationId, context.financialProfileId],
    );
    const current = rows[0];

    if (current === undefined) {
      throw attachmentError(
        "ATTACHMENT_NOT_FOUND",
        "Anexo não encontrado.",
        404,
      );
    }

    await assertLinkedEntityForContext(
      executeQuery,
      context,
      fromDatabaseLinkedEntityKind(current.linkedEntityKind),
      current.linkedEntityId,
    );

    if (current.status === "DELETED") {
      return mapAttachment(current);
    }

    const now = new Date();
    const updatedRows = await executeQuery<AttachmentRow>(
      `update "Attachment"
          set "status" = 'DELETED',
              "updatedAt" = $1
        where "id" = $2
          and "organizationId" = $3
          and "financialProfileId" = $4
        returning ${ATTACHMENT_COLUMNS}`,
      [now, attachmentId, context.organizationId, context.financialProfileId],
    );
    const updated = updatedRows[0];
    if (updated === undefined) {
      throw attachmentError("ATTACHMENT_NOT_FOUND", "Anexo não encontrado.", 404);
    }

    await insertAuditLogEntry(executeQuery, {
      organizationId: context.organizationId,
      financialProfileId: context.financialProfileId,
      occurredAt: now.toISOString(),
      actorKind: "user",
      actorId: context.userId,
      action: "soft_delete",
      entityKind: "attachment",
      entityId: attachmentId,
      ...(correlationId ? { correlationId } : {}),
      reason: "attachment_deleted",
    });

    return mapAttachment(updated);
  });
}

async function assertLinkedEntityForContext(
  executeQuery: QueryExecutor,
  context: TenantContext,
  kind: AttachmentLinkedEntityKind,
  linkedEntityId: EntityId,
): Promise<void> {
  const table = linkedEntityTable(kind);
  const rows = await executeQuery<{ id: string }>(
    `select "id"
       from "${table}"
      where "id" = $1
        and "organizationId" = $2
        and "financialProfileId" = $3
      limit 1`,
    [linkedEntityId, context.organizationId, context.financialProfileId],
  );

  if (rows[0] === undefined) {
    throw attachmentError(
      "ATTACHMENT_LINKED_ENTITY_NOT_FOUND",
      "A entidade vinculada não foi encontrada neste perfil.",
      404,
    );
  }
}

function linkedEntityTable(kind: AttachmentLinkedEntityKind): string {
  switch (kind) {
    case "transaction":
      return "Transaction";
    case "invoice":
      return "Invoice";
    case "import_batch":
      return "ImportBatch";
    case "ai_suggestion":
      return "AiSuggestion";
  }
}

function toDatabaseLinkedEntityKind(kind: AttachmentLinkedEntityKind): string {
  return kind.toUpperCase();
}

function fromDatabaseLinkedEntityKind(value: string): AttachmentLinkedEntityKind {
  switch (value) {
    case "TRANSACTION":
      return "transaction";
    case "INVOICE":
      return "invoice";
    case "IMPORT_BATCH":
      return "import_batch";
    case "AI_SUGGESTION":
      return "ai_suggestion";
    default:
      throw attachmentError(
        "ATTACHMENT_LINKED_ENTITY_INVALID",
        "O vínculo deste anexo não é suportado.",
        409,
      );
  }
}

function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    financialProfileId: row.financialProfileId,
    kind: row.kind.toLowerCase() as AttachmentKind,
    status: row.status.toLowerCase() as AttachmentStatus,
    fileName: row.fileName,
    mimeType: row.mimeType,
    ...(row.byteSize !== null ? { byteSize: row.byteSize } : {}),
    ...(row.contentSha256 !== null ? { contentSha256: row.contentSha256 } : {}),
    storageKey: row.storageKey,
    linkedEntityId: row.linkedEntityId,
    linkedEntityKind: fromDatabaseLinkedEntityKind(row.linkedEntityKind),
    ...(row.redactedAt ? { redactedAt: row.redactedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function attachmentError(code: string, message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
