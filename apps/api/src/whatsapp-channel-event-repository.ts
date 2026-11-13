import { randomUUID } from "node:crypto";

import { query, withTransaction } from "./db.js";
import {
  PAIRING_TTL_MS,
  resolveActiveWhatsappLink,
  WhatsappChannelError,
  type ActiveChannelLink,
} from "./whatsapp-channel-link-repository.js";
import type { ChannelInboundMessage } from "./whatsapp-channel-provider.js";
import type {
  ChannelEventClaim,
  ChannelEventRow,
  ChannelOutcome,
} from "./whatsapp-channel-types.js";

const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const SEND_LEASE_MS = 40 * 1000;

export async function claimWhatsappInboundEvent(
  message: ChannelInboundMessage,
  now = new Date(),
): Promise<ChannelEventClaim> {
  const receivedAt = message.receivedAt;
  const expiredOnArrival =
    receivedAt.getTime() < now.getTime() - EVENT_TTL_MS ||
    receivedAt.getTime() > now.getTime() + 5 * 60_000;
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + EVENT_TTL_MS);
  await query(
    `insert into "WhatsappChannelEvent"
     ("id","provider","accountId","providerMessageId","senderId","state","expiresAt",
      "receivedAt","createdAt","updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     on conflict ("provider","accountId","providerMessageId") do nothing`,
    [
      id,
      message.provider,
      message.accountId,
      message.externalMessageId,
      message.senderId,
      expiredOnArrival ? "expired" : "received",
      expiresAt,
      receivedAt,
      now,
    ],
  );
  const token = randomUUID();
  const claimed = await query<ChannelEventRow>(
    `update "WhatsappChannelEvent"
     set "state"='processing',"leaseToken"=$4,"leaseUntil"=$5,
         "attempts"="attempts"+1,"version"="version"+1,"updatedAt"=$6
     where "provider"=$1 and "accountId"=$2 and "providerMessageId"=$3
       and "senderId"=$7 and "expiresAt">$6
       and (
         "state" in ('received','failure_retryable')
         or ("state"='processing' and "leaseUntil"<=$6)
       )
     returning *`,
    [
      message.provider,
      message.accountId,
      message.externalMessageId,
      token,
      new Date(now.getTime() + PROCESSING_LEASE_MS),
      now,
      message.senderId,
    ],
  );
  if (claimed[0]) return { event: claimed[0], token };
  const rows = await query<ChannelEventRow>(
    `select * from "WhatsappChannelEvent" where "provider"=$1
      and "accountId"=$2 and "providerMessageId"=$3
      and ("senderId"=$4 or (
        "senderId" is null and "expiresAt"<=$5
        and "state" in ('expired','cancelled','sent','send_unknown')
      ))`,
    [message.provider, message.accountId, message.externalMessageId, message.senderId, now],
  );
  if (!rows[0]) throw new WhatsappChannelError("WHATSAPP_EVENT_IDENTITY_CONFLICT", 409);
  return { event: rows[0], token: null };
}

export async function finishWhatsappInboundEvent(
  input: {
    eventId: string;
    token: string;
    outcome: ChannelOutcome;
    reply: string;
    link?: ActiveChannelLink;
    conversationId?: string;
    suggestionId?: string;
    importBatchId?: string;
  },
  now = new Date(),
): Promise<void> {
  const link = input.link;
  const rows = await query<{ id: string }>(
    `update "WhatsappChannelEvent" set
      "state"='response_ready',"outcome"=$3,"replyText"=$4,
      "linkId"=$5,"userId"=$6,"organizationId"=$7,"financialProfileId"=$8,
      "assistantConversationId"=$9,"suggestionId"=$10,"importBatchId"=$11,
      "leaseToken"=null,"leaseUntil"=null,"version"="version"+1,"updatedAt"=$12
     where "id"=$1 and "state"='processing' and "leaseToken"=$2 and "expiresAt">$12
     returning "id"`,
    [
      input.eventId,
      input.token,
      input.outcome,
      input.reply.slice(0, 4000),
      link?.id ?? null,
      link?.userId ?? null,
      link?.organizationId ?? null,
      link?.financialProfileId ?? null,
      input.conversationId ?? null,
      input.suggestionId ?? null,
      input.importBatchId ?? null,
      now,
    ],
  );
  if (!rows.length) throw new WhatsappChannelError("WHATSAPP_EVENT_STATE_CHANGED", 503);
}

export async function failWhatsappInboundEvent(
  id: string,
  token: string,
  now = new Date(),
): Promise<void> {
  await query(
    `update "WhatsappChannelEvent"
      set "state"='failure_retryable',"leaseToken"=null,"leaseUntil"=null,
          "version"="version"+1,"updatedAt"=$3
      where "id"=$1 and "leaseToken"=$2 and "state"='processing'`,
    [id, token, now],
  );
}

export async function replaceResponseAfterRevocation(id: string, now = new Date()): Promise<void> {
  await query(
    `update "WhatsappChannelEvent"
     set "outcome"='awaiting_link',
         "replyText"='Para continuar, vincule este canal novamente no SolverFin.',
         "version"="version"+1,"updatedAt"=$2
     where "id"=$1 and "state"='response_ready'
       and "outcome" in ('query_complete','query_incomplete','capture_pending_review','capture_incomplete')`,
    [id, now],
  );
}

export async function claimWhatsappOutboundEvent(
  id: string,
  now = new Date(),
): Promise<{ event: ChannelEventRow; token: string } | null> {
  const token = randomUUID();
  const rows = await query<ChannelEventRow>(
    `update "WhatsappChannelEvent"
     set "state"='sending',"leaseToken"=$2,"leaseUntil"=$3,
         "version"="version"+1,"updatedAt"=$4
     where "id"=$1 and "state"='response_ready' and "expiresAt">$4
     returning *`,
    [id, token, new Date(now.getTime() + SEND_LEASE_MS), now],
  );
  return rows[0] ? { event: rows[0], token } : null;
}

export async function settleWhatsappOutboundEvent(
  id: string,
  token: string,
  status: "sent" | "response_ready" | "send_unknown",
  outboundId: string | null,
  now = new Date(),
): Promise<void> {
  await query(
    `update "WhatsappChannelEvent"
     set "state"=$3::varchar(28),"replyText"=case when $3::varchar(28)='response_ready' then "replyText" else null end,
         "outboundProviderMessageId"=$4,
         "leaseToken"=null,"leaseUntil"=null,"version"="version"+1,"updatedAt"=$5
     where "id"=$1 and "leaseToken"=$2 and "state"='sending'`,
    [id, token, status, outboundId, now],
  );
}

/**
 * Keep a shared database lock across the outbound provider call. Concurrent
 * revocation, profile archival or user deactivation cannot commit until the
 * already-authorized send completes; a completed revocation therefore gates
 * every subsequent financial response.
 */
export async function withAuthorizedWhatsappOutbound<T>(
  link: ActiveChannelLink,
  send: () => Promise<T>,
): Promise<T> {
  return withTransaction(async (executeQuery) => {
    const rows = await executeQuery<{ id: string; version: number }>(
      `select l."id",l."version" from "WhatsappChannelLink" l
       join "User" u on u."id"=l."userId" and u."status"='ACTIVE'
       join "FinancialProfile" p
         on p."id"=l."financialProfileId" and p."organizationId"=l."organizationId"
         and p."ownerUserId"=l."userId" and p."status"='ACTIVE'
       where l."id"=$1 and l."provider"='meta_whatsapp' and l."accountId"=$2
         and l."senderId"=$3 and l."userId"=$4 and l."organizationId"=$5
         and l."financialProfileId"=$6 and l."state"='active' and l."version"=$7
       for share of l,u,p`,
      [
        link.id,
        link.accountId,
        link.senderId,
        link.userId,
        link.organizationId,
        link.financialProfileId,
        link.version,
      ],
    );
    if (!rows[0] || rows[0].version !== link.version) {
      throw new WhatsappChannelError("WHATSAPP_LINK_REVOKED", 403);
    }
    return send();
  });
}

/** Called by the scheduler; no pending processing is resumed without a signed POST replay. */
export async function redactExpiredWhatsappState(now = new Date()): Promise<void> {
  await query(
    `update "WhatsappChannelLink" set
       "state"='expired',"challengeHash"=null,"senderId"=null,
       "version"="version"+1,"updatedAt"=$1
     where "state" in ('pending','awaiting_confirmation') and "expiresAt"<=$1`,
    [now],
  );
  await query(
    `update "WhatsappChannelEvent" set
      "state"=case
        when "state"='sending' and "leaseUntil"<=$1 then 'send_unknown'
        when "expiresAt"<=$1 and "state" not in ('sent','send_unknown') then 'expired'
        else "state" end,
      "senderId"=case when "expiresAt"<=$1 then null else "senderId" end,
      "replyText"=case
        when "expiresAt"<=$1 or ("state"='sending' and "leaseUntil"<=$1) then null
        else "replyText" end,
      "leaseToken"=case
        when "expiresAt"<=$1 or ("state"='sending' and "leaseUntil"<=$1) then null
        else "leaseToken" end,
      "leaseUntil"=case
        when "expiresAt"<=$1 or ("state"='sending' and "leaseUntil"<=$1) then null
        else "leaseUntil" end,
      "updatedAt"=$1
     where ("expiresAt"<=$1 and ("senderId" is not null or "replyText" is not null
               or "state" not in ('expired','sent','send_unknown')))
        or ("state"='sending' and "leaseUntil"<=$1)`,
    [now],
  );
}

export const WhatsappChannelLimits = {
  maxMessageChars: 4000,
  eventTtlMs: EVENT_TTL_MS,
  pairingTtlMs: PAIRING_TTL_MS,
} as const;
