import { renderAuthenticatedShellDocument } from "./shell.js";
import {
  renderReportAnalysisStateBlock,
  type ReportAnalysisState,
} from "./reports-analysis-archetype.js";
import { reportPageStyles } from "./reports-route-page-styles.js";

export type ReportsView = "category-evolution" | "installments";

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
  return `
    <nav class="report-view-tabs" aria-label="Visões de relatórios">
      <a href="${categoryHref}"${selected === "category-evolution" ? ' aria-current="page"' : ""}>Evolução por categoria</a>
      <a href="${installmentsHref}"${selected === "installments" ? ' aria-current="page"' : ""}>Parcelas consolidadas</a>
    </nav>`;
}

export function renderReportState(
  state: ReportAnalysisState,
  title: string,
  description: string,
): string {
  return renderReportAnalysisStateBlock({
    id: `report-state-${state}`,
    state,
    title,
    description,
  });
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
