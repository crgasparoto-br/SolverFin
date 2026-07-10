const LOCAL_AUTH_ENVIRONMENTS = new Set(["development", "local", "test"]);

type PasswordResetEnvironment = Readonly<Record<string, string | undefined>>;

export function resolvePasswordResetUrl(
  env: PasswordResetEnvironment = process.env,
): string | undefined {
  const candidate = env.AUTH_PASSWORD_RESET_URL?.trim();

  if (!candidate) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }

  if (url.username || url.password) {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  const nodeEnv = (env.NODE_ENV ?? "development").trim().toLowerCase();

  if (!LOCAL_AUTH_ENVIRONMENTS.has(nodeEnv) && url.protocol !== "https:") {
    return undefined;
  }

  return url.toString();
}
