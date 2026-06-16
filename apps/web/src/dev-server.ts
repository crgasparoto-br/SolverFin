import { createServer } from "node:http";

import { buildAvailabilityDashboardViewModel, type DailyAvailabilityResult } from "./dashboard/availability.js";
import { buildSolverFinWebManifest } from "./pwa/manifest.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5173);
const manifest = buildSolverFinWebManifest();

const demoAvailability: DailyAvailabilityResult = {
  availableTodayMinor: 94500,
  projectedBalanceMinor: 94500,
  currency: "BRL",
  horizonStartOn: "2026-06-16",
  horizonEndOn: "2026-06-30",
  confidence: "medium",
  components: [
    {
      label: "Saldo atual",
      kind: "balance",
      amountMinor: 50000,
      confidence: "high",
      source: "accounts",
    },
    {
      label: "Receita prevista",
      kind: "income",
      amountMinor: 100000,
      confidence: "high",
      source: "payables_receivables",
    },
    {
      label: "Fatura do cartao",
      kind: "card",
      amountMinor: -25000,
      confidence: "high",
      source: "invoices",
    },
    {
      label: "Mercado recorrente",
      kind: "inferred",
      amountMinor: -18000,
      confidence: "medium",
      source: "statistical_recurrences",
    },
    {
      label: "Margem de seguranca",
      kind: "safety_margin",
      amountMinor: -12500,
      confidence: "medium",
      source: "financial_assumptions",
    },
  ],
  assumptions: [
    "Horizonte padrao de 30 dias.",
    "Margem de seguranca padrao de 10% sobre compromissos futuros.",
  ],
  appliedAssumptionIds: ["demo-horizon", "demo-safety-margin"],
  limitations: ["Ambiente de desenvolvimento com dados demonstrativos."],
  calculatedAt: new Date().toISOString(),
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/manifest.webmanifest") {
    response.writeHead(200, { "content-type": "application/manifest+json; charset=utf-8" });
    response.end(JSON.stringify(manifest, null, 2));
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", app: "solverfin-web" }));
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(renderHomePage());
});

server.listen(port, host, () => {
  console.log(`SolverFin web dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
});

function renderHomePage(): string {
  const viewModel = buildAvailabilityDashboardViewModel({ result: demoAvailability });
  const card = viewModel.card;
  const sections = viewModel.detailSections
    .map(
      (section) => `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          <div class="rows">
            ${section.rows
              .map(
                (row) => `
                  <div class="row">
                    <div>
                      <strong>${escapeHtml(row.label)}</strong>
                      <span>${escapeHtml(row.source)} - confianca ${escapeHtml(row.confidence)}</span>
                    </div>
                    <strong>${escapeHtml(row.amountText)}</strong>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");
  const reviews = viewModel.reviewItems
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.description)}</span>
        </li>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>SolverFin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f8fb;
        --panel: #ffffff;
        --text: #172033;
        --muted: #667085;
        --line: #d9e2ec;
        --accent: #146c5f;
        --accent-soft: #dff3ee;
        --warn: #8a5a00;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      main {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 28px;
      }

      h1, h2, p { margin: 0; }

      h1 { font-size: 28px; line-height: 1.15; }
      h2 { font-size: 16px; margin-bottom: 14px; }

      .brand {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .brand span, .subtitle, .row span, li span { color: var(--muted); }

      .status {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 8px 12px;
        background: var(--panel);
        color: var(--accent);
        font-weight: 700;
        font-size: 13px;
      }

      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        gap: 20px;
        align-items: start;
      }

      .availability {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 24px;
      }

      .amount {
        display: block;
        margin: 14px 0 8px;
        font-size: clamp(40px, 7vw, 68px);
        line-height: 1;
        color: var(--accent);
        letter-spacing: 0;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 22px;
      }

      button {
        min-height: 44px;
        border: 1px solid var(--accent);
        border-radius: 8px;
        padding: 0 14px;
        background: var(--accent);
        color: white;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      button.secondary {
        background: var(--panel);
        color: var(--accent);
      }

      .section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 18px;
        margin-bottom: 16px;
      }

      .rows { display: grid; gap: 12px; }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--line);
      }

      .row:last-child { border-bottom: 0; padding-bottom: 0; }
      .row div { display: grid; gap: 4px; }
      .row > strong { white-space: nowrap; }

      .review {
        margin-top: 16px;
        padding: 18px;
        border-radius: 8px;
        background: var(--accent-soft);
      }

      .review ul {
        margin: 12px 0 0;
        padding-left: 18px;
      }

      .review li { margin-bottom: 10px; }
      .review li strong, .review li span { display: block; }

      @media (max-width: 780px) {
        main { width: min(100% - 24px, 640px); padding-top: 20px; }
        header, .grid { display: grid; grid-template-columns: 1fr; }
        .availability, .section, .review { padding: 16px; }
        .row { align-items: start; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="brand">
          <h1>SolverFin</h1>
          <span>Ambiente web de desenvolvimento</span>
        </div>
        <div class="status">/health ativo</div>
      </header>

      <div class="grid">
        <section class="availability" aria-labelledby="availability-title">
          <h2 id="availability-title">${escapeHtml(card.title)}</h2>
          <strong class="amount">${escapeHtml(card.amountText ?? "-")}</strong>
          <p class="subtitle">${escapeHtml(card.subtitle)}</p>
          <div class="actions">
            <button type="button">Abrir detalhes</button>
            <button class="secondary" type="button">Editar premissas</button>
            <button class="secondary" type="button">Revisar recorrencias</button>
          </div>
        </section>

        <aside>
          ${sections}
          <section class="review">
            <h2>Revisoes sugeridas</h2>
            <ul>${reviews}</ul>
          </section>
        </aside>
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
