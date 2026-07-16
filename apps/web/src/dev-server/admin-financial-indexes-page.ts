import { formatDateOnly } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { renderAuthenticatedShellDocument } from "./shell.js";
import { sharedShellStyles } from "./shared-styles.js";

type ImportOutcome =
  | "IMPORTED"
  | "ALREADY_UP_TO_DATE"
  | "PROVIDER_NO_RATES"
  | "NO_NEW_RECORDS"
  | "FAILED";

interface DatePeriod {
  startsOn: string;
  endsOn: string;
}

interface ImportOperationDiagnostics {
  kind: "CDI_IMPORT";
  outcome: ImportOutcome;
  requestedPeriod: DatePeriod;
  effectivePeriod: DatePeriod | null;
  providerConsulted: boolean;
  receivedCount: number;
  importedCount: number;
}

interface ProcessingOperationDiagnostics {
  kind: "ACCOUNT_REMUNERATION";
  processedOn: string;
  activeConfigurations: number;
  notEligibleConfigurations: number;
  configurationsWithoutRates: number;
  eligibleCompetences: number;
  alreadyRegisteredCompetences: number;
  processedCompetences: number;
  plannedTransactionsCreated: number;
  nonPositiveBalanceCompetences: number;
  zeroAmountCompetences: number;
  pendingCompetences: number;
}

type OperationDiagnostics =
  ImportOperationDiagnostics | ProcessingOperationDiagnostics;

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
  diagnostics?: OperationDiagnostics | null;
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
  pendingCompetences: number;
  configurationsWithoutRates: number;
  pendingConfigurations: number;
}

export async function renderAdminFinancialIndexesPage(
  token: string,
): Promise<string> {
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

    ${renderFinancialIndexSummary(status)}

    <section class="operation-grid">
      <article class="operation-card">
        <div>
          <p class="eyebrow">Fonte oficial BCB SGS 12</p>
          <h2>Importar CDI</h2>
          <p class="muted">A importação é idempotente: datas já armazenadas não são duplicadas nem substituídas. Com taxas já importadas, a consulta continua automaticamente do dia seguinte à última data armazenada.</p>
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
          <p class="muted">Considera taxas CDI anteriores à data de processamento, usa o saldo final de cada competência e cria receitas previstas sem recalcular resultados já registrados.</p>
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

export function renderFinancialIndexSummary(
  status: FinancialIndexStatusRecord,
): string {
  return `
    <section class="summary-grid" aria-label="Resumo operacional">
      ${summaryCard("Último CDI", status.latestCdiRate ? `${formatRate(status.latestCdiRate.dailyRatePercent)}%` : "Sem dados", status.latestCdiRate ? formatDate(status.latestCdiRate.referenceOn) : "Importe a série oficial")}
      ${summaryCard("Configurações ativas", String(status.activeConfigurations), "Contas elegíveis com remuneração habilitada")}
      ${summaryCard("Competências pendentes", String(status.pendingCompetences), status.pendingCompetences > 0 ? "Aguardam processamento" : "Nenhuma competência pendente")}
      ${summaryCard("Configurações sem taxa", String(status.configurationsWithoutRates), status.configurationsWithoutRates > 0 ? "Importe o CDI necessário" : "Todas as configurações iniciadas possuem taxa")}
    </section>`;
}

function summaryCard(
  label: string,
  value: string,
  description: string,
): string {
  return `<article class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(description)}</p></article>`;
}

export function renderOperation(
  label: string,
  operation: OperationRecord | null,
): string {
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
      ${operation.diagnostics ? renderOperationDiagnostics(operation.diagnostics) : renderLegacyOperationCounts(operation)}
    </section>
  `;
}

function renderOperationDiagnostics(diagnostics: OperationDiagnostics): string {
  if (diagnostics.kind === "CDI_IMPORT") {
    return `
      <dl aria-label="Diagnóstico da importação CDI">
        ${detail("Resultado", formatImportOutcome(diagnostics.outcome))}
        ${detail("Período solicitado", formatPeriod(diagnostics.requestedPeriod))}
        ${detail("Período consultado", diagnostics.effectivePeriod ? formatPeriod(diagnostics.effectivePeriod) : "Não consultado")}
        ${detail("Banco Central", diagnostics.providerConsulted ? "Consultado" : "Não consultado")}
        ${detail("Taxas retornadas", diagnostics.receivedCount)}
        ${detail("Novas taxas importadas", diagnostics.importedCount)}
      </dl>`;
  }

  return `
    <dl aria-label="Diagnóstico do processamento de remunerações">
      ${detail("Data de processamento", formatDate(diagnostics.processedOn))}
      ${detail("Configurações ativas", diagnostics.activeConfigurations)}
      ${detail("Ainda não iniciadas", diagnostics.notEligibleConfigurations)}
      ${detail("Configurações sem taxa", diagnostics.configurationsWithoutRates)}
      ${detail("Competências elegíveis", diagnostics.eligibleCompetences)}
      ${detail("Já registradas", diagnostics.alreadyRegisteredCompetences)}
      ${detail("Competências processadas", diagnostics.processedCompetences)}
      ${detail("Receitas previstas criadas", diagnostics.plannedTransactionsCreated)}
      ${detail("Saldo não positivo", diagnostics.nonPositiveBalanceCompetences)}
      ${detail("Arredondadas para zero", diagnostics.zeroAmountCompetences)}
      ${detail("Competências pendentes", diagnostics.pendingCompetences)}
    </dl>`;
}

function renderLegacyOperationCounts(operation: OperationRecord): string {
  return `
    <dl aria-label="Contagens da operação legada">
      ${detail("Início", formatDateTime(operation.startedAt))}
      ${detail("Importados", operation.importedCount)}
      ${detail("Processados", operation.processedCount)}
      ${detail("Criados", operation.createdCount)}
      ${detail("Pendentes", operation.pendingCount)}
      ${detail("Falhas", operation.failureCount)}
    </dl>`;
}

function detail(label: string, value: string | number): string {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`;
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
  return `<script>${operationFormsScript()}</script>`;
}

export function operationFormsScript(): string {
  return `
    const describeOperation = (operation) => {
      if (!operation) return "Operação concluída.";
      const message = operation.message || "Operação concluída.";
      const diagnostics = operation.diagnostics;
      if (!diagnostics) return message;

      if (diagnostics.kind === "CDI_IMPORT") {
        const provider = diagnostics.providerConsulted ? "Banco Central consultado" : "Banco Central não consultado";
        return message + " " + provider + "; " + diagnostics.receivedCount + " taxa(s) retornada(s) e " + diagnostics.importedCount + " nova(s) taxa(s) importada(s).";
      }

      return message + " " + diagnostics.processedCompetences + " competência(s) processada(s), " + diagnostics.plannedTransactionsCreated + " receita(s) prevista(s) criada(s) e " + diagnostics.pendingCompetences + " pendente(s).";
    };

    document.querySelectorAll("[data-operation-form]").forEach((form) => {
      const status = form.querySelector("[data-form-status]");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(form).entries());

        if (payload.startsOn && payload.endsOn && payload.startsOn > payload.endsOn) {
          status.className = "form-status error";
          status.textContent = "A data inicial não pode ser posterior à data final.";
          return;
        }

        submit.disabled = true;
        status.className = "form-status muted";
        status.textContent = "Executando...";

        try {
          const response = await fetch(form.dataset.path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const body = await response.json().catch(() => ({}));
          const operation = body.operation || (body.status && body.status.latestProcessing);
          status.className = response.ok ? "form-status success" : "form-status error";
          status.textContent = response.ok
            ? describeOperation(operation)
            : ((body.error && body.error.message) || "Não foi possível concluir a operação.");
          if (response.ok) window.setTimeout(() => window.location.reload(), 1200);
        } catch {
          status.className = "form-status error";
          status.textContent = "Não foi possível conectar ao serviço. Tente novamente.";
        } finally {
          submit.disabled = false;
        }
      });
    });
  `;
}

function defaultImportPeriod(): { startsOn: string; endsOn: string } {
  const endsOn = new Date().toISOString().slice(0, 10);
  const start = new Date(`${endsOn}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  return { startsOn: start.toISOString().slice(0, 10), endsOn };
}

function formatRate(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(
    value,
  );
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

function formatPeriod(period: DatePeriod): string {
  return `${formatDate(period.startsOn)} a ${formatDate(period.endsOn)}`;
}

function formatImportOutcome(outcome: ImportOutcome): string {
  if (outcome === "IMPORTED") return "Novas taxas importadas";
  if (outcome === "ALREADY_UP_TO_DATE") return "Série já atualizada";
  if (outcome === "PROVIDER_NO_RATES") return "Fonte sem taxas no período";
  if (outcome === "NO_NEW_RECORDS") return "Nenhum registro novo";
  return "Falha";
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
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
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
