import { resolvePublicProductiveAuthConfiguration } from "@solverfin/shared";

const LOCAL_AUTH_ENVIRONMENTS = new Set(["development", "local", "test"]);
const PRODUCTIVE_RECOVERY_START_PATH = "/api/auth/oidc/start?returnTo=/dashboard";

type PasswordResetEnvironment = Readonly<Record<string, string | undefined>>;

export function resolvePasswordResetUrl(
  env: PasswordResetEnvironment = process.env,
): string | undefined {
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === "production") {
    resolvePublicProductiveAuthConfiguration(env);
    return PRODUCTIVE_RECOVERY_START_PATH;
  }

  const candidate = env.OIDC_RECOVERY_URL?.trim() ?? env.AUTH_PASSWORD_RESET_URL?.trim();
  if (!candidate) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }

  if (url.username || url.password) return undefined;
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  if (!nodeEnv || !LOCAL_AUTH_ENVIRONMENTS.has(nodeEnv)) {
    return undefined;
  }

  return url.toString();
}
