import {
  resolveTenantContext,
  type EntityId,
  type FinancialContextKind,
  type FinancialProfile,
  type ISODateTime,
  type TenantContext,
} from "@solverfin/domain";

import type { AuthenticatedUser } from "./auth.js";
import { query } from "./db.js";

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

export async function loadFinancialProfilesForUser(userId: EntityId): Promise<FinancialProfile[]> {
  const rows = await query<FinancialProfileRow>(
    `select "id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt"
     from "FinancialProfile"
     where "ownerUserId" = $1
     order by "createdAt" asc`,
    [userId],
  );

  return rows.map(mapFinancialProfileRow);
}

export async function resolveRequestTenantContext(
  user: AuthenticatedUser,
  requestedFinancialProfileId?: EntityId,
): Promise<TenantContext> {
  const profiles = await loadFinancialProfilesForUser(user.id);
  const defaultProfileId = requestedFinancialProfileId ?? selectDefaultProfileId(profiles, user.id);

  return resolveTenantContext({
    user: { id: user.id, status: user.status },
    profiles,
    ...(defaultProfileId ? { requestedFinancialProfileId: defaultProfileId } : {}),
  });
}

function selectDefaultProfileId(
  profiles: readonly FinancialProfile[],
  userId: EntityId,
): EntityId | undefined {
  const ownProfiles = profiles.filter(
    (profile) => profile.ownerUserId === userId && profile.status === "active",
  );
  const personalProfile = ownProfiles.find((profile) => profile.kind === "personal");

  return (personalProfile ?? ownProfiles[0])?.id;
}

function mapFinancialProfileRow(row: FinancialProfileRow): FinancialProfile {
  return {
    id: row.id,
    organizationId: row.organizationId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    kind: row.kind.toLowerCase() as FinancialContextKind,
    status: row.status.toLowerCase() as "active" | "archived",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toIso(value: Date): ISODateTime {
  return value.toISOString();
}
