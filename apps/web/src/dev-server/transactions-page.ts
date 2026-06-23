import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { apiGet } from "./api.js";
import { privateRoutes } from "./routes.js";

interface AccountRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
  openingBalanceMinor: number;
}

interface CategoryRecord {
  id: string;
  name: string;
  kind: string;
  status: string;
}

interface TransactionRecord {
  id: string;
  description: string;
  kind: string;
  status: string;
  amountMinor: number;
  occurredOn: string;
  plannedOn: string;
  effectiveOn?: string;
  accountId?: string;
  destinationAccountId?: string;
  categoryId?: string;
  cardId?: string;
  invoiceId?: string;
}

interface StatementFilters {
  accountId?: string;
  startsOn: string;
  endsOn: string;
}

interface StatementRow {
  transaction: TransactionRecord;
  amountMinor: number;
  balanceAfterMinor?: number;
}

interface StatementSummary {
  openingMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  plannedBalanceMinor: number;
  effectiveBalanceMinor: number;
  reconciledMinor: number;
  unreconciledMinor: number;
  pendingMinor: number;
  pendingCount: number;
  reconciledCount: number;
  unreconciledCount: number;
}

export async function renderTransactionsPage(token: string, url?: URL): Promise<string> {
  const [accountsResult, categoriesResult] = await Promise.all([
    apiGet<{ accounts: AccountRecord[] }>(token, "/api/accounts"),
    apiGet<{ categories: CategoryRecord[] }>(token, "/api/categories"),
  ]);

  if (!accountsResult.ok) return renderErrorPage(accountsResult.error);

  const accounts = accountsResult.data.accounts.filter((account) => account.status === "active");
  const categories = categoriesResult.ok ? categoriesResult.data.categories : [];
  const filters = resolveFilters(url, accounts);
  const selectedAccount = accounts.find((account) => account.id === filters.accountId);
  const transactionResult = filters.accountId
    ? await apiGet<{ transactions: TransactionRecord[] }>(
        token,
        `/api/transactions?${buildTransactionQuery(filters)}`,
      )
    : ({ ok: true, data: { transactions: [] } } as const);

  if (!transactionResult.ok) return renderErrorPage(transactionResult.error);

  const rows = buildRows(
    transactionResult.data.transactions.filter(
      (transaction) => transaction.cardId === undefined && transaction.invoiceId === undefined,
    ),
    selectedAccount,
  );
  const summary = summarize(rows, selectedAccount);

  return renderPage({
    title: "Lançamentos - SolverFin",
    body: `
      <div class="app-shell">
        ${renderSidebar()}
        <div class="main-area">
          <header class="topbar"><strong>Extrato da conta</strong><button type="button" data-logout>Sair</button></header>
          <main>
            <section class="statement-heading">
              <div>
                <p class="eyebrow">Extrato bancário</p>
                <h1>Lançamentos</h1>
                <p class="muted">Movimentações por conta e período, sem compras de cartão misturadas.</p>
              </div>
              <button type="button" class="button-link" data-open-modal${selectedAccount ? "" : " disabled"}>Novo lançamento</button>
            </section>

            <section class="panel account-filter">
              <form class="filter-form" method="get" action="/lancamentos">
                <label>Conta<select name="accountId" required><option value="">Selecione uma conta</option>${renderAccountOptions(accounts, filters.accountId)}</select></label>
                <label>Início<input name="startsOn" type="date" value="${escapeHtml(filters.startsOn)}" required /></label>
                <label>Fim<input name="endsOn" type="date" value="${escapeHtml(filters.endsOn)}" required /></label>
                <button type="submit">Filtrar</button>
              </form>
              ${
                selectedAccount
                  ? `<p class="muted">Conta selecionada: <strong>${escapeHtml(selectedAccount.name)}</strong>.</p>`
                  : `<p class="warning">Selecione uma conta para consultar o extrato e criar lançamentos.</p>`
              }
            </section>

            <section class="summary-grid" aria-label="Situação do período">
              ${metric("Saldo inicial", summary.openingMinor, "Antes do período")}
              ${metric("Entradas", summary.incomeMinor, "Créditos da conta")}
              ${metric("Saídas", -summary.expenseMinor, "Débitos da conta")}
              ${metric("Saldo previsto", summary.plannedBalanceMinor, "Inclui pendências")}
              ${metric("Saldo efetivo", summary.effectiveBalanceMinor, "Com data efetiva")}
              ${metric("Conciliado", summary.reconciledMinor, `${summary.reconciledCount} conferidos`)}
              ${metric("Não conciliado", summary.unreconciledMinor, `${summary.unreconciledCount} em aberto`)}
              ${metric("Pendentes", summary.pendingMinor, `${summary.pendingCount} sem data efetiva`)}
            </section>

            <section class="panel statement-panel">
              <div class="statement-toolbar">
                <div>
                  <h2>${selectedAccount ? `Extrato de ${escapeHtml(selectedAccount.name)}` : "Extrato"}</h2>
                  <p class="muted">${formatDate(filters.startsOn)} até ${formatDate(filters.endsOn)}</p>
                </div>
                <div class="chips">
                  ${chip("Pendentes", summary.pendingCount, "pending")}
                  ${chip("Não conciliados", summary.unreconciledCount, "posted")}
                  ${chip("Conciliados", summary.reconciledCount, "ok")}
                </div>
              </div>
              <div class="statement-table" role="table" aria-label="Extrato bancário">
                ${renderTableHeader()}
                ${
                  rows.length > 0
                    ? rows.map((row) => renderRow(row, selectedAccount, accounts, categories)).join("")
                    : emptyState(
                        selectedAccount ? "Nenhum lançamento neste período." : "Selecione uma conta.",
                        selectedAccount
                          ? "Ajuste o filtro ou crie um lançamento para acompanhar o saldo."
                          : "O extrato é sempre exibido por conta bancária.",
                      )
                }
              </div>
            </section>
          </main>
        </div>
      </div>
      ${renderModal(selectedAccount, accounts, categories)}
      ${clientScript()}
    `,
  });
}

function resolveFilters(url: URL | undefined, accounts: AccountRecord[]): StatementFilters {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const accountId = url?.searchParams.get("accountId") ?? accounts[0]?.id;

  return {
    ...(accountId ? { accountId } : {}),
    startsOn: url?.searchParams.get("startsOn") ?? start.toISOString().slice(0, 10),
    endsOn: url?.searchParams.get("endsOn") ?? end.toISOString().slice(0, 10),
  };
}

function buildTransactionQuery(filters: StatementFilters): string {
  return new URLSearchParams({
    status: "all",
    accountId: filters.accountId ?? "",
    plannedFrom: filters.startsOn,
    plannedTo: filters.endsOn,
  }).toString();
}

function buildRows(
  transactions: TransactionRecord[],
  selectedAccount: AccountRecord | undefined,
): StatementRow[] {
  let balance = selectedAccount?.openingBalanceMinor ?? 0;

  return transactions
    .filter((transaction) => transaction.status !== "voided")
    .sort((left, right) => statementDate(left).localeCompare(statementDate(right)))
    .map((transaction) => {
      const amountMinor = signedAmount(transaction, selectedAccount?.id);
      const effective = transaction.effectiveOn !== undefined;
      if (effective) balance += amountMinor;

      return {
        transaction,
        amountMinor,
        ...(effective ? { balanceAfterMinor: balance } : {}),
      };
    });
}

function summarize(rows: StatementRow[], selectedAccount: AccountRecord | undefined): StatementSummary {
  const openingMinor = selectedAccount?.openingBalanceMinor ?? 0;

  return rows.reduce<StatementSummary>(
    (summary, row) => {
      const absolute = Math.abs(row.amountMinor);

      if (row.amountMinor >= 0) summary.incomeMinor += row.amountMinor;
      if (row.amountMinor < 0) summary.expenseMinor += absolute;
      summary.plannedBalanceMinor += row.amountMinor;

      if (row.transaction.effectiveOn === undefined) {
        summary.pendingMinor += absolute;
        summary.pendingCount += 1;
        return summary;
      }

      summary.effectiveBalanceMinor += row.amountMinor;
      if (row.transaction.status === "reconciled") {
        summary.reconciledMinor += absolute;
        summary.reconciledCount += 1;
      } else {
        summary.unreconciledMinor += absolute;
        summary.unreconciledCount += 1;
      }

      return summary;
    },
    {
      openingMinor,
      incomeMinor: 0,
      expenseMinor: 0,
      plannedBalanceMinor: openingMinor,
      effectiveBalanceMinor: openingMinor,
      reconciledMinor: 0,
      unreconciledMinor: 0,
      pendingMinor: 0,
      pendingCount: 0,
      reconciledCount: 0,
      unreconciledCount: 0,
    },
  );
}

function renderTableHeader(): string {
  return `
    <div class="statement-row statement-head" role="row">
      <span>Data</span><span>Histórico</span><span>Categoria</span><span>Tipo</span>
      <span>Situação</span><span>Valor</span><span>Saldo</span><span>Ações</span>
    </div>
  `;
}

function renderRow(
  row: StatementRow,
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  const { transaction } = row;
  const categoryName = transaction.categoryId
    ? (categories.find((category) => category.id === transaction.categoryId)?.name ??
      "Categoria não localizada")
    : "Sem categoria";
  const statusTone =
    transaction.status === "reconciled"
      ? "ok"
      : transaction.effectiveOn !== undefined
        ? "posted"
        : "pending";
  const nextStatus = transaction.status === "reconciled" ? "posted" : "reconciled";
  const date = statementDate(transaction);

  return `
    <article class="statement-row statement-body" role="row">
      <time datetime="${escapeHtml(date)}">${formatDate(date)}</time>
      <div class="description">
        <strong>${escapeHtml(transaction.description || "(sem descrição)")}</strong>
        ${renderTransferNote(transaction, selectedAccount, accounts)}
      </div>
      <span>${escapeHtml(categoryName)}</span>
      <span>${escapeHtml(formatKind(transaction.kind))}</span>
      <span class="chip chip-${statusTone}">${escapeHtml(formatStatus(transaction))}</span>
      <strong class="${row.amountMinor < 0 ? "debit" : "credit"}">${formatMoney(row.amountMinor)}</strong>
      <strong>${row.balanceAfterMinor === undefined ? "Previsto" : formatMoney(row.balanceAfterMinor)}</strong>
      <details class="actions">
        <summary aria-label="Ações do lançamento ${escapeHtml(transaction.description || "sem descrição")}">...</summary>
        <div>
          <button type="button" data-edit="${escapeHtml(transaction.id)}">Editar</button>
          <button type="button" data-action data-method="PATCH" data-path="/api/transactions/${escapeHtml(transaction.id)}" data-payload='${escapeHtml(JSON.stringify({ status: nextStatus }))}'>${transaction.status === "reconciled" ? "Desconciliar" : "Marcar como conciliado"}</button>
          <button type="button" data-clone="${escapeHtml(transaction.id)}">Clonar</button>
          <button type="button" class="danger" data-action data-method="POST" data-path="/api/transactions/${escapeHtml(transaction.id)}/void" data-confirm="${escapeHtml(transaction.status === "reconciled" ? "Este lançamento já está conciliado. Excluir mesmo assim?" : "Excluir este lançamento?")}">Excluir</button>
        </div>
      </details>
      <script type="application/json" data-transaction="${escapeHtml(transaction.id)}">${serializeScriptJson(transaction)}</script>
    </article>
  `;
}

function renderTransferNote(
  transaction: TransactionRecord,
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
): string {
  if (transaction.kind !== "transfer") return "";

  const origin = accounts.find((account) => account.id === transaction.accountId)?.name;
  const destination = accounts.find((account) => account.id === transaction.destinationAccountId)?.name;
  const text =
    selectedAccount?.id === transaction.destinationAccountId
      ? `Recebida de ${origin ?? "outra conta"}`
      : `Enviada para ${destination ?? "outra conta"}`;

  return `<span>${escapeHtml(text)}</span>`;
}

function renderModal(
  selectedAccount: AccountRecord | undefined,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): string {
  return `
    <dialog data-modal>
      <section class="modal-panel">
        <form method="dialog" class="close-form"><button type="submit">Fechar</button></form>
        <div>
          <p class="eyebrow">Lançamento da conta</p>
          <h2 data-modal-title>${selectedAccount ? `Novo lançamento em ${escapeHtml(selectedAccount.name)}` : "Selecione uma conta"}</h2>
          <p class="muted">A conta vem do filtro principal e não pode ser trocada neste modal.</p>
        </div>
        <form data-form data-path="/api/transactions">
          <input name="accountId" type="hidden" value="${escapeHtml(selectedAccount?.id ?? "")}" />
          <label>Tipo<select name="kind" required>${renderKindOptions()}</select></label>
          <label>Valor (R$)<input name="amountMinor" data-money inputmode="decimal" required placeholder="0,00" /></label>
          <label>Data prevista<input name="plannedOn" type="date" required /></label>
          <label>Data efetiva<input name="effectiveOn" type="date" /></label>
          <label>Situação<select name="status"><option value="posted">Efetivado não conciliado</option><option value="reconciled">Conciliado</option><option value="planned">Previsto/pendente</option></select></label>
          <label>Categoria<select name="categoryId"><option value="">Sem categoria</option>${renderCategoryOptions(categories)}</select></label>
          <label>Conta destino<select name="destinationAccountId"><option value="">Apenas transferência</option>${renderAccountOptions(accounts)}</select></label>
          <label>Repetição<select name="repeatMode"><option value="single">Único</option><option value="installment">Parcelado</option><option value="fixed">Fixo</option></select></label>
          <label>Parcelas<input name="installments" type="number" min="2" max="60" value="2" /></label>
          <label>Frequência<select name="frequency"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="yearly">Anual</option></select></label>
          <label>Fim opcional<input name="endOn" type="date" /></label>
          <label class="full">Descrição<input name="description" required /></label>
          <label class="full">Observação<textarea name="note" rows="3"></textarea></label>
          <label class="full">Editar repetição<select name="editScope"><option>Somente este lançamento</option><option>Este e os próximos</option><option>Toda a repetição</option></select></label>
          <button type="submit"${selectedAccount ? "" : " disabled"}>Salvar lançamento</button>
        </form>
      </section>
    </dialog>
  `;
}

function clientScript(): string {
  return `
    <script>
      const modal = document.querySelector("[data-modal]");
      const form = document.querySelector("[data-form]");
      const statusNode = document.createElement("p");
      statusNode.className = "muted";
      statusNode.setAttribute("aria-live", "polite");
      form && form.appendChild(statusNode);

      function moneyToMinor(value) {
        return Math.round(parseFloat(String(value).replace(",", ".")) * 100);
      }

      function addMonths(dateValue, months) {
        const date = new Date(dateValue + "T00:00:00Z");
        date.setUTCMonth(date.getUTCMonth() + months);
        return date.toISOString().slice(0, 10);
      }

      function payload(index, total) {
        const data = new FormData(form);
        const plannedOn = index ? addMonths(String(data.get("plannedOn")), index) : String(data.get("plannedOn"));
        const effectiveBase = String(data.get("effectiveOn") || "");
        const effectiveOn = effectiveBase ? (index ? addMonths(effectiveBase, index) : effectiveBase) : "";
        const result = {
          kind: String(data.get("kind")),
          amountMinor: moneyToMinor(data.get("amountMinor")),
          occurredOn: effectiveOn || plannedOn,
          plannedOn,
          effectiveOn: effectiveOn || null,
          accountId: String(data.get("accountId")),
          description: String(data.get("description") || "") + (total > 1 ? " " + (index + 1) + "/" + total : ""),
          status: effectiveOn ? String(data.get("status")) : "planned"
        };
        const destinationAccountId = String(data.get("destinationAccountId") || "");
        const categoryId = String(data.get("categoryId") || "");
        const note = String(data.get("note") || "").trim();
        if (destinationAccountId) result.destinationAccountId = destinationAccountId;
        if (categoryId) result.categoryId = categoryId;
        if (note) result.description += " - " + note;
        return result;
      }

      async function send(path, method, body) {
        return fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }

      async function message(response) {
        const body = await response.json().catch(() => ({}));
        return response.ok ? "Ação concluída. Atualizando..." : ((body.error && body.error.message) || "Não foi possível concluir a ação.");
      }

      document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
        await fetch("/api/session", { method: "DELETE" });
        window.location.assign("/login");
      }));

      document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", () => {
        if (button.disabled) return;
        form.reset();
        form.dataset.path = "/api/transactions";
        form.dataset.method = "POST";
        document.querySelector("[data-modal-title]").textContent = document.querySelector("[data-modal-title]").textContent.replace("Editar", "Novo").replace("Clonar", "Novo");
        modal.showModal();
      }));

      document.querySelectorAll("[data-transaction]").forEach((node) => {
        const transaction = JSON.parse(node.textContent);
        const hydrate = (selector, clone) => {
          const button = document.querySelector(selector + transaction.id + '\"]');
          if (!button) return;
          button.addEventListener("click", () => {
            form.reset();
            form.dataset.path = clone ? "/api/transactions" : "/api/transactions/" + transaction.id;
            form.dataset.method = clone ? "POST" : "PATCH";
            form.kind.value = transaction.kind;
            form.amountMinor.value = (transaction.amountMinor / 100).toFixed(2).replace(".", ",");
            form.plannedOn.value = transaction.plannedOn || transaction.occurredOn;
            form.effectiveOn.value = transaction.effectiveOn || "";
            form.status.value = transaction.status === "reconciled" ? "reconciled" : transaction.effectiveOn ? "posted" : "planned";
            form.destinationAccountId.value = transaction.destinationAccountId || "";
            form.categoryId.value = transaction.categoryId || "";
            form.description.value = clone ? "Cópia de " + transaction.description : transaction.description;
            document.querySelector("[data-modal-title]").textContent = clone ? "Clonar lançamento" : "Editar lançamento";
            modal.showModal();
          });
        };
        hydrate('[data-edit="', false);
        hydrate('[data-clone="', true);
      });

      form && form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const mode = form.repeatMode.value;
        const method = form.dataset.method || "POST";
        let response;
        statusNode.textContent = "Salvando...";
        if (mode === "fixed" && method === "POST") {
          const item = payload(0, 1);
          response = await send("/api/recurrences", "POST", {
            frequency: form.frequency.value,
            startOn: form.plannedOn.value,
            endOn: form.endOn.value || undefined,
            amountMinor: item.amountMinor,
            description: item.description,
            accountId: item.accountId,
            categoryId: item.categoryId
          });
        } else if (mode === "installment" && method === "POST") {
          const total = Math.max(2, Number(form.installments.value || 2));
          const responses = [];
          for (let index = 0; index < total; index += 1) responses.push(await send("/api/transactions", "POST", payload(index, total)));
          response = responses.find((item) => !item.ok) || responses[responses.length - 1];
        } else {
          response = await send(form.dataset.path || "/api/transactions", method, payload(0, 1));
        }
        statusNode.textContent = await message(response);
        if (response.ok) window.setTimeout(() => window.location.reload(), 450);
      });

      document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
        if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
        const response = await send(button.dataset.path, button.dataset.method || "POST", button.dataset.payload ? JSON.parse(button.dataset.payload) : {});
        if (response.ok) window.setTimeout(() => window.location.reload(), 450);
      }));
    </script>
  `;
}

function renderPage(input: { title: string; body: string }): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(input.title)}</title><style>${css()}</style></head><body>${input.body}</body></html>`;
}

function renderSidebar(): string {
  return `
    <aside class="sidebar">
      <a class="brand" href="/dashboard">SolverFin</a>
      <nav>${Array.from(privateRoutes.entries())
        .map(
          ([path, label]) =>
            `<a href="${path}"${path === "/lancamentos" ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`,
        )
        .join("")}</nav>
      <button class="logout" type="button" data-logout>Sair</button>
    </aside>
  `;
}

function renderErrorPage(error: string): string {
  return renderPage({
    title: "Lançamentos - SolverFin",
    body: `<main class="error-page"><section class="panel"><p class="eyebrow">Erro ao carregar dados</p><h1>Lançamentos</h1><p class="error">${escapeHtml(error)}</p><a class="button-link" href="/lancamentos">Tentar novamente</a></section></main>`,
  });
}

function renderKindOptions(): string {
  return [
    ["income", "Entrada"],
    ["expense", "Saída"],
    ["transfer", "Transferência"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function renderAccountOptions(accounts: AccountRecord[], selected?: string): string {
  return accounts
    .map(
      (account) =>
        `<option value="${escapeHtml(account.id)}"${selected === account.id ? " selected" : ""}>${escapeHtml(account.name)}</option>`,
    )
    .join("");
}

function renderCategoryOptions(categories: CategoryRecord[], selected?: string): string {
  return categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHtml(category.name)}</option>`,
    )
    .join("");
}

function signedAmount(transaction: TransactionRecord, selectedAccountId: string | undefined): number {
  if (transaction.kind === "income") return transaction.amountMinor;
  if (transaction.kind === "expense") return -transaction.amountMinor;
  if (transaction.kind === "transfer" && transaction.destinationAccountId === selectedAccountId) {
    return transaction.amountMinor;
  }
  if (transaction.kind === "transfer" && transaction.accountId === selectedAccountId) {
    return -transaction.amountMinor;
  }
  return 0;
}

function statementDate(transaction: TransactionRecord): string {
  return transaction.effectiveOn ?? transaction.plannedOn ?? transaction.occurredOn;
}

function metric(title: string, amountMinor: number, subtitle: string): string {
  return `<article class="metric"><span>${escapeHtml(title)}</span><strong class="${amountMinor < 0 ? "debit" : amountMinor > 0 ? "credit" : ""}">${formatMoney(amountMinor)}</strong><p>${escapeHtml(subtitle)}</p></article>`;
}

function chip(label: string, count: number, tone: string): string {
  return `<span class="chip chip-${tone}"><strong>${count}</strong>${escapeHtml(label)}</span>`;
}

function emptyState(title: string, description: string): string {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function formatKind(kind: string): string {
  if (kind === "income") return "Entrada";
  if (kind === "expense") return "Saída";
  if (kind === "transfer") return "Transferência";
  return kind;
}

function formatStatus(transaction: TransactionRecord): string {
  if (transaction.status === "reconciled") return "Conciliado";
  if (transaction.effectiveOn !== undefined) return "Efetivado";
  if (transaction.status === "suggested") return "Pendente";
  return "Previsto";
}

function formatMoney(amountMinor: number): string {
  return formatMinorCurrency(amountMinor);
}

function formatDate(value: string): string {
  return formatDateOnly(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function css(): string {
  return `
    :root{--bg:#f8fafc;--surface:#fff;--text:#0f172a;--muted:#475569;--line:#cbd5e1;--primary:#0f3d4c;--soft:#e8f3f6;--cyan:#0891b2;--green:#166534;--green-bg:#dcfce7;--red:#dc2626;--red-bg:#fee2e2;--amber:#b45309;--amber-bg:#fef3c7}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1,h2,p{margin:0}button,a,input,select,textarea{font:inherit}.app-shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}.sidebar{background:var(--primary);color:white;display:flex;flex-direction:column;gap:20px;padding:22px}.brand{color:white;font-size:1.2rem;font-weight:900;text-decoration:none}nav{display:grid;gap:6px}nav a{border-radius:8px;color:rgba(255,255,255,.82);font-weight:800;padding:10px 12px;text-decoration:none}nav a[aria-current=page],nav a:hover{background:rgba(34,211,238,.18);color:white}.logout{margin-top:auto}.topbar{align-items:center;background:white;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;min-height:64px;padding:0 24px}main{display:grid;gap:20px;margin:0 auto;max-width:1240px;padding:24px}.panel,.metric{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px}.statement-heading,.statement-toolbar{align-items:center;display:flex;gap:16px;justify-content:space-between}.eyebrow{color:var(--cyan);font-size:.78rem;font-weight:800;letter-spacing:0;text-transform:uppercase}.muted{color:var(--muted);line-height:1.5}.warning{color:var(--amber);font-weight:800}.button-link,button{align-items:center;background:var(--primary);border:0;border-radius:8px;color:white;cursor:pointer;display:inline-flex;font-weight:800;justify-content:center;min-height:42px;padding:0 14px;text-decoration:none}button:disabled{opacity:.55}.danger{background:var(--red-bg);color:var(--red)}label{display:grid;gap:8px;font-weight:700}input,select,textarea{border:1px solid var(--line);border-radius:8px;min-height:42px;padding:0 10px;width:100%}textarea{padding:10px}.account-filter{background:var(--primary);color:white}.account-filter .muted,.account-filter label{color:rgba(255,255,255,.86)}.filter-form{align-items:end;display:grid;gap:12px;grid-template-columns:minmax(14rem,1.4fr) repeat(2,minmax(10rem,1fr)) auto}.summary-grid{display:grid;gap:14px;grid-template-columns:repeat(4,minmax(0,1fr))}.metric{display:grid;gap:8px}.metric span{color:var(--muted);font-size:.78rem;font-weight:800;text-transform:uppercase}.metric strong{font-size:1.25rem;overflow-wrap:anywhere}.metric p{color:var(--muted)}.statement-panel{padding:0;overflow:hidden}.statement-toolbar{border-bottom:1px solid var(--line);padding:18px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{align-items:center;background:var(--soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);display:inline-flex;gap:6px;font-size:.8rem;font-weight:800;padding:6px 10px;white-space:nowrap}.chip-pending{background:var(--amber-bg);border-color:#fde68a;color:var(--amber)}.chip-ok{background:var(--green-bg);border-color:#bbf7d0;color:var(--green)}.chip-posted{background:#e0f2fe;border-color:#bae6fd;color:#0369a1}.statement-table{display:grid;overflow-x:auto}.statement-row{align-items:center;border-bottom:1px solid var(--line);display:grid;gap:12px;grid-template-columns:7rem minmax(14rem,1.5fr) minmax(9rem,1fr) 7rem 8rem 8rem 8rem 5rem;min-width:920px;padding:12px 18px}.statement-head{background:#f1f7fa;color:var(--muted);font-size:.78rem;font-weight:900;text-transform:uppercase}.description{display:grid;gap:3px}.description span{color:var(--muted);font-size:.86rem}.credit{color:var(--green)!important}.debit{color:var(--red)!important}.actions{position:relative}.actions summary{background:var(--soft);border:1px solid #d4e6ec;border-radius:999px;color:var(--primary);cursor:pointer;font-weight:900;list-style:none;padding:7px 10px}.actions summary::-webkit-details-marker{display:none}.actions div{background:white;border:1px solid var(--line);border-radius:8px;box-shadow:0 18px 40px rgba(15,23,42,.16);display:grid;gap:8px;min-width:210px;padding:10px;position:absolute;right:0;top:38px;z-index:3}.actions button{justify-content:flex-start}.empty{background:var(--bg);border:1px dashed var(--line);border-radius:8px;display:grid;gap:6px;margin:18px;padding:16px}dialog{border:0;border-radius:8px;box-shadow:0 24px 80px rgba(15,23,42,.28);max-width:min(900px,calc(100vw - 32px));padding:0;width:100%}dialog::backdrop{background:rgba(6,25,35,.54)}.modal-panel{display:grid;gap:18px;padding:22px}.close-form{display:flex;justify-content:flex-end}.modal-panel form[data-form]{display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}.full,.modal-panel button[type=submit],.modal-panel form[data-form] p{grid-column:1/-1}.error-page{min-height:100vh;place-content:center}.error{background:var(--red-bg);border:1px solid #fecaca;border-radius:8px;color:var(--red);padding:10px 12px}@media(max-width:1024px){.summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-form,.modal-panel form[data-form]{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.app-shell{grid-template-columns:1fr}.sidebar{gap:12px;padding:14px}.sidebar .logout,.topbar button{display:none}nav{display:flex;gap:8px;overflow-x:auto}nav a{background:rgba(255,255,255,.1);white-space:nowrap}main{padding:18px 16px 28px}.summary-grid,.filter-form,.modal-panel form[data-form]{grid-template-columns:1fr}.statement-heading,.statement-toolbar{align-items:stretch;display:grid}.button-link{width:100%}}
  `;
}
