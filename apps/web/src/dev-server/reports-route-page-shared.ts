import { renderAuthenticatedShellDocument } from "./shell.js";
import {
  renderReportAnalysisStateBlock,
  type ReportAnalysisState,
} from "./reports-analysis-archetype.js";
import { reportPageStyles } from "./reports-route-page-styles.js";

/** Presentation-only choice. Financial blocks are never converted or combined. */
export function parseReportCurrencyFilter(value: string | null): string | undefined {
  if (value === null || value === "") return undefined;
  if (value === "all") return "all";
  if (!/^[A-Za-z]{3}$/.test(value)) {
    throw new Error("Moeda inválida. Selecione uma moeda disponível ou Todas as moedas.");
  }
  return value.toUpperCase();
}

export function selectReportCurrencyBlocks<T extends { currency: string }>(
  blocks: readonly T[],
  requestedCurrency?: string,
): { currency: string; visible: T[] } {
  const currency =
    requestedCurrency ??
    blocks.find((block) => block.currency.toUpperCase() === "BRL")?.currency ??
    blocks[0]?.currency ??
    "all";
  return {
    currency,
    visible:
      currency === "all"
        ? blocks.slice()
        : blocks.filter((block) => block.currency.toUpperCase() === currency),
  };
}

export function renderReportCurrencyOptions(
  selectedCurrency: string,
  availableCurrencies: readonly string[],
): string {
  const currencies = [
    ...new Set([
      ...availableCurrencies.map((currency) => currency.toUpperCase()),
      ...(selectedCurrency !== "all" ? [selectedCurrency] : []),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  return `<option value="all"${selectedCurrency === "all" ? " selected" : ""}>Todas as moedas</option>${currencies
    .map(
      (currency) =>
        `<option value="${escapeReportHtml(currency)}"${currency === selectedCurrency ? " selected" : ""}>${escapeReportHtml(currency)}</option>`,
    )
    .join("")}`;
}

export type ReportsView = "category-evolution" | "installments" | "cash-flow";

export function renderReportHeading(title: string, description: string): string {
  return `
    <section class="reports-heading">
      <div><p class="eyebrow">Relatórios</p><h1>${escapeReportHtml(title)}</h1><p class="muted">${escapeReportHtml(description)}</p></div>
      <span class="readonly-pill">Somente leitura</span>
    </section>`;
}

export function renderReportViewNavigation(selected: ReportsView, profileId?: string): string {
  const suffix = profileId ? `&profileId=${encodeURIComponent(profileId)}` : "";
  const categoryHref =
    selected === "category-evolution" ? "#" : `/relatorios?view=category-evolution${suffix}`;
  const installmentsHref =
    selected === "installments" ? "#" : `/relatorios?view=installments${suffix}`;
  const cashFlowHref = selected === "cash-flow" ? "#" : `/relatorios?view=cash-flow${suffix}`;
  return `
    <nav class="report-view-tabs" aria-label="Visões de relatórios">
      <a href="${categoryHref}"${selected === "category-evolution" ? ' aria-current="page"' : ""}>Evolução por categoria</a>
      <a href="${installmentsHref}"${selected === "installments" ? ' aria-current="page"' : ""}>Parcelas consolidadas</a>
      <a href="${cashFlowHref}"${selected === "cash-flow" ? ' aria-current="page"' : ""}>Projeção de caixa</a>
    </nav>`;
}

export function renderReportState(
  state: ReportAnalysisState,
  title: string,
  description: string,
  retryHref?: string,
): string {
  let retry = "";
  if (state === "api-error" && retryHref) {
    retry = `<a class="report-retry sf-focus-ring" href="${escapeReportHtml(retryHref)}">Tentar novamente</a>`;
  }
  const stateHtml = renderReportAnalysisStateBlock({
    id: `report-state-${state}`,
    state,
    title,
    description,
  });
  return `${stateHtml}${retry}`;
}

export function renderReportsShell(content: string): string {
  return renderAuthenticatedShellDocument({
    activePathname: "/relatorios",
    content,
    currentLabel: "Relatórios",
    styles: reportPageStyles(),
  });
}

export function escapeReportHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
