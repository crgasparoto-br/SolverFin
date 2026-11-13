import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "./db.js";
import type { ChannelInboundMessage } from "./whatsapp-channel-provider.js";

export class WhatsappChannelError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode = 400) {
    super(code);
    this.name = "WhatsappChannelError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type LinkStatus =
  | "pending"
  | "awaiting_confirmation"
  | "active"
  | "cancelled"
  | "expired"
  | "revoked";
export type ChannelOutcome =
  | "awaiting_link"
  | "awaiting_confirmation"
  | "awaiting_selection"
  | "query_complete"
  | "capture_pending_review"
  | "capture_incomplete"
  | "cancelled"
  | "unsupported";

export interface ChannelLinkRow {
  id: string;
  provider: string;
  accountId: string;
  userId: string;
  organizationId: string;
  financialProfileId: string;
  senderId: string | null;
  challengeHash: string | null;
  state: LinkStatus;
  version: number;
  expiresAt: Date;
  confirmedAt: Date | null;
  revokedAt: Date | null;
}

export interface ActiveChannelLink extends ChannelLinkRow {
  financialProfileKind: TenantContext["financialProfileKind"];
}

export interface ChannelEventRow {
  id: string;
  provider: string;
  accountId: string;
  providerMessageId: string;
  senderId: string | null;
  linkId: string | null;
  userId: string | null;
  organizationId: string | null;
  financialProfileId: string | null;
  assistantConversationId: string | null;
  suggestionId: string | null;
  importBatchId: string | null;
  state:
    | "received"
    | "processing"
    | "failure_retryable"
    | "response_ready"
    | "sending"
    | "sent"
    | "send_unknown"
    | "expired"
    | "cancelled";
  outcome: ChannelOutcome | null;
  version: number;
  attempts: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  replyText: string | null;
  outboundProviderMessageId: string | null;
  expiresAt: Date;
  receivedAt: Date;
}

export interface ChannelEventClaim {
  event: ChannelEventRow;
  token: string | null;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const SEND_LEASE_MS = 40 * 1000;

function hashChallenge(code: string): string {
  return createHash("sha256").update("solverfin-whatsapp-link-v1:").update(code).digest("hex");
}

export async function createWhatsappPairing(
  context: TenantContext,
  accountId: string,
  now = new Date(),
): Promise<{ id: string; code: string; expiresAt: string }> {
  const code = randomBytes(24).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  await query(
    `insert into "WhatsappChannelLink"
     ("id","provider","accountId","userId","organizationId","financialProfileId",
      "challengeHash","state","expiresAt","createdAt","updatedAt")
     values ($1,'meta_whatsapp',$2,$3,$4,$5,$6,'pending',$7,$8,$8)`,
    [
      id,
      accountId,
      context.userId,
      context.organizationId,
      context.financialProfileId,
      hashChallenge(code),
      expiresAt,
      now,
    ],
  );
  return { id, code, expiresAt: expiresAt.toISOString() };
}

export async function acknowledgeWhatsappPairingCode(
  accountId: string,
  senderId: string,
  code: string,
  now = new Date(),
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{32}$/.test(code)) return false;
  const rows = await query<{ id: string }>(
    `update "WhatsappChannelLink"
     set "state"='awaiting_confirmation', "senderId"=$2,
         "version"="version"+1, "updatedAt"=$4
     where "accountId"=$1 and "provider"='meta_whatsapp'
       and "challengeHash"=$3 and "state"='pending' and "expiresAt">$4
     returning "id"`,
    [accountId, senderId, hashChallenge(code), now],
  );
  if (rows.length !== 0) return true;
  const existing = await query<{ id: string }>(
    `select "id" from "WhatsappChannelLink"
     where "accountId"=$1 and "senderId"=$2 and "challengeHash"=$3
       and "state"='awaiting_confirmation' and "expiresAt">$4 limit 1`,
    [accountId, senderId, hashChallenge(code), now],
  );
  return existing.length !== 0;
}

function linkStateError(): WhatsappChannelError {
  return new WhatsappChannelError("WHATSAPP_LINK_NOT_AVAILABLE", 409);
}

export async function confirmWhatsappPairing(
  context: TenantContext,
  id: string,
  now = new Date(),
): Promise<{ id: string; state: "active"; senderMasked: string }> {
  return withTransaction(async (executeQuery) => {
    const rows = await executeQuery<ChannelLinkRow>(
      `select * from "WhatsappChannelLink"
       where "id"=$1 and "userId"=$2 and "organizationId"=$3 and "financialProfileId"=$4
       for update`,
      [id, context.userId, context.organizationId, context.financialProfileId],
    );
    const link = rows[0];
    if (!link || !link.senderId || link.state !== "awaiting_confirmation" || link.expiresAt <= now)
      throw linkStateError();

    const current = await executeQuery<{ id: string }>(
      `select "id" from "WhatsappChannelLink"
       where "provider"='meta_whatsapp' and "accountId"=$1 and "senderId"=$2
         and "state"='active' for update`,
      [link.accountId, link.senderId],
    );
    if (current.length) throw linkStateError();
    const eligible = await executeQuery<{ id: string }>(
      `select p."id" from "FinancialProfile" p
       join "User" u on u."id"=p."ownerUserId"
       where p."id"=$1 and p."organizationId"=$2 and p."ownerUserId"=$3
         and p."status"='ACTIVE' and u."status"='ACTIVE'`,
      [context.financialProfileId, context.organizationId, context.userId],
    );
    if (!eligible.length) throw linkStateError();

    await executeQuery(
      `update "WhatsappChannelLink"
       set "state"='active',"challengeHash"=null,"confirmedAt"=$2,
           "version"="version"+1,"updatedAt"=$2
       where "id"=$1`,
      [link.id, now],
    );
    return { id: link.id, state: "active" as const, senderMasked: maskSender(link.senderId) };
  });
}

export async function cancelWhatsappPairing(
  context: TenantContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const rows = await query<{ id: string }>(
    `update "WhatsappChannelLink"
     set "state"='cancelled',"challengeHash"=null,"senderId"=null,
         "version"="version"+1,"updatedAt"=$5
     where "id"=$1 and "userId"=$2 and "organizationId"=$3 and "financialProfileId"=$4
       and "state" in ('pending','awaiting_confirmation') returning "id"`,
    [id, context.userId, context.organizationId, context.financialProfileId, now],
  );
  if (!rows.length) throw linkStateError();
}

export async function revokeWhatsappLink(
  context: TenantContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const rows = await query<{ id: string }>(
    `update "WhatsappChannelLink"
     set "state"='revoked',"challengeHash"=null,"senderId"=null,
         "version"="version"+1,"revokedAt"=$5,"updatedAt"=$5
     where "id"=$1 and "userId"=$2 and "organizationId"=$3 and "financialProfileId"=$4
       and "state"='active' returning "id"`,
    [id, context.userId, context.organizationId, context.financialProfileId, now],
  );
  if (!rows.length) throw linkStateError();
}

export async function listWhatsappLinks(context: TenantContext): Promise<
  {
    id: string;
    state: LinkStatus;
    senderMasked: string | null;
    expiresAt: string;
  }[]
> {
  const rows = await query<ChannelLinkRow>(
    `select * from "WhatsappChannelLink"
     where "userId"=$1 and "organizationId"=$2 and "financialProfileId"=$3
     order by "updatedAt" desc limit 30`,
    [context.userId, context.organizationId, context.financialProfileId],
  );
  return rows.map((row) => ({
    id: row.id,
    state:
      row.state === "pending" || row.state === "awaiting_confirmation"
        ? row.expiresAt <= new Date()
          ? "expired"
          : row.state
        : row.state,
    senderMasked: row.senderId ? maskSender(row.senderId) : null,
    expiresAt: row.expiresAt.toISOString(),
  }));
}

function maskSender(senderId: string): string {
  return `****${senderId.slice(-4)}`;
}

export async function resolveActiveWhatsappLink(
  accountId: string,
  senderId: string,
): Promise<ActiveChannelLink | null> {
  const rows = await query<ActiveChannelLink>(
    `select l.*, lower(p."kind"::text) as "financialProfileKind"
     from "WhatsappChannelLink" l
     join "User" u on u."id"=l."userId" and u."status"='ACTIVE'
     join "FinancialProfile" p
       on p."id"=l."financialProfileId" and p."organizationId"=l."organizationId"
       and p."ownerUserId"=l."userId" and p."status"='ACTIVE'
     where l."provider"='meta_whatsapp' and l."accountId"=$1 and l."senderId"=$2
       and l."state"='active' limit 2`,
    [accountId, senderId],
  );
  return rows.length === 1 ? rows[0]! : null;
}

export async function isWhatsappLinkStillActive(link: ActiveChannelLink): Promise<boolean> {
  const current = await resolveActiveWhatsappLink(link.accountId, link.senderId!);
  return (
    !!current &&
    current.id === link.id &&
    current.version === link.version &&
    current.userId === link.userId &&
    current.organizationId === link.organizationId &&
    current.financialProfileId === link.financialProfileId
  );
}

export function contextFromChannelLink(link: ActiveChannelLink): TenantContext {
  return {
    userId: link.userId,
    organizationId: link.organizationId,
    financialProfileId: link.financialProfileId,
    financialProfileKind: link.financialProfileKind,
  };
}

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
       and "expiresAt">$6
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
    ],
  );
  if (claimed[0]) return { event: claimed[0], token };
  const rows = await query<ChannelEventRow>(
    `select * from "WhatsappChannelEvent" where "provider"=$1
      and "accountId"=$2 and "providerMessageId"=$3`,
    [message.provider, message.accountId, message.externalMessageId],
  );
  if (!rows[0]) throw new WhatsappChannelError("WHATSAPP_EVENT_MISSING", 503);
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
       and "outcome" in ('query_complete','capture_pending_review','capture_incomplete')`,
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
     set "state"=$3,"replyText"=case when $3='response_ready' then "replyText" else null end,
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
      [link.id,link.accountId,link.senderId,link.userId,
        link.organizationId,link.financialProfileId,link.version],
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
