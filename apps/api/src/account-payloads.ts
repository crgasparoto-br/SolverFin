import type {
  AccountKind,
  AccountStatus,
  CreateAccountPayload,
  UpdateAccountPayload,
} from "@solverfin/domain";

export function buildCreateAccountPayload(body: Record<string, unknown>): CreateAccountPayload {
  return {
    name: String(body.name ?? ""),
    kind: body.kind as AccountKind,
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.agencyIdentifier !== undefined
      ? { agencyIdentifier: String(body.agencyIdentifier) }
      : {}),
    ...(body.accountIdentifier !== undefined
      ? { accountIdentifier: String(body.accountIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  };
}

export function buildUpdateAccountPayload(body: Record<string, unknown>): UpdateAccountPayload {
  return {
    ...(body.name !== undefined ? { name: String(body.name) } : {}),
    ...(body.kind !== undefined ? { kind: body.kind as AccountKind } : {}),
    ...(body.status !== undefined ? { status: body.status as AccountStatus } : {}),
    ...(body.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: Number(body.openingBalanceMinor) }
      : {}),
    ...(body.currency !== undefined ? { currency: String(body.currency) } : {}),
    ...(body.agencyIdentifier !== undefined
      ? { agencyIdentifier: String(body.agencyIdentifier) }
      : {}),
    ...(body.accountIdentifier !== undefined
      ? { accountIdentifier: String(body.accountIdentifier) }
      : {}),
    ...(body.institutionKey !== undefined ? { institutionKey: String(body.institutionKey) } : {}),
  };
}
