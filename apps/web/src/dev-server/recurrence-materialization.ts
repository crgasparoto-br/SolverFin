import { buildUpstreamAuthenticationHeaders } from "./session.js";

interface AccountRecord {
  id: string;
  status: string;
}

interface CardRecord {
  id: string;
  status: string;
}

interface RecurrenceRecord {
  id: string;
  status: string;
}

export interface RecurrenceMaterializationOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}

export class RecurrenceMaterializationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "RecurrenceMaterializationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const monthPattern = /^\d{4}-\d{2}$/;

export async function materializeCardInvoiceRecurrences(
  credential: string,
  url: URL,
  origin: string | undefined,
  options: RecurrenceMaterializationOptions = {},
): Promise<void> {
  const runtime = resolveRuntime(origin, options);
  const cards = await apiGet<{ cards: CardRecord[] }>(runtime, credential, "/api/cards?status=all");
  const cardId =
    url.searchParams.get("cardId") ??
    cards.cards.find((card) => card.status === "active")?.id ??
    cards.cards[0]?.id;

  if (!cardId) return;

  const recurrences = await apiGet<{ recurrences: RecurrenceRecord[] }>(
    runtime,
    credential,
    `/api/recurrences?${new URLSearchParams({ cardId, status: "all" }).toString()}`,
  );
  await materializeActiveRecurrences(
    runtime,
    credential,
    recurrences.recurrences,
    resolveRequestedMonth(url),
  );
}

export async function materializeAccountStatementRecurrences(
  credential: string,
  url: URL,
  origin: string | undefined,
  options: RecurrenceMaterializationOptions = {},
): Promise<void> {
  const runtime = resolveRuntime(origin, options);
  const accounts = await apiGet<{ accounts: AccountRecord[] }>(
    runtime,
    credential,
    "/api/accounts",
  );
  const accountId =
    url.searchParams.get("accountId") ??
    accounts.accounts.find((account) => account.status === "active")?.id;

  if (!accountId) return;

  const recurrences = await apiGet<{ recurrences: RecurrenceRecord[] }>(
    runtime,
    credential,
    `/api/recurrences?${new URLSearchParams({ accountId, status: "all" }).toString()}`,
  );
  await materializeActiveRecurrences(
    runtime,
    credential,
    recurrences.recurrences,
    resolveRequestedMonth(url),
  );
}

export function enhanceWithRecurrenceMaterialization(
  html: string,
  surface: "account" | "card",
  url: URL,
): string {
  if (url.searchParams.get("materialized") === "1") return html;

  const query = new URLSearchParams({ surface });
  for (const key of ["month", "startsOn", "accountId", "cardId"] as const) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  const script = `<script data-recurrence-materialization>
(() => {
  const endpoint = ${JSON.stringify(`/api/recurrence-materialization?${query.toString()}`)};
  fetch(endpoint, { method: "POST", credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) return;
      const next = new URL(window.location.href);
      next.searchParams.set("materialized", "1");
      window.location.replace(next.toString());
    })
    .catch(() => undefined);
})();
</script>`;

  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
}

function resolveRuntime(
  origin: string | undefined,
  options: RecurrenceMaterializationOptions,
): {
  apiBaseUrl: string;
  origin: string;
  fetchImpl: typeof fetch;
} {
  const env = options.env ?? process.env;
  const expectedOrigin = env.APP_ORIGIN?.trim();
  const receivedOrigin = origin?.trim();

  if (!expectedOrigin || !receivedOrigin || receivedOrigin !== expectedOrigin) {
    throw new RecurrenceMaterializationError(
      "AUTH_REQUEST_ORIGIN_INVALID",
      "Não foi possível validar a origem desta solicitação.",
      403,
    );
  }

  return {
    apiBaseUrl: env.API_BASE_URL ?? "http://localhost:4000",
    origin: receivedOrigin,
    fetchImpl: options.fetchImpl ?? fetch,
  };
}

async function apiGet<T>(
  runtime: { apiBaseUrl: string; fetchImpl: typeof fetch },
  credential: string,
  path: string,
): Promise<T> {
  const response = await runtime.fetchImpl(`${runtime.apiBaseUrl}${path}`, {
    headers: buildUpstreamAuthenticationHeaders(credential),
  });

  if (!response.ok) throw downstreamError();
  return (await response.json()) as T;
}

async function materializeActiveRecurrences(
  runtime: { apiBaseUrl: string; origin: string; fetchImpl: typeof fetch },
  credential: string,
  recurrences: readonly RecurrenceRecord[],
  month: string,
): Promise<void> {
  const through = monthToLastDay(month);

  for (const recurrence of recurrences.filter((item) => item.status === "active")) {
    await materializeRecurrenceWithRetry(runtime, credential, recurrence.id, through);
  }
}

async function materializeRecurrenceWithRetry(
  runtime: { apiBaseUrl: string; origin: string; fetchImpl: typeof fetch },
  credential: string,
  recurrenceId: string,
  through: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await runtime.fetchImpl(
        `${runtime.apiBaseUrl}/api/recurrences/${encodeURIComponent(recurrenceId)}/generate-installments`,
        {
          method: "POST",
          headers: {
            ...buildUpstreamAuthenticationHeaders(credential),
            origin: runtime.origin,
            "content-type": "application/json",
          },
          body: JSON.stringify({ through }),
        },
      );

      if (response.ok) return;
      const retryable = response.status === 409 || response.status >= 500;
      if (attempt < 2 && retryable) continue;
      throw downstreamError();
    } catch (error) {
      if (attempt < 2 && !(error instanceof RecurrenceMaterializationError)) continue;
      if (error instanceof RecurrenceMaterializationError) throw error;
      throw downstreamError();
    }
  }
}

function resolveRequestedMonth(url: URL): string {
  const requestedMonth = url.searchParams.get("month");
  if (monthPattern.test(requestedMonth ?? "")) return requestedMonth as string;

  const startsOnMonth = url.searchParams.get("startsOn")?.slice(0, 7);
  if (monthPattern.test(startsOnMonth ?? "")) return startsOnMonth as string;

  return new Date().toISOString().slice(0, 7);
}

function monthToLastDay(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

function downstreamError(): RecurrenceMaterializationError {
  return new RecurrenceMaterializationError(
    "RECURRENCE_MATERIALIZATION_FAILED",
    "Não foi possível atualizar os lançamentos recorrentes.",
    502,
  );
}
