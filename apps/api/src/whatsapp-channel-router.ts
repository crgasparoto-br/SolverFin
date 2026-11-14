import type { IncomingMessage } from "node:http";

import { TenantAuthorizationError, TenantError } from "@solverfin/domain";

import { requireAuthenticatedRequest } from "./auth-service.js";
import { buildApiErrorResponse, resolveCorrelationId } from "./errors.js";
import type { ApiRequest, ApiResponse } from "./router.js";
import { resolveRequestTenantContext } from "./tenant-context.js";
import {
  createMetaCloudApiOutbound,
  parseMetaInboundMessages,
  requireMetaWebhookConfig,
  verifyMetaSignature,
  verifyMetaSubscription,
  type ChannelOutboundPort,
  type MetaChannelEnvironment,
} from "./whatsapp-channel-provider.js";
import {
  cancelWhatsappPairing,
  confirmWhatsappPairing,
  createWhatsappPairing,
  listWhatsappLinks,
  revokeWhatsappLink,
  WhatsappChannelError,
} from "./whatsapp-channel-repository.js";
import { processInboundChannelMessage } from "./whatsapp-channel-service.js";

const MANAGEMENT_BASE = "/api/channels/whatsapp";
const WEBHOOK_PATH = "/api/webhooks/whatsapp";
const LINK_ACTION =
  /^\/api\/channels\/whatsapp\/(pairings|links)\/([0-9a-f-]{36})\/(confirm|cancel|revoke)$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WEBHOOK_BYTES = 256 * 1024;

function response(statusCode: number, body: unknown): ApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function readExplicitProfileId(request: ApiRequest): string {
  // Explicit selection is mandatory, including accounts with one default profile.
  const body = request.body;
  const fromBody =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).profileId
      : undefined;
  const queryProfiles = request.query.getAll("profileId");
  // A conflicting body/query pair or duplicated query parameter is ambiguous.
  // Never pick a different authorized financial profile by precedence alone.
  if (
    queryProfiles.length > 1 ||
    (queryProfiles.length === 1 && fromBody !== undefined && queryProfiles[0] !== fromBody)
  ) {
    throw new WhatsappChannelError("WHATSAPP_EXPLICIT_PROFILE_REQUIRED", 400);
  }
  const profileId = queryProfiles[0] ?? fromBody;
  if (typeof profileId !== "string" || !UUID_PATTERN.test(profileId)) {
    throw new WhatsappChannelError("WHATSAPP_EXPLICIT_PROFILE_REQUIRED", 400);
  }
  return profileId;
}

/** Manage the link exclusively through an authenticated SolverFin session. */
export async function handleWhatsappChannelManagementApiRequest(
  request: ApiRequest,
  env: MetaChannelEnvironment = process.env,
): Promise<ApiResponse | undefined> {
  if (request.pathname !== MANAGEMENT_BASE && !request.pathname.startsWith(MANAGEMENT_BASE + "/"))
    return undefined;
  const correlationId = resolveCorrelationId(request.headers);
  try {
    const user = await requireAuthenticatedRequest({
      ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
    });
    const profileId = readExplicitProfileId(request);
    const context = await resolveRequestTenantContext(user, profileId);
    const { accountId } = requireMetaWebhookConfig(env);
    if (request.method === "POST" && request.pathname === MANAGEMENT_BASE + "/pairings") {
      return response(201, {
        pairing: await createWhatsappPairing(context, accountId),
        instructions:
          "Envie VINCULAR seguido do código para o número oficial. Depois confirme no SolverFin.",
      });
    }
    if (request.method === "GET" && request.pathname === MANAGEMENT_BASE + "/links") {
      return response(200, { links: await listWhatsappLinks(context) });
    }
    const action = LINK_ACTION.exec(request.pathname);
    if (!action || request.method !== "POST") return undefined;
    const scope = action[1];
    const id = action[2]!;
    const verb = action[3];
    if (!UUID_PATTERN.test(id)) throw new WhatsappChannelError("WHATSAPP_LINK_ID_INVALID", 400);
    if (scope === "pairings" && verb === "confirm") {
      return response(200, { link: await confirmWhatsappPairing(context, id) });
    }
    if (scope === "pairings" && verb === "cancel") {
      await cancelWhatsappPairing(context, id);
      return response(200, { state: "cancelled" });
    }
    if (scope === "links" && verb === "revoke") {
      await revokeWhatsappLink(context, id);
      return response(200, { state: "revoked" });
    }
    return undefined;
  } catch (error) {
    const mapped =
      error instanceof TenantError
        ? {
            code: error.code,
            message: "Perfil financeiro não autorizado.",
            statusCode: error.code === "TENANT_PROFILE_REQUIRED" ? 404 : 403,
          }
        : error instanceof TenantAuthorizationError
          ? {
              code: error.code,
              message: "Perfil financeiro não autorizado.",
              statusCode: error.statusCode,
            }
          : error;
    const failure = buildApiErrorResponse({ error: mapped, correlationId });
    return response(failure.statusCode, failure.body);
  }
}

export interface WhatsappWebhookHttpRequest {
  method: string;
  query: URLSearchParams;
  headers: Readonly<Record<string, string | undefined>>;
  rawBody: Buffer;
}

export interface WebhookHttpResult {
  statusCode: number;
  contentType: "application/json; charset=utf-8" | "text/plain; charset=utf-8";
  body: string;
}

export async function handleWhatsappChannelWebhook(
  request: WhatsappWebhookHttpRequest,
  options: {
    env?: MetaChannelEnvironment;
    outbound?: ChannelOutboundPort;
    processMessage?: typeof processInboundChannelMessage;
  } = {},
): Promise<WebhookHttpResult> {
  let config: ReturnType<typeof requireMetaWebhookConfig>;
  try {
    config = requireMetaWebhookConfig(options.env ?? process.env);
  } catch {
    return { statusCode: 503, contentType: "text/plain; charset=utf-8", body: "Unavailable" };
  }
  if (request.method === "GET") {
    const challenge = verifyMetaSubscription(request.query, config.verifyToken);
    return {
      statusCode: challenge === null ? 403 : 200,
      contentType: "text/plain; charset=utf-8",
      body: challenge ?? "Forbidden",
    };
  }
  if (request.method !== "POST") {
    return {
      statusCode: 405,
      contentType: "text/plain; charset=utf-8",
      body: "Method not allowed",
    };
  }
  if (request.rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    return { statusCode: 413, contentType: "text/plain; charset=utf-8", body: "Too large" };
  }
  if (
    !verifyMetaSignature(request.rawBody, request.headers["x-hub-signature-256"], config.appSecret)
  ) {
    return { statusCode: 403, contentType: "text/plain; charset=utf-8", body: "Forbidden" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(request.rawBody.toString("utf8"));
  } catch {
    return { statusCode: 400, contentType: "text/plain; charset=utf-8", body: "Invalid JSON" };
  }
  let incoming: ReturnType<typeof parseMetaInboundMessages>;
  try {
    incoming = parseMetaInboundMessages(payload, config.accountId);
  } catch {
    return { statusCode: 400, contentType: "text/plain; charset=utf-8", body: "Invalid event" };
  }
  if (!incoming.length) {
    return {
      statusCode: 200,
      contentType: "application/json; charset=utf-8",
      body: '{"received":true}',
    };
  }
  let outbound: ChannelOutboundPort;
  try {
    outbound = options.outbound ?? createMetaCloudApiOutbound(options.env ?? process.env);
  } catch {
    return { statusCode: 503, contentType: "text/plain; charset=utf-8", body: "Unavailable" };
  }
  for (const message of incoming) {
    try {
      await (options.processMessage ?? processInboundChannelMessage)(message, outbound);
    } catch {
      // Failure must be returned to Meta so the same signed event is retried.
      // Never echo provider payloads or secrets in the response.
      return { statusCode: 503, contentType: "text/plain; charset=utf-8", body: "Retry later" };
    }
  }
  return {
    statusCode: 200,
    contentType: "application/json; charset=utf-8",
    body: '{"received":true}',
  };
}

export async function readWhatsappRawBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_WEBHOOK_BYTES) {
      throw new WhatsappChannelError("WHATSAPP_WEBHOOK_BODY_TOO_LARGE", 413);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export const WhatsappWebhookPath = WEBHOOK_PATH;
