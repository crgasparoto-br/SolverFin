import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { icon } from "./icons.js";

export interface DashboardOverview {
  referenceDate: string;
  purchaseToday: string;
  purchaseOn: string;
  periodStartOn: string;
  periodEndOn: string;
  accountBalances: {
    id: string;
    name: string;
    kind: string;
    currency: string;
    balanceMinor: number;
  }[];
  cardSpending: { id: string; name: string; currency: string; spentMinor: number }[];
  cardSpendingTotals?: { currency: string; amountMinor: number; count: number }[];
  cardAdvice: {
    id: string;
    name: string;
    currency: string;
    closingOn: string;
    dueOn: string;
    daysUntilPayment: number;
    recommended: boolean;
  }[];
  payables: {
    id: string;
    source: "transaction" | "invoice";
    description: string;
    currency: string;
    dueOn: string;
    amountMinor: number;
    overdue: boolean;
    accountId?: string;
    cardId?: string;
  }[];
  payableTotals: { currency: string; amountMinor: number; overdueMinor: number; count: number }[];
  categoryExpenses: { currency: string; category: string; amountMinor: number }[];
  monthlyTrend: { currency: string; month: string; incomeMinor: number; expensesMinor: number }[];
}

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(amountMinor: number, currency: string): string {
  return escape(formatMinorCurrency(amountMinor, { currency }));
}

function date(value: string): string {
  return escape(formatDateOnly(value));
}

function empty(label: string): string {
  return `<p class="muted dashboard-empty">${escape(label)}</p>`;
}

function title(eyebrow: string, heading: string, link?: { href: string; label: string }): string {
  return `<div class="dashboard-widget-head">
    <div><p class="eyebrow">${escape(eyebrow)}</p><h2>${escape(heading)}</h2></div>
    ${link ? `<a class="text-link" href="${escape(link.href)}">${escape(link.label)}</a>` : ""}
  </div>`;
}

function renderCardAdvice(data: DashboardOverview): string {
  const winners = data.cardAdvice.filter((card) => card.recommended);
  const first = winners[0];
  const today = data.purchaseOn === data.purchaseToday;
  const simulation = `<form method="get" action="/dashboard" class="dashboard-simulate">
    <label for="dashboard-purchase-date">Simular data da compra</label>
    <input id="dashboard-purchase-date" type="date" name="purchaseOn" min="${escape(data.purchaseToday)}" value="${escape(data.purchaseOn)}" required>
    <button type="submit" class="button-link secondary-link">Simular</button>
    ${today ? "" : '<a class="text-link" href="/dashboard">Voltar para hoje</a>'}
  </form>`;
  if (!first)
    return `<section class="panel dashboard-widget dashboard-card-advice" aria-label="Melhor cartão para comprar">
    ${title("Decisão de compra", "Melhor cartão para comprar " + (today ? "hoje" : "na data escolhida"))}
    ${empty("Cadastre um cartão ativo com pelo menos um instrumento ativo para comparar prazos.")}
    ${simulation}
  </section>`;
  const winnerNames = winners.map((card) => card.name).join(", ");
  return `<section class="panel dashboard-widget dashboard-card-advice" aria-label="Melhor cartão para comprar">
    ${title(
      "Decisão de compra",
      "Melhor cartão para comprar " + (today ? "hoje" : "na data escolhida"),
      { href: "/contas-cartoes?resource=cards", label: "Gerenciar cartões" },
    )}
    <div class="dashboard-recommendation" role="status">
      <span class="eyebrow">${winners.length > 1 ? "Cartões empatados no maior prazo" : "Cartão recomendado"}</span>
      <strong class="dashboard-recommendation-name">${escape(winnerNames)}</strong>
      <strong class="dashboard-recommendation-days">${first.daysUntilPayment} <small>dias até o vencimento</small></strong>
      <span>Fecha ${date(first.closingOn)} · Vence ${date(first.dueOn)}</span>
    </div>
    <div class="dashboard-comparison" aria-label="Ranking dos cartões por prazo até o pagamento">
      ${data.cardAdvice
        .map(
          (card) => `<div class="dashboard-card-rank">
        <span>${card.recommended ? icon("check-circle", 15) : icon("credit-card", 15)}
          <a class="text-link" href="/cartoes?cardId=${encodeURIComponent(card.id)}">${escape(card.name)}</a>
          <small>${escape(card.currency)}</small></span>
        <strong>${card.daysUntilPayment} dias</strong>
        <small>Fecha ${date(card.closingOn)} · Vence ${date(card.dueOn)}</small>
      </div>`,
        )
        .join("")}
    </div>
    ${simulation}
    <p class="muted dashboard-footnote">Datas estimadas pelas regras cadastradas. Compras no dia do fechamento podem entrar no ciclo atual dependendo do processamento. Maior prazo não representa saldo disponível ou aprovação de compra.</p>
  </section>`;
}

function payableHref(bill: DashboardOverview["payables"][number]): string {
  if (bill.source === "invoice") {
    if (!bill.cardId) return "/cartoes";
    const params = new URLSearchParams({ cardId: bill.cardId, invoiceId: bill.id });
    return `/cartoes?${params.toString()}`;
  }
  const params = new URLSearchParams({ month: bill.dueOn.slice(0, 7) });
  if (bill.accountId) params.set("accountId", bill.accountId);
  return `/lancamentos?${params.toString()}`;
}

function renderPayables(data: DashboardOverview): string {
  return `<section class="panel dashboard-widget dashboard-payables" aria-label="Contas a pagar no mês">
    ${title("Compromissos", "Contas a pagar · " + data.periodStartOn.slice(0, 7), {
      href: "/lancamentos",
      label: "Ver Extrato",
    })}
    <div class="dashboard-payable-totals">${
      data.payableTotals
        .map(
          (total) =>
            `<div><span>Em aberto · ${escape(total.currency)} (${total.count})</span>
        <strong>${money(total.amountMinor, total.currency)}</strong>
        ${total.overdueMinor > 0 ? `<small class="dashboard-danger">Vencido: ${money(total.overdueMinor, total.currency)}</small>` : ""}
      </div>`,
        )
        .join("") || '<p class="muted">Sem compromissos pendentes.</p>'
    }</div>
    ${
      data.payables.length
        ? `<div class="dashboard-table-scroll"><table class="dashboard-mini-table">
      <thead><tr><th scope="col">Vencimento</th><th scope="col">Descrição</th><th scope="col">Valor</th></tr></thead>
      <tbody>${data.payables
        .map(
          (bill) => `<tr>
        <td><time datetime="${escape(bill.dueOn)}">${date(bill.dueOn)}</time>
          ${bill.overdue ? '<span class="dashboard-danger">Vencido</span>' : ""}</td>
        <td><a href="${escape(payableHref(bill))}">${escape(bill.description)}</a>
          <small>${bill.source === "invoice" ? "Fatura de cartão" : "Lançamento previsto"}</small></td>
        <td class="dashboard-money">${money(bill.amountMinor, bill.currency)}</td>
      </tr>`,
        )
        .join("")}</tbody></table></div>`
        : empty("Não há contas ou faturas pendentes até o fim do mês.")
    }
    <p class="muted dashboard-footnote">Inclui vencidos anteriores ainda pendentes. Faturas e lançamentos previstos vinculados não são somados duas vezes.</p>
  </section>`;
}

function renderAccounts(data: DashboardOverview): string {
  const accounts = [...data.accountBalances].sort(
    (a, b) =>
      Number(b.kind === "checking") - Number(a.kind === "checking") || a.name.localeCompare(b.name),
  );
  return `<section class="panel dashboard-widget" aria-label="Saldo por conta">
    ${title("Posição individual", "Saldo por conta", { href: "/contas-cartoes", label: "Todas as contas" })}
    ${
      accounts.length
        ? `<div class="dashboard-compact-rows">
      ${accounts
        .map(
          (account) => `<div class="dashboard-account-row">
        <span>${icon(account.kind === "checking" ? "building-2" : "wallet", 17)}
          <a href="/lancamentos?accountId=${encodeURIComponent(account.id)}&amp;currency=${encodeURIComponent(account.currency)}">${escape(account.name)}</a>
          <small>${escape(account.kind === "checking" ? "Conta corrente" : account.kind === "investment" ? "Investimento" : account.kind === "savings" ? "Poupança" : "Carteira/outra conta")}</small>
        </span>
        <strong>${money(account.balanceMinor, account.currency)}</strong>
      </div>`,
        )
        .join("")}
    </div>`
        : empty("Nenhuma conta ativa cadastrada.")
    }
    <p class="muted dashboard-footnote">Saldos de investimentos não são automaticamente considerados liquidez imediata.</p>
  </section>`;
}

function renderCardSpending(data: DashboardOverview): string {
  return `<section class="panel dashboard-widget" aria-label="Gastos por cartão de crédito">
    ${title("Compras realizadas", "Gastos por cartão · mês corrente", {
      href: "/cartoes",
      label: "Ver cartões",
    })}
    ${
      data.cardSpending.length
        ? `<div class="dashboard-compact-rows">
      ${data.cardSpending
        .map(
          (card) => `<div class="dashboard-card-spend-row">
        <span>${icon("credit-card", 17)}
          <a href="/cartoes?cardId=${encodeURIComponent(card.id)}">${escape(card.name)}</a>
          <small>Compras em ${escape(card.currency)}</small>
        </span>
        <strong>${money(card.spentMinor, card.currency)}</strong>
      </div>`,
        )
        .join("")}
    </div>`
        : empty("Nenhum cartão ativo para acompanhar.")
    }
    <p class="muted dashboard-footnote">Compras por data econômica. O pagamento da fatura não cria uma segunda despesa; o mês da compra pode diferir do ciclo da fatura.</p>
  </section>`;
}

function renderCategories(data: DashboardOverview): string {
  const rows = data.categoryExpenses.slice(0, 8);
  const maxByCurrency = new Map<string, number>();
  for (const row of rows)
    maxByCurrency.set(
      row.currency,
      Math.max(maxByCurrency.get(row.currency) ?? 0, row.amountMinor),
    );
  return `<section class="panel dashboard-widget" aria-label="Despesas por categoria">
    ${title("Composição", "Despesas por categoria", { href: "/relatorios?view=category-evolution", label: "Analisar" })}
    ${
      rows.length
        ? `<div class="dashboard-bar-list">${rows
            .map((row) => {
              const max = maxByCurrency.get(row.currency) || 1;
              const pct = Math.max(0, Math.min(100, (row.amountMinor / max) * 100));
              return `<div class="dashboard-bar-item"><div><span>${escape(row.category)} · ${escape(row.currency)}</span>
        <strong>${money(row.amountMinor, row.currency)}</strong></div>
        <div class="dashboard-bar-track" role="img" aria-label="${escape(row.category)}: ${money(row.amountMinor, row.currency)}">
          <span style="width:${pct.toFixed(1)}%"></span>
        </div></div>`;
            })
            .join("")}</div>`
        : empty("Ainda não existem despesas realizadas no mês.")
    }
  </section>`;
}

function renderTrend(data: DashboardOverview): string {
  const rows = data.monthlyTrend;
  const maxByCurrency = new Map<string, number>();
  for (const row of rows)
    maxByCurrency.set(
      row.currency,
      Math.max(maxByCurrency.get(row.currency) ?? 0, row.incomeMinor, row.expensesMinor),
    );
  return `<section class="panel dashboard-widget" aria-label="Evolução de receitas e despesas">
    ${title("Histórico", "Evolução financeira · até 6 meses", { href: "/relatorios", label: "Relatórios" })}
    ${
      rows.length
        ? `<div class="dashboard-trend">
      ${rows
        .map((row) => {
          const max = maxByCurrency.get(row.currency) || 1;
          return `<div class="dashboard-trend-item"><strong>${escape(row.month)} · ${escape(row.currency)}</strong>
          <div><span class="dashboard-trend-income" style="width:${((row.incomeMinor / max) * 100).toFixed(1)}%"></span>
            <small>Receitas ${money(row.incomeMinor, row.currency)}</small></div>
          <div><span class="dashboard-trend-expense" style="width:${((row.expensesMinor / max) * 100).toFixed(1)}%"></span>
            <small>Despesas ${money(row.expensesMinor, row.currency)}</small></div></div>`;
        })
        .join("")}
    </div>`
        : empty("Histórico insuficiente para evolução financeira.")
    }
  </section>`;
}

export function renderDashboardOverview(data: DashboardOverview | undefined): string {
  if (!data)
    return `<section class="panel dashboard-widget" data-overview="unavailable">
    ${title("Detalhamento", "Visão por conta, cartão e compromissos")}
    ${empty("Os dados complementares estão temporariamente indisponíveis. Os saldos e indicadores canônicos acima continuam visíveis.")}
  </section>`;
  return `<div class="dashboard-overview" data-overview="available">
    <div class="dashboard-operations-grid">
      ${renderCardAdvice(data)}
      ${renderPayables(data)}
    </div>
    <div class="dashboard-operations-grid">
      ${renderAccounts(data)}
      ${renderCardSpending(data)}
    </div>
    <div class="dashboard-operations-grid">
      ${renderCategories(data)}
      ${renderTrend(data)}
    </div>
  </div>`;
}
