import { icon } from "./icons.js";

import type { TransactionRecord } from "./transactions-statement.js";

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
      iconHtml: icon("circle", 15),
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
