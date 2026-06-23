import { randomUUID } from "node:crypto";

import {
  createFinancialProfile,
  createOrganization,
  TenantError,
  type EntityId,
  type FinancialContextKind,
  type FinancialProfile,
} from "@solverfin/domain";

import type { AuthenticatedUser } from "../auth.js";
import { query, withTransaction } from "../db.js";

interface FinancialProfileRow {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  kind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationRow {
  id: string;
  ownerUserId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFinancialProfilePayload {
  name: string;
  kind: FinancialContextKind;
}

export interface UpdateFinancialProfilePayload {
  name?: string;
  kind?: FinancialContextKind;
}

const ALLOWED_PROFILE_KINDS = new Set<FinancialContextKind>([
  "personal",
  "family",
  "mei",
  "business",
]);

export async function listFinancialProfilesForUser(userId: EntityId): Promise<FinancialProfile[]> {
  const rows = await query<FinancialProfileRow>(
    `select "id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt"
     from "FinancialProfile"
     where "ownerUserId" = $1
     order by "status" asc, "createdAt" asc`,
    [userId],
  );

  return rows.map(mapFinancialProfileRow);
}

export async function createFinancialProfileForUser(
  user: AuthenticatedUser,
  payload: CreateFinancialProfilePayload,
): Promise<FinancialProfile> {
  const now = new Date().toISOString();
  const kind = parseProfileKind(payload.kind);
  const organization = await resolveWritableOrganizationForUser(user, now);
  const profile = createFinancialProfile({
    id: randomUUID(),
    organization,
    owner: user,
    name: payload.name,
    kind,
    now,
  });

  await query(
    `insert into "FinancialProfile"
      ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)`,
    [
      profile.id,
      profile.organizationId,
      profile.ownerUserId,
      profile.name,
      profile.kind.toUpperCase(),
      profile.createdAt,
      profile.updatedAt,
    ],
  );

  return profile;
}

export async function updateFinancialProfileForUser(
  user: AuthenticatedUser,
  profileId: EntityId,
  payload: UpdateFinancialProfilePayload,
): Promise<FinancialProfile> {
  const current = await findOwnedFinancialProfile(user.id, profileId);

  if (current === undefined) {
    throw new TenantError(
      "TENANT_ACCESS_DENIED",
      "Perfil financeiro nao encontrado para este usuario.",
    );
  }

  const name = payload.name === undefined ? current.name : normalizeProfileName(payload.name);
  const kind = payload.kind === undefined ? current.kind : parseProfileKind(payload.kind);
  const now = new Date().toISOString();

  const rows = await query<FinancialProfileRow>(
    `update "FinancialProfile"
       set "name" = $1, "kind" = $2, "updatedAt" = $3
     where "id" = $4 and "ownerUserId" = $5
     returning "id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt"`,
    [name, kind.toUpperCase(), now, profileId, user.id],
  );

  return mapFinancialProfileRow(requireRow(rows));
}

export async function archiveFinancialProfileForUser(
  user: AuthenticatedUser,
  profileId: EntityId,
): Promise<FinancialProfile> {
  const current = await findOwnedFinancialProfile(user.id, profileId);

  if (current === undefined) {
    throw new TenantError(
      "TENANT_ACCESS_DENIED",
      "Perfil financeiro nao encontrado para este usuario.",
    );
  }

  const activeProfiles = await listFinancialProfilesForUser(user.id);

  if (
    current.status === "active" &&
    activeProfiles.filter((profile) => profile.status === "active").length <= 1
  ) {
    throw new TenantError(
      "TENANT_PROFILE_REQUIRED",
      "Crie ou selecione outro perfil ativo antes de arquivar este perfil.",
    );
  }

  const rows = await query<FinancialProfileRow>(
    `update "FinancialProfile"
       set "status" = 'ARCHIVED', "updatedAt" = $1
     where "id" = $2 and "ownerUserId" = $3
     returning "id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt"`,
    [new Date().toISOString(), profileId, user.id],
  );

  return mapFinancialProfileRow(requireRow(rows));
}

async function resolveWritableOrganizationForUser(
  user: AuthenticatedUser,
  now: string,
): Promise<{ id: string; ownerUserId: string }> {
  const rows = await query<OrganizationRow>(
    `select "id", "ownerUserId", "name", "createdAt", "updatedAt"
     from "Organization"
     where "ownerUserId" = $1
     order by "createdAt" asc
     limit 1`,
    [user.id],
  );
  const existing = rows[0];

  if (existing !== undefined) {
    return { id: existing.id, ownerUserId: existing.ownerUserId };
  }

  const organization = createOrganization({
    id: randomUUID(),
    owner: user,
    name: `Organizacao de ${user.displayName}`,
    now,
  });

  await withTransaction(async (executeQuery) => {
    await executeQuery(
      `insert into "Organization" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5)`,
      [
        organization.id,
        organization.ownerUserId,
        organization.name,
        organization.createdAt,
        organization.updatedAt,
      ],
    );
  });

  return { id: organization.id, ownerUserId: organization.ownerUserId };
}

async function findOwnedFinancialProfile(
  userId: EntityId,
  profileId: EntityId,
): Promise<FinancialProfile | undefined> {
  const rows = await query<FinancialProfileRow>(
    `select "id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt"
     from "FinancialProfile"
     where "id" = $1 and "ownerUserId" = $2
     limit 1`,
    [profileId, userId],
  );

  return rows[0] ? mapFinancialProfileRow(rows[0]) : undefined;
}

function parseProfileKind(value: unknown): FinancialContextKind {
  const kind = String(value).trim().toLowerCase() as FinancialContextKind;

  if (!ALLOWED_PROFILE_KINDS.has(kind)) {
    throw new TenantError("TENANT_PROFILE_REQUIRED", "Tipo de perfil financeiro invalido.");
  }

  return kind;
}

function normalizeProfileName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 160);

  if (!normalized) {
    throw new TenantError("TENANT_PROFILE_REQUIRED", "Nome do perfil financeiro e obrigatorio.");
  }

  return normalized;
}

function mapFinancialProfileRow(row: FinancialProfileRow): FinancialProfile {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    kind: row.kind.toLowerCase() as FinancialContextKind,
    status: row.status.toLowerCase() as "active" | "archived",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireRow(rows: readonly FinancialProfileRow[]): FinancialProfileRow {
  const row = rows[0];

  if (row === undefined) {
    throw new TenantError(
      "TENANT_ACCESS_DENIED",
      "Perfil financeiro nao encontrado para este usuario.",
    );
  }

  return row;
}
