import {
  type Attachment,
  TenantAuthorizationError,
  TenantError,
  type TenantContext,
} from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { parseAttachmentUpload } from "./attachment-upload.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import {
  createAttachmentForContext,
  deleteAttachmentForContext,
  getAttachmentContentForContext,
  listAttachmentsForContext,
  type AttachmentLinkedEntityKind,
} from "./repositories/attachments.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";

const BASE_PATH = "/api/attachments";
const ATTACHMENT_CONTENT_PATH = /^\/api\/attachments\/([^/]+)\/content$/;
const ATTACHMENT_ITEM_PATH = /^\/api\/attachments\/([^/]+)$/;

export async function handleAttachmentsApiRequest(
  request: ApiRequest,
): Promise<ApiResponse | undefined> {
  if (!request.pathname.startsWith(BASE_PATH)) {
    return undefined;
  }

  const correlationId = resolveCorrelationId(request.headers);

  try {
    const user = await requireAuthenticatedRequest(buildAuthHeaders(request.headers));
    const context = await resolveRequestTenantContext(
      user,
      request.query.get("profileId") ?? undefined,
    );

    if (request.method === "POST" && request.pathname === BASE_PATH) {
      return createAttachmentHandler(request, context, correlationId);
    }

    if (request.method === "GET" && request.pathname === BASE_PATH) {
      return listAttachmentsHandler(request, context);
    }

    const contentMatch = ATTACHMENT_CONTENT_PATH.exec(request.pathname);
    if (request.method === "GET" && contentMatch?.[1]) {
      return getAttachmentContentHandler(context, decodeURIComponent(contentMatch[1]));
    }

    const itemMatch = ATTACHMENT_ITEM_PATH.exec(request.pathname);
    if (request.method === "DELETE" && itemMatch?.[1]) {
      return deleteAttachmentHandler(context, decodeURIComponent(itemMatch[1]), correlationId);
    }

    return undefined;
  } catch (error) {
    const response = buildApiErrorResponse({
      error: mapDomainError(error),
      correlationId,
    });

    return {
      statusCode: response.statusCode,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: response.body,
    };
  }
}

async function createAttachmentHandler(
  request: ApiRequest,
  context: TenantContext,
  correlationId: string,
): Promise<ApiResponse> {
  const upload = parseAttachmentUpload(request.body);
  const attachment = await createAttachmentForContext(context, {
    ...upload,
    correlationId,
  });

  return json(201, { attachment: toPublicAttachment(attachment) });
}

async function listAttachmentsHandler(
  request: ApiRequest,
  context: TenantContext,
): Promise<ApiResponse> {
  const linkedEntityKind = readLinkedEntityKind(request.query.get("linkedEntityKind"));
  const linkedEntityId = request.query.get("linkedEntityId")?.trim();

  if (!linkedEntityId) {
    throw requestError(
      "ATTACHMENT_LINKED_ENTITY_REQUIRED",
      "Informe a entidade vinculada para listar anexos.",
    );
  }

  const attachments = await listAttachmentsForContext(context, linkedEntityKind, linkedEntityId);

  return json(200, {
    attachments: attachments.map(toPublicAttachment),
  });
}

async function getAttachmentContentHandler(
  context: TenantContext,
  attachmentId: string,
): Promise<ApiResponse> {
  const { attachment, content } = await getAttachmentContentForContext(context, attachmentId);
  const safeName = attachment.fileName.replace(/["\r\n]/g, "_");

  return {
    statusCode: 200,
    headers: {
      "content-type": attachment.mimeType,
      "content-length": String(content.length),
      "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(
        attachment.fileName,
      )}`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
    body: content,
  };
}

async function deleteAttachmentHandler(
  context: TenantContext,
  attachmentId: string,
  correlationId: string,
): Promise<ApiResponse> {
  const attachment = await deleteAttachmentForContext(context, attachmentId, correlationId);

  return json(200, { attachment: toPublicAttachment(attachment) });
}

function toPublicAttachment(attachment: Attachment): Record<string, unknown> {
  return {
    id: attachment.id,
    kind: attachment.kind,
    status: attachment.status,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize ?? null,
    linkedEntityId: attachment.linkedEntityId,
    linkedEntityKind: attachment.linkedEntityKind,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt,
    ...(attachment.redactedAt ? { redactedAt: attachment.redactedAt } : {}),
  };
}

function readLinkedEntityKind(value: string | null): AttachmentLinkedEntityKind {
  if (value === "transaction" || value === "invoice" || value === "import_batch") {
    return value;
  }

  throw requestError(
    "ATTACHMENT_LINKED_ENTITY_KIND_INVALID",
    "O tipo de entidade vinculada não é suportado.",
  );
}

function buildAuthHeaders(headers: Readonly<Record<string, string | undefined>>): {
  authorization?: string;
  cookie?: string;
} {
  return {
    ...(headers.authorization === undefined ? {} : { authorization: headers.authorization }),
    ...(headers.cookie === undefined ? {} : { cookie: headers.cookie }),
  };
}

function json(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  };
}

function mapDomainError(error: unknown): unknown {
  if (error instanceof TenantError) {
    return {
      code: error.code,
      statusCode: error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403,
      message: error.message,
    };
  }

  if (error instanceof TenantAuthorizationError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }

  return error;
}

function requestError(code: string, message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { code, statusCode });
}
