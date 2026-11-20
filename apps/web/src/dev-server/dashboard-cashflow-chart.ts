import { formatDateOnly, formatMinorCurrency } from "@solverfin/shared";

import { escapeHtml } from "./transactions-render-helpers.js";

export function renderProjectionChart(
  points: readonly { date: string; balance: { amountMinor: number; currency: string } }[],
): string {
  if (points.length < 2)
    return `<p class="muted dashboard-chart-empty">Série diária insuficiente para exibir o gráfico de fluxo de caixa.</p>`;
  const amounts = points.map((point) => point.balance.amountMinor);
  const minimum = Math.min(...amounts);
  const maximum = Math.max(...amounts);
  const range = Math.max(1, maximum - minimum);
  const coordinates = amounts.map((amount, index) => {
    const x = 32 + (index * 656) / (amounts.length - 1);
    const y = 180 - ((amount - minimum) / range) * 145;
    return x.toFixed(1) + "," + y.toFixed(1);
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  const description =
    `Trajetória de caixa de ${formatDateOnly(first.date)} até ${formatDateOnly(last.date)}. ` +
    `Saldo inicial do gráfico: ${formatMinorCurrency(first.balance.amountMinor, { currency: first.balance.currency })}. ` +
    `Saldo final: ${formatMinorCurrency(last.balance.amountMinor, { currency: last.balance.currency })}.`;
  return `<figure class="dashboard-projection-chart" role="img" aria-label="${escapeHtml(description)}">
    <svg viewBox="0 0 720 210" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line x1="32" y1="182" x2="688" y2="182" stroke="currentColor" opacity=".18"/>
      <line x1="32" y1="108" x2="688" y2="108" stroke="currentColor" opacity=".12"/>
      <line x1="32" y1="35" x2="688" y2="35" stroke="currentColor" opacity=".10"/>
      <polyline points="${coordinates.join(" ")}" fill="none" stroke="currentColor"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      
    </svg>
    <p>${escapeHtml(formatDateOnly(first.date))} a ${escapeHtml(formatDateOnly(last.date))}</p>
  </figure>`;
}

