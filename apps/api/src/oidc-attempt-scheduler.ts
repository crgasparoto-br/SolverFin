import { expireOidcLoginAttempts } from "./oidc-flow.js";

const DEFAULT_INTERVAL_MS = 60_000;

export function startOidcLoginAttemptScheduler(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (!env.DATABASE_URL) return;

  const configured = Number(env.OIDC_ATTEMPT_CLEANUP_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(configured) && configured >= 10_000 ? configured : DEFAULT_INTERVAL_MS;
  let running = false;

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await expireOidcLoginAttempts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`OIDC attempt cleanup failed: ${message}`);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
}
