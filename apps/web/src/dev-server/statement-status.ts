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

  return `<span class="statement-status statement-status-${presentation.tone} col-status" role="img" tabindex="0" aria-label="${presentation.label}" title="${presentation.label}" data-tooltip="${presentation.label}">${presentation.iconHtml}<span class="statement-status-label" aria-hidden="true">${presentation.label}</span></span>`;
}

/** Inline reconciliation control using the same neutral menu behavior as Cards. */
export function renderStatementStatusControl(
  transaction: Pick<TransactionRecord, "id" | "status" | "effectiveOn">,
  allowed: boolean,
  restriction: string,
): string {
  const presentation = resolveStatementStatusPresentation(transaction);
  const id = escapeStatusHtml(transaction.id);
  const label = escapeStatusHtml(presentation.label);
  const options = allowed
    ? transaction.status === "reconciled"
      ? [{ status: "posted", text: "Desconciliar", iconHtml: POSTED_ICON, tone: "posted" }]
      : [
          {
            status: "reconciled",
            text: "Marcar como conciliado",
            iconHtml: icon("check", 15),
            tone: "ok",
          },
        ]
    : [];
  const items = options.length
    ? options
        .map(
          (option) =>
            '<button type="button" class="statement-status-option" data-button-variant="neutral" data-set-statement-status="' +
            option.status +
            '" data-status-transaction-id="' +
            id +
            '" aria-label="' +
            option.text +
            '" title="' +
            option.text +
            '" data-tooltip="' +
            option.text +
            '"><span class="statement-status statement-status-' +
            option.tone +
            '" aria-hidden="true">' +
            option.iconHtml +
            "</span></button>",
        )
        .join("")
    : '<span class="statement-status-readonly" role="img" aria-label="' +
      escapeStatusHtml(restriction) +
      '" title="' +
      escapeStatusHtml(restriction) +
      '" data-tooltip="' +
      escapeStatusHtml(restriction) +
      '"><span class="statement-status statement-status-pending" aria-hidden="true">' +
      icon("lock", 15) +
      "</span></span>";
  return (
    '<details class="statement-status-control col-status" data-statement-status-control>' +
    '<summary aria-label="Situação: ' +
    label +
    ". " +
    (options.length ? "Alterar situação" : "Ver restrição de alteração") +
    '" title="' +
    label +
    '"><span class="statement-status statement-status-' +
    presentation.tone +
    '" role="img" aria-label="' +
    label +
    '" data-tooltip="' +
    label +
    '">' +
    presentation.iconHtml +
    "</span></summary>" +
    '<div class="statement-status-menu" role="group" aria-label="Situação do lançamento">' +
    '<span class="statement-status-current" role="img" aria-label="Situação atual: ' +
    label +
    '" title="' +
    label +
    '" data-tooltip="' +
    label +
    '"><span class="statement-status statement-status-' +
    presentation.tone +
    '">' +
    presentation.iconHtml +
    "</span></span>" +
    items +
    '<span class="statement-status-feedback" role="status" aria-live="polite" hidden>' +
    '<span class="statement-status-feedback-pending" aria-hidden="true">' +
    icon("clock", 18) +
    "</span>" +
    '<span class="statement-status-feedback-ok" aria-hidden="true">' +
    icon("check", 18) +
    "</span>" +
    '<span class="statement-status-feedback-error" aria-hidden="true">' +
    icon("alert-triangle", 18) +
    "</span>" +
    '<span class="sf-visually-hidden" data-statement-status-feedback-message></span>' +
    "</span></div></details>"
  );
}

function escapeStatusHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
