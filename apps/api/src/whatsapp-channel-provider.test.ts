import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  ChannelProviderError,
  createMetaCloudApiOutbound,
  parseMetaInboundMessages,
  requireMetaWebhookConfig,
  verifyMetaSignature,
  verifyMetaSubscription,
  type ChannelOutboundPort,
} from "./whatsapp-channel-provider.js";
import { handleWhatsappChannelWebhook } from "./whatsapp-channel-router.js";

const env = {
  WHATSAPP_META_APP_SECRET: "private-test-app-secret",
  WHATSAPP_META_VERIFY_TOKEN: "test-webhook-token",
  WHATSAPP_META_ACCESS_TOKEN: "test-protected-token",
  WHATSAPP_META_PHONE_NUMBER_ID: "12345678901234",
  WHATSAPP_META_GRAPH_VERSION: "v25.0",
};
const senderId = "5511999998888";
const messageId = "wamid.valid-001";

function signedHeaders(payload: Buffer) {
  return {
    "x-hub-signature-256":
      "sha256=" + createHmac("sha256", env.WHATSAPP_META_APP_SECRET).update(payload).digest("hex"),
  };
}

function webhookPayload(
  text = "qual meu saldo hoje?",
  businessId = env.WHATSAPP_META_PHONE_NUMBER_ID,
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: businessId },
              messages: [
                {
                  id: messageId,
                  from: senderId,
                  timestamp: "1794531600",
                  type: "text",
                  text: { body: text },
                },
              ],
              statuses: [{ id: "unrelated", status: "read" }],
            },
          },
        ],
      },
    ],
  };
}

test("Meta webhook verifies the exact byte buffer before parsing", () => {
  const buffer = Buffer.from(JSON.stringify(webhookPayload()));
  assert.equal(
    verifyMetaSignature(
      buffer,
      signedHeaders(buffer)["x-hub-signature-256"],
      env.WHATSAPP_META_APP_SECRET,
    ),
    true,
  );
  assert.equal(
    verifyMetaSignature(
      Buffer.from(buffer.toString() + " "),
      signedHeaders(buffer)["x-hub-signature-256"],
      env.WHATSAPP_META_APP_SECRET,
    ),
    false,
  );
  assert.equal(verifyMetaSignature(buffer, "sha256=not-hex", env.WHATSAPP_META_APP_SECRET), false);
  assert.equal(verifyMetaSignature(buffer, undefined, env.WHATSAPP_META_APP_SECRET), false);
  assert.equal(
    verifyMetaSignature(buffer, signedHeaders(buffer)["x-hub-signature-256"], ""),
    false,
  );
});

test("Meta GET challenge is allowed only with configured token and subscribe mode", () => {
  const valid = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": env.WHATSAPP_META_VERIFY_TOKEN,
    "hub.challenge": "98765",
  });
  assert.equal(verifyMetaSubscription(valid, env.WHATSAPP_META_VERIFY_TOKEN), "98765");
  valid.set("hub.verify_token", "another");
  assert.equal(verifyMetaSubscription(valid, env.WHATSAPP_META_VERIFY_TOKEN), null);
  valid.set("hub.verify_token", env.WHATSAPP_META_VERIFY_TOKEN);
  valid.set("hub.mode", "update");
  assert.equal(verifyMetaSubscription(valid, env.WHATSAPP_META_VERIFY_TOKEN), null);
});

test("Meta parser ignores status updates and unrelated business accounts", () => {
  const parsed = parseMetaInboundMessages(webhookPayload(), env.WHATSAPP_META_PHONE_NUMBER_ID);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.accountId, env.WHATSAPP_META_PHONE_NUMBER_ID);
  assert.equal(parsed[0]?.text, "qual meu saldo hoje?");
  assert.deepEqual(
    parseMetaInboundMessages(webhookPayload("x", "99999999999"), env.WHATSAPP_META_PHONE_NUMBER_ID),
    [],
  );
  assert.throws(
    () => parseMetaInboundMessages({ object: "unknown" }, env.WHATSAPP_META_PHONE_NUMBER_ID),
    ChannelProviderError,
  );
  assert.deepEqual(
    parseMetaInboundMessages(
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: env.WHATSAPP_META_PHONE_NUMBER_ID },
                  statuses: [{ id: "x" }],
                },
              },
            ],
          },
        ],
      },
      env.WHATSAPP_META_PHONE_NUMBER_ID,
    ),
    [],
  );
});

test("Meta outbound uses restricted HTTPS graph endpoint and no untrusted URL", async () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.answer-001" }] }), {
      status: 200,
    });
  };
  const outbound = createMetaCloudApiOutbound(env, transport as typeof fetch);
  const result = await outbound.sendText({
    accountId: env.WHATSAPP_META_PHONE_NUMBER_ID,
    recipientId: senderId,
    text: "Saldo na moeda solicitada.",
  });
  assert.equal(result, "wamid.answer-001");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, "https://graph.facebook.com/v25.0/12345678901234/messages");
  const body = JSON.parse(String(sent[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.to, senderId);
  assert.equal((body.text as { body: string }).body, "Saldo na moeda solicitada.");
  assert.doesNotMatch(JSON.stringify(body), /private-test-app-secret|test-protected-token/);
  assert.equal(
    (sent[0]?.init.headers as Record<string, string>).authorization,
    "Bearer test-protected-token",
  );
  await assert.rejects(
    () => outbound.sendText({ accountId: "999999999", recipientId: senderId, text: "x" }),
    ChannelProviderError,
  );
});

test("Meta unavailable, throttled and uncertain failures are distinguishable without leaking provider details", async () => {
  assert.throws(() => requireMetaWebhookConfig({}), ChannelProviderError);
  assert.throws(() => createMetaCloudApiOutbound({}), ChannelProviderError);
  for (const [status, knownNotSent] of [
    [429, true],
    [503, false],
  ] as const) {
    const outbound = createMetaCloudApiOutbound(
      env,
      async () => new Response("provider-secret", { status }) as never,
    );
    await assert.rejects(
      () =>
        outbound.sendText({
          accountId: env.WHATSAPP_META_PHONE_NUMBER_ID,
          recipientId: senderId,
          text: "x",
        }),
      (error: unknown) =>
        error instanceof ChannelProviderError &&
        error.knownNotSent === knownNotSent &&
        !error.message.includes("provider-secret"),
    );
  }
  const failing = createMetaCloudApiOutbound(env, async () => {
    throw new Error("transport-secret");
  });
  await assert.rejects(
    () =>
      failing.sendText({
        accountId: env.WHATSAPP_META_PHONE_NUMBER_ID,
        recipientId: senderId,
        text: "x",
      }),
    (error: unknown) =>
      error instanceof ChannelProviderError && !error.message.includes("transport-secret"),
  );
});

test("Signed webhook dispatches messages only after signature; status-only delivery is acknowledged", async () => {
  const rawBody = Buffer.from(JSON.stringify(webhookPayload()));
  let processed = 0;
  const outbound: ChannelOutboundPort = {
    async sendText() {
      throw new Error("should never send from mocked processor");
    },
  };
  const processMessage = async () => {
    processed++;
  };
  const verified = await handleWhatsappChannelWebhook(
    {
      method: "POST",
      query: new URLSearchParams(),
      headers: signedHeaders(rawBody),
      rawBody,
    },
    { env, outbound, processMessage },
  );
  assert.equal(verified.statusCode, 200);
  assert.equal(processed, 1);

  const tampered = await handleWhatsappChannelWebhook(
    {
      method: "POST",
      query: new URLSearchParams(),
      headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) },
      rawBody,
    },
    { env, outbound, processMessage },
  );
  assert.equal(tampered.statusCode, 403);
  assert.equal(processed, 1);

  const broken = await handleWhatsappChannelWebhook(
    {
      method: "POST",
      query: new URLSearchParams(),
      headers: signedHeaders(rawBody),
      rawBody,
    },
    {
      env,
      outbound,
      processMessage: async () => {
        throw Error("sensitive");
      },
    },
  );
  assert.equal(broken.statusCode, 503);
  assert.doesNotMatch(broken.body, /sensitive/);

  const statusOnly = Buffer.from(
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: env.WHATSAPP_META_PHONE_NUMBER_ID },
                statuses: [{ id: "x", status: "read" }],
              },
            },
          ],
        },
      ],
    }),
  );
  const acknowledged = await handleWhatsappChannelWebhook(
    {
      method: "POST",
      query: new URLSearchParams(),
      headers: signedHeaders(statusOnly),
      rawBody: statusOnly,
    },
    { env, outbound, processMessage },
  );
  assert.equal(acknowledged.statusCode, 200);
  assert.equal(processed, 1);
});
