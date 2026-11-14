import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { TenantContext } from "@solverfin/domain";

import { query, withTransaction } from "./db.js";

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

export const PAIRING_TTL_MS = 10 * 60 * 1000;
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
