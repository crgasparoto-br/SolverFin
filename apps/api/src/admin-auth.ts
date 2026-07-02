import { AuthError, type AuthenticatedUser } from "./auth.js";

export const MASTER_EMAILS_ENV_KEY = "SOLVERFIN_MASTER_EMAILS";

export interface MasterAccessOptions {
  env?: Readonly<Record<string, string | undefined>>;
}

export function listConfiguredMasterEmails(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const rawValue = env[MASTER_EMAILS_ENV_KEY] ?? "";

  return rawValue
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(isValidEmail);
}

export function isMasterUser(user: AuthenticatedUser, options: MasterAccessOptions = {}): boolean {
  if (user.status !== "active") {
    return false;
  }

  const masterEmails = listConfiguredMasterEmails(options.env);

  if (masterEmails.length === 0) {
    return false;
  }

  return masterEmails.includes(normalizeEmail(user.email));
}

export function requireMasterUser(
  user: AuthenticatedUser,
  options: MasterAccessOptions = {},
): AuthenticatedUser {
  if (isMasterUser(user, options)) {
    return user;
  }

  throw new AuthError(
    "AUTH_ADMIN_REQUIRED",
    "Acesso administrativo restrito ao usuario master.",
    403,
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
