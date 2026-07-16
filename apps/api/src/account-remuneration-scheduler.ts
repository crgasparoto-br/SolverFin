import {
  importCdiRates,
  processAccountRemunerations,
} from "./repositories/account-remuneration-diagnostics-service.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1_000;
let lastCompletedDate: string | undefined;

export function startAccountRemunerationScheduler(): void {
  if (process.env.ACCOUNT_REMUNERATION_DAILY_ENABLED !== "true") {
    return;
  }

  const run = (): void => {
    void runDailyAccountRemunerationCycle().catch((error: unknown) => {
      console.error("Daily account remuneration cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  run();
  const timer = setInterval(run, CHECK_INTERVAL_MS);
  timer.unref();
}

export async function runDailyAccountRemunerationCycle(
  now = new Date(),
): Promise<boolean> {
  const executionHourUtc = parseExecutionHour(
    process.env.ACCOUNT_REMUNERATION_DAILY_HOUR_UTC,
  );
  const today = now.toISOString().slice(0, 10);

  if (!shouldRunDailyTask(now, executionHourUtc, lastCompletedDate)) {
    return false;
  }

  await importCdiRates({ endsOn: today });
  await processAccountRemunerations(today);
  lastCompletedDate = today;
  return true;
}

export function shouldRunDailyTask(
  now: Date,
  executionHourUtc: number,
  completedDate: string | undefined,
): boolean {
  const today = now.toISOString().slice(0, 10);
  return completedDate !== today && now.getUTCHours() >= executionHourUtc;
}

function parseExecutionHour(value: string | undefined): number {
  const parsed = Number(value ?? "10");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 10;
}
