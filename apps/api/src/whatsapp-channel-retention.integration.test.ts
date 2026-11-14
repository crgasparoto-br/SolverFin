import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { TenantContext } from "@solverfin/domain";

import { closePool, query } from "./db.js";
import {
  claimWhatsappInboundEvent,
  createWhatsappPairing,
  finishWhatsappInboundEvent,
} from "./whatsapp-channel-repository.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "33333333-3333-4333-8333-333333333331";

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closePool);

async function main(): Promise<void> {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests.");
  const profile = (
    await query<{ organizationId: string }>(
      'select "organizationId" from "FinancialProfile" where "id"=$1',
      [PROFILE_ID],
    )
  )[0];
  assert.ok(profile, "Seeded financial profile must exist.");
  const context: TenantContext = {
    userId: USER_ID,
    organizationId: profile.organizationId,
    financialProfileId: PROFILE_ID,
    financialProfileKind: "personal",
  };

  // Run the real API entrypoint twice. The first run reproduces the privacy
  // regression: retained data must be redacted after Meta is disabled.
  for (const metaConfigured of [false, true]) {
    await assertCleanupOnApiStartup(context, metaConfigured);
  }
}

async function assertCleanupOnApiStartup(
  context: TenantContext,
  metaConfigured: boolean,
): Promise<void> {
  const suffix = BigInt("0x" + randomUUID().replace(/-/g, "").slice(0, 14)).toString();
  const accountId = "99" + suffix.slice(-12).padStart(12, "0");
  const senderId = "55" + suffix.slice(-10).padStart(10, "0");
  const pairing = await createWhatsappPairing(
    context,
    accountId,
    new Date(Date.now() - 11 * 60_000),
  );
  const receivedAt = new Date();
  const claim = await claimWhatsappInboundEvent({
    provider: "meta_whatsapp",
    accountId,
    externalMessageId: "wamid.retention-" + randomUUID(),
    senderId,
    text: "Consulta read-only de teste",
    receivedAt,
  });
  assert.ok(claim.token);
  await finishWhatsappInboundEvent({
    eventId: claim.event.id,
    token: claim.token,
    outcome: "query_complete",
    reply: "Resposta financeira temporária",
  });
  await query('update "WhatsappChannelEvent" set "expiresAt"=$2 where "id"=$1', [
    claim.event.id,
    new Date(Date.now() - 1000),
  ]);

  const before = await query<{ senderId: string | null; replyText: string | null }>(
    'select "senderId","replyText" from "WhatsappChannelEvent" where "id"=$1',
    [claim.event.id],
  );
  assert.equal(before[0]?.senderId, senderId);
  assert.equal(before[0]?.replyText, "Resposta financeira temporária");

  const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      API_PORT: "0",
      WHATSAPP_META_APP_SECRET: metaConfigured ? "integration-secret" : "",
      WHATSAPP_META_VERIFY_TOKEN: metaConfigured ? "integration-token" : "",
      WHATSAPP_META_PHONE_NUMBER_ID: metaConfigured ? "12345678901" : "",
      WHATSAPP_META_ACCESS_TOKEN: "",
      WHATSAPP_META_GRAPH_VERSION: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  child.stdout.on("data", (data: Buffer) => logs.push(data.toString("utf8")));
  child.stderr.on("data", (data: Buffer) => logs.push(data.toString("utf8")));

  try {
    let cleaned = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break;
      const events = await query<{
        senderId: string | null;
        replyText: string | null;
        state: string;
      }>('select "senderId","replyText","state" from "WhatsappChannelEvent" where "id"=$1', [
        claim.event.id,
      ]);
      const links = await query<{ challengeHash: string | null; state: string }>(
        'select "challengeHash","state" from "WhatsappChannelLink" where "id"=$1',
        [pairing.id],
      );
      cleaned =
        events[0]?.senderId === null &&
        events[0]?.replyText === null &&
        events[0]?.state === "expired" &&
        links[0]?.challengeHash === null &&
        links[0]?.state === "expired";
      if (cleaned) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(
      cleaned,
      `API startup must purge expired WhatsApp data, Meta configured=${metaConfigured}. ` +
        logs.join("").slice(-1500),
    );
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await query('delete from "WhatsappChannelEvent" where "id"=$1', [claim.event.id]);
    await query('delete from "WhatsappChannelLink" where "id"=$1', [pairing.id]);
  }
}
