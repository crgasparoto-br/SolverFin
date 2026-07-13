import { icon } from "./icons.js";

import type { TransactionRecord } from "./transactions-statement.js";

const POSTED_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

export interface StatementStatusPresentation {
  label: string;
  tone: "ok" | "posted" | "pending" | "planned";
  iconHtml: string;
}

export function resolveStatementStatusPresentation(
  transaction: Pick<TransactionRecord, "status" | "effectiveOn">,
): StatementStatusPresentation {
  if (transaction.status === "reconciled") {
    return { label: "Conciliado", tone: "ok", iconHtml: icon("check", 15) };
  }

  if (transaction.effectiveOn !== undefined) {
    return {
      label: "Efetivado não conciliado",
      tone: "posted",
      iconHtml: POSTED_ICON,
    };
  }

  if (transaction.status === "suggested") {
    return {
      label: "Pendente",
      tone: "pending",
      iconHtml: icon("alert-triangle", 15),
    };
  }

  return { label: "Previsto", tone: "planned", iconHtml: icon("clock", 15) };
}

export function renderStatementStatus(
  transaction: Pick<TransactionRecord, "status" | "effectiveOn">,
): string {
  const presentation = resolveStatementStatusPresentation(transaction);

  return `<span class="statement-status statement-status-${presentation.tone} col-status" role="img" tabindex="0" aria-label="${presentation.label}" title="${presentation.label}" data-tooltip="${presentation.label}">${presentation.iconHtml}</span>`;
}
