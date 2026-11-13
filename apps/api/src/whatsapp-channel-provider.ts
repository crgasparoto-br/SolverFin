import { createHmac, timingSafeEqual } from "node:crypto";

export interface ChannelInboundMessage {
  provider: "meta_whatsapp";
  accountId: string;
  externalMessageId: string;
  senderId: string;
  text: string | null;
  receivedAt: Date;
}

export interface ChannelOutboundPort {
  sendText(message: {
    accountId: string;
    recipientId: string;
    text: string;
  }): Promise<string | null>;
}

export class ChannelProviderError extends Error {
  readonly code: string;
  readonly knownNotSent: boolean;

  constructor(code: string, knownNotSent = false) {
    super(code);
    this.name = "ChannelProviderError";
    this.code = code;
    this.knownNotSent = knownNotSent;
  }
}

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;
const PROVIDER_MESSAGE_ID = /^[a-zA-Z0-9_.:-]{4,200}$/;
const EXTERNAL_SENDER_ID = /^\d{6,30}$/;
const META_ID = /^\d{5,30}$/;
const MAX_MESSAGES = 1000;

export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  const match = header?.match(SIGNATURE_PATTERN);
  if (!appSecret || !match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(match[1]!, "hex");
  return provided.length === expected.length && timingSafeEqual(expected, provided);
}

export function verifyMetaSubscription(
  query: URLSearchParams,
  verifyToken: string,
): string | null {
  const challenge = query.get("hub.challenge");
  const provided = query.get("hub.verify_token");
  if (
    !verifyToken ||
    !provided ||
    query.get("hub.mode") !== "subscribe" ||
    !challenge ||
    challenge.length > 256
  ) return null;
  const expectedBytes = Buffer.from(verifyToken, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
    ? challenge
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMetaInboundMessages(
  payload: unknown,
  expectedAccountId: string,
  now = new Date(),
): ChannelInboundMessage[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) {
    throw new ChannelProviderError("WHATSAPP_WEBHOOK_PAYLOAD_INVALID", true);
  }
  const received: ChannelInboundMessage[] = [];
  for (const entry of root.entry) {
    const changes = record(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const update = record(change);
      if (update?.field !== "messages") continue;
      const value = record(update.value);
      const metadata = record(value?.metadata);
      if (!metadata || metadata.phone_number_id !== expectedAccountId) {
        // A callback from an unrelated Meta app/number cannot route into this tenant.
        continue;
      }
      if (!Array.isArray(value?.messages)) continue;
      for (const entryMessage of value.messages) {
        const message = record(entryMessage);
        if (!message) continue;
        const id = message.id;
        const sender = message.from;
        if (
          typeof id !== "string" || !PROVIDER_MESSAGE_ID.test(id) ||
          typeof sender !== "string" || !EXTERNAL_SENDER_ID.test(sender)
        ) continue;
        const text = message.type === "text" ? record(message.text)?.body : null;
        const timestamp = typeof message.timestamp === "string" && /^\d{10}$/.test(message.timestamp)
          ? new Date(Number(message.timestamp) * 1000)
          : now;
        received.push({
          provider: "meta_whatsapp",
          accountId: expectedAccountId,
          externalMessageId: id,
          senderId: sender,
          text: typeof text === "string" ? text : null,
          receivedAt: Number.isFinite(timestamp.getTime()) ? timestamp : now,
        });
        if (received.length > MAX_MESSAGES) {
          throw new ChannelProviderError("WHATSAPP_WEBHOOK_BATCH_TOO_LARGE", true);
        }
      }
    }
  }
  return received;
}

export interface MetaChannelEnvironment {
  WHATSAPP_META_APP_SECRET?: string;
  WHATSAPP_META_VERIFY_TOKEN?: string;
  WHATSAPP_META_ACCESS_TOKEN?: string;
  WHATSAPP_META_PHONE_NUMBER_ID?: string;
  WHATSAPP_META_GRAPH_VERSION?: string;
}

export function requireMetaWebhookConfig(env: MetaChannelEnvironment): {
  appSecret: string; verifyToken: string; accountId: string;
} {
  if (
    !env.WHATSAPP_META_APP_SECRET ||
    !env.WHATSAPP_META_VERIFY_TOKEN ||
    !env.WHATSAPP_META_PHONE_NUMBER_ID ||
    !META_ID.test(env.WHATSAPP_META_PHONE_NUMBER_ID)
  ) {
    throw new ChannelProviderError("WHATSAPP_NOT_CONFIGURED", true);
  }
  return {
    appSecret: env.WHATSAPP_META_APP_SECRET,
    verifyToken: env.WHATSAPP_META_VERIFY_TOKEN,
    accountId: env.WHATSAPP_META_PHONE_NUMBER_ID,
  };
}

export function createMetaCloudApiOutbound(
  env: MetaChannelEnvironment,
  transport: typeof fetch = fetch,
): ChannelOutboundPort {
  const accountId = env.WHATSAPP_META_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_META_ACCESS_TOKEN;
  const version = env.WHATSAPP_META_GRAPH_VERSION;
  if (!accountId || !META_ID.test(accountId) || !accessToken || !version ||
      !/^v\d{1,2}\.\d{1,2}$/.test(version)) {
    throw new ChannelProviderError("WHATSAPP_OUTBOUND_NOT_CONFIGURED", true);
  }

  return {
    async sendText(message) {
      if (message.accountId !== accountId || !EXTERNAL_SENDER_ID.test(message.recipientId)) {
        throw new ChannelProviderError("WHATSAPP_OUTBOUND_TARGET_INVALID", true);
      }
      // Only graph.facebook.com is permitted; neither the inbound message nor a caller
      // can select the URL or supply authorization headers.
      let response: Response;
      try {
        response = await transport(
          `https://graph.facebook.com/${version}/${accountId}/messages`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: message.recipientId,
              type: "text",
              text: { preview_url: false, body: message.text.slice(0, 4000) },
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
      } catch {
        // An interrupted network request might have been accepted by Meta: never
        // retry it automatically and risk sending a second financial response.
        throw new ChannelProviderError("WHATSAPP_OUTBOUND_RESULT_UNKNOWN");
      }
      if (!response.ok) {
        // A throttled request was not accepted; other failures are not proven safe
        // to retry without a provider-side idempotency mechanism.
        throw new ChannelProviderError("WHATSAPP_OUTBOUND_REJECTED", response.status === 429);
      }
      try {
        const decoded: unknown = await response.json();
        const messages = record(decoded)?.messages;
        const first = Array.isArray(messages) ? record(messages[0]) : null;
        const id = first?.id;
        return typeof id === "string" && PROVIDER_MESSAGE_ID.test(id) ? id : null;
      } catch {
        return null; // HTTP 2xx already means send accepted; do not try again.
      }
    },
  };
}
