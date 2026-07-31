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

export function requiresRecurrenceMaterialization(
  url: URL,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.SOLVERFIN_SSR_STYLE_CONTRACT_VALIDATION === "1") return false;
  return url.searchParams.get("materialized") !== "1";
}

export function withoutRecurrenceMaterializationMarker(url: URL): URL {
  const next = new URL(url.toString());
  next.searchParams.delete("materialized");
  return next;
}

export function enhanceWithRecurrenceMaterializationMarkerCleanup(html: string): string {
  const script = `<script data-recurrence-marker-cleanup>
(() => {
  const current = new URL(window.location.href);
  if (!current.searchParams.has("materialized")) return;
  current.searchParams.delete("materialized");
  window.history.replaceState(null, "", current.pathname + current.search + current.hash);
})();
</script>`;

  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
}

export function renderRecurrenceMaterializationGate(surface: "account" | "card", url: URL): string {
  const query = new URLSearchParams({ surface });
  for (const key of ["month", "startsOn", "accountId", "cardId"] as const) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  const next = new URL(url.toString());
  next.searchParams.set("materialized", "1");
  const endpoint = `/api/recurrence-materialization?${query.toString()}`;
  const target = `${next.pathname}${next.search}`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Atualizando lançamentos recorrentes</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { align-items: center; background: #f8fafc; color: #0f172a; display: grid; margin: 0; min-height: 100vh; padding: 24px; }
      main, section { background: #fff; border: 1px solid #dbe3ee; border-radius: 10px; display: grid; gap: 12px; margin: auto; max-width: 480px; padding: 24px; text-align: center; width: 100%; }
      h1, p { margin: 0; }
      p { color: #64748b; line-height: 1.5; }
      [role="status"]::before { animation: spin 1s linear infinite; border: 3px solid #dbe3ee; border-top-color: #0f3d4c; border-radius: 50%; content: ""; display: block; height: 28px; margin: 0 auto 16px; width: 28px; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
      a, button { background: #0f3d4c; border: 0; border-radius: 8px; color: #fff; cursor: pointer; font: inherit; font-weight: 700; padding: 11px 16px; text-decoration: none; }
      a.secondary { background: #eef5f8; color: #0f3d4c; }
      [hidden] { display: none !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main role="status" aria-live="polite" data-materialization-progress>
      <h1>Atualizando lançamentos recorrentes</h1>
      <p>Aguarde enquanto o SolverFin prepara os dados do período selecionado.</p>
    </main>
    <section role="alert" data-materialization-error hidden>
      <h1>Não foi possível atualizar as recorrências</h1>
      <p>Verifique sua conexão e tente novamente. Você também pode continuar sem a atualização deste período.</p>
      <div class="actions">
        <button type="button" data-materialization-retry>Tentar novamente</button>
        <a class="secondary" href=${JSON.stringify(target)}>Continuar sem atualização</a>
      </div>
    </section>
    <script>
      (() => {
        const endpoint = ${JSON.stringify(endpoint)};
        const target = ${JSON.stringify(target)};
        const progress = document.querySelector("[data-materialization-progress]");
        const failure = document.querySelector("[data-materialization-error]");
        const retry = document.querySelector("[data-materialization-retry]");
        const showFailure = () => {
          if (progress) progress.hidden = true;
          if (failure) failure.hidden = false;
        };
        retry?.addEventListener("click", () => window.location.reload());
        fetch(endpoint, { method: "POST", credentials: "same-origin" })
          .then((response) => {
            if (!response.ok) {
              showFailure();
              return;
            }
            window.location.replace(target);
          })
          .catch(showFailure);
      })();
    </script>
  </body>
</html>`;
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
