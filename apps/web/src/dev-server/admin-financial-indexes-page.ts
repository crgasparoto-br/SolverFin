import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

interface OperationRecord {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  importedCount: number;
  processedCount: number;
  createdCount: number;
  pendingCount: number;
  failureCount: number;
  message: string | null;
}

interface FinancialIndexStatusRecord {
  latestCdiRate: {
    referenceOn: string;
    dailyRatePercent: number;
    source: string;
    importedAt: string;
  } | null;
  latestImport: OperationRecord | null;
  latestProcessing: OperationRecord | null;
  activeConfigurations: number;
  pendingConfigurations: number;
}

export async function renderAdminFinancialIndexesPage(token: string): Promise<string> {
  const result = await apiGet<{ status: FinancialIndexStatusRecord }>(
    token,
    "/api/admin/financial-indexes/status",
  );

  if (!result.ok) {
    return renderPage(renderError(result.error));
  }

  const status = result.data.status;
  const period = defaultImportPeriod();

  return renderPage(`
    <section class="page-heading">
      <div>
        <p class="eyebrow">Operação global</p>
        <h1>Índices financeiros</h1>
        <p class="muted">Acompanhe a atualização do CDI e execute o processamento diário das contas remuneradas.</p>
      </div>
      <a class="button-link secondary" href="/admin/instituicoes">Instituições</a>
    </section>

    <section class="summary-grid" aria-label="Resumo operacional">
      ${summaryCard("Último CDI", status.latestCdiRate ? `${formatRate(status.latestCdiRate.dailyRatePercent)}%` : "Sem dados", status.latestCdiRate ? formatDate(status.latestCdiRate.referenceOn) : "Importe a série oficial")}
      ${summaryCard("Contas ativas", String(status.activeConfigurations), "Configurações globais habilitadas")}
      ${summaryCard("Pendências", String(status.pendingConfigurations), status.pendingConfigurations > 0 ? "Verifique a importação da taxa" : "Nenhuma pendência detectada")}
    </section>

    <section class="operation-grid">
      <article class="operation-card">
        <div>
          <p class="eyebrow">Fonte oficial BCB SGS 12</p>
          <h2>Importar CDI</h2>
          <p class="muted">A importação é idempotente: datas já armazenadas não são duplicadas nem substituídas.</p>
        </div>
        <form data-operation-form data-path="/api/admin/financial-indexes/cdi/import">
          <label>Data inicial<input name="startsOn" type="date" value="${period.startsOn}" required /></label>
          <label>Data final<input name="endsOn" type="date" value="${period.endsOn}" required /></label>
          <button type="submit">Atualizar CDI</button>
          <p class="form-status muted" data-form-status aria-live="polite"></p>
        </form>
        ${renderOperation("Última importação", status.latestImport)}
      </article>

      <article class="operation-card">
        <div>
          <p class="eyebrow">Rendimentos previstos</p>
          <h2>Processar contas remuneradas</h2>
          <p class="muted">Usa o saldo final da competência e cria receitas previstas sem recalcular registros já gerados.</p>
        </div>
        <form data-operation-form data-path="/api/admin/account-remunerations/process">
          <label>Data de processamento<input name="processedOn" type="date" value="${period.endsOn}" required /></label>
          <button type="submit">Processar agora</button>
          <p class="form-status muted" data-form-status aria-live="polite"></p>
        </form>
        ${renderOperation("Último processamento", status.latestProcessing)}
      </article>
    </section>
    ${script()}
  `);
}

function summaryCard(label: string, value: string, description: string): string {
  return `<article class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(description)}</p></article>`;
}

function renderOperation(label: string, operation: OperationRecord | null): string {
  if (!operation) {
    return `<section class="last-operation"><strong>${escapeHtml(label)}</strong><p class="muted">Nenhuma execução registrada.</p></section>`;
  }

  return `
    <section class="last-operation">
      <div class="operation-heading">
        <strong>${escapeHtml(label)}</strong>
        <span class="status ${statusTone(operation.status)}">${escapeHtml(formatStatus(operation.status))}</span>
      </div>
      <p>${escapeHtml(operation.message ?? "Execução concluída sem mensagem adicional.")}</p>
      <dl>
        <div><dt>Início</dt><dd>${escapeHtml(formatDateTime(operation.startedAt))}</dd></div>
        <div><dt>Importados</dt><dd>${operation.importedCount}</dd></div>
        <div><dt>Processados</dt><dd>${operation.processedCount}</dd></div>
        <div><dt>Criados</dt><dd>${operation.createdCount}</dd></div>
        <div><dt>Pendentes</dt><dd>${operation.pendingCount}</dd></div>
        <div><dt>Falhas</dt><dd>${operation.failureCount}</dd></div>
      </dl>
    </section>
  `;
}

function renderError(error: string): string {
  return `
    <section class="error-state">
      <p class="eyebrow">Acesso administrativo</p>
      <h1>Índices financeiros</h1>
      <p class="error" role="alert">${escapeHtml(error)}</p>
      <a class="button-link" href="/admin/indices-financeiros">Tentar novamente</a>
    </section>
  `;
}

function renderPage(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/admin/indices-financeiros",
    currentLabel: "Admin - Índices financeiros",
    content,
    styles: css(),
  });
}

function script(): string {
  return `
    <script>
      document.querySelectorAll("[data-operation-form]").forEach((form) => {
        const status = form.querySelector("[data-form-status]");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const submit = form.querySelector('button[type="submit"]');
          const payload = Object.fromEntries(new FormData(form).entries());
          submit.disabled = true;
          status.className = "form-status muted";
          status.textContent = "Executando...";
          const response = await fetch(form.dataset.path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const body = await response.json().catch(() => ({}));
          const operation = body.operation || (body.status && body.status.latestProcessing);
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = response.ok
            ? ((operation && operation.message) || "Operação concluída.")
            : ((body.error && body.error.message) || "Não foi possível concluir a operação.");
          submit.disabled = false;
          if (response.ok) window.setTimeout(() => window.location.reload(), 650);
        });
      });
    </script>
  `;
}

function defaultImportPeriod(): { startsOn: string; endsOn: string } {
  const endsOn = new Date().toISOString().slice(0, 10);
  const start = new Date(`${endsOn}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  return { startsOn: start.toISOString().slice(0, 10), endsOn };
}

function formatRate(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(value);
}

function formatDate(value: string): string {
  return formatDateOnly(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatStatus(status: string): string {
  if (status === "SUCCESS") return "Concluído";
  if (status === "PARTIAL") return "Parcial";
  if (status === "FAILED") return "Falhou";
  if (status === "RUNNING") return "Em execução";
  return status;
}

function statusTone(status: string): string {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PARTIAL") return "warning";
  return "neutral";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function css(): string {
  return `
    ${sharedShellStyles()}
    main { display: grid; gap: 14px; margin: 0 auto; max-width: 1280px; padding: 18px 20px; width: 100%; }
    .page-heading { align-items: center; display: flex; gap: 16px; justify-content: space-between; }
    .page-heading > div { display: grid; gap: 4px; max-width: 780px; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .summary-card, .operation-card, .error-state { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .summary-card { display: grid; gap: 4px; padding: 14px; }
    .summary-card span { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .summary-card strong { font-size: 1.125rem; }
    .summary-card p { color: var(--muted); font-size: 0.8125rem; }
    .operation-grid { align-items: start; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .operation-card { display: grid; gap: 14px; padding: 14px; }
    .operation-card > div:first-child { display: grid; gap: 4px; }
    .operation-card form { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .operation-card form button, .operation-card .form-status { grid-column: 1 / -1; }
    .form-status { font-size: 0.8125rem; }
    .last-operation { border-top: 1px solid var(--line); display: grid; gap: 9px; padding-top: 12px; }
    .operation-heading { align-items: center; display: flex; gap: 10px; justify-content: space-between; }
    .last-operation > p { color: var(--muted); font-size: 0.8125rem; }
    .last-operation dl { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .last-operation dl div { background: var(--surface-soft); border-radius: var(--radius); display: grid; gap: 2px; padding: 8px; }
    .last-operation dt { color: var(--muted); font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
    .last-operation dd { font-size: 0.8125rem; font-weight: 700; margin: 0; }
    .status { border-radius: 999px; font-size: 0.6875rem; font-weight: 700; padding: 3px 8px; }
    .status.success { background: var(--success-bg); color: var(--success); }
    .status.danger { background: var(--danger-bg); color: var(--danger); }
    .status.warning { background: var(--warning-bg); color: var(--warning); }
    .status.neutral { background: var(--surface-soft); color: var(--muted); }
    .error-state { display: grid; gap: 8px; justify-items: start; padding: 18px; }
    @media (max-width: 860px) { .summary-grid, .operation-grid { grid-template-columns: 1fr; } }
    @media (max-width: 620px) { .page-heading, .operation-card form, .last-operation dl { display: grid; grid-template-columns: 1fr; } .operation-card form button, .operation-card .form-status { grid-column: auto; } }
  `;
}
