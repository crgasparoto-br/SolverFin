import { operationalControllerScriptPart1 } from "./operational-installments-script-part-1.js";
import { operationalControllerScriptPart2 } from "./operational-installments-script-part-2.js";
import { operationalControllerScriptPart3 } from "./operational-installments-script-part-3.js";
export interface OperationalInstallmentRecord {
  id: string;
  sequenceNumber: number;
  totalInstallments: number;
  dueOn: string;
  amountMinor: number;
  currency: string;
  status: string;
  editable: boolean;
  amountEditable?: boolean;
  editBlockedReason?: string;
  transaction?: {
    id?: string;
    description?: string;
    note?: string;
    categoryId?: string;
  };
  category?: {
    id?: string;
    name?: string;
    status?: string;
  };
}

export interface InstallmentEditableValues {
  description: string;
  note: string;
  categoryId: string;
}

const BLOCK_REASON_LABELS: Readonly<Record<string, string>> = {
  linked_transaction_missing: "O lançamento vinculado não está disponível.",
  installment_status_locked: "Esta parcela não pode mais ser alterada.",
  recurrence_cancelled:
    "Esta recorrência foi cancelada. Suas parcelas estão disponíveis somente para consulta.",
  transaction_status_locked: "O lançamento já foi efetivado, conciliado ou cancelado.",
  invoice_linked: "Esta parcela é alterada pela compra da fatura.",
};

export function translateInstallmentBlockReason(reason: string | undefined): string {
  return reason ? (BLOCK_REASON_LABELS[reason] ?? "Esta parcela não pode ser alterada.") : "";
}

export function buildAccountInstallmentsPath(
  accountId: string,
  month: string,
  profileId?: string,
  day?: string,
): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const selectedDay =
    /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") && day?.startsWith(`${month}-`) ? day : undefined;
  const query = new URLSearchParams({
    ...(accountId === "all" ? {} : { accountId }),
    operationalFrom: selectedDay ?? `${month}-01`,
    operationalTo: selectedDay ?? `${month}-${String(lastDay).padStart(2, "0")}`,
    status: "all",
  });
  if (profileId) query.set("profileId", profileId);
  return `/api/installments?${query.toString()}`;
}

export function buildInvoiceInstallmentsPath(invoiceId: string, profileId?: string): string {
  const query = new URLSearchParams({ invoiceId, status: "all" });
  if (profileId) query.set("profileId", profileId);
  return `/api/installments?${query.toString()}`;
}

export function formatInstallmentSequence(
  sequenceNumber: number,
  totalInstallments: number,
): string {
  return `Parcela ${sequenceNumber} de ${totalInstallments > 0 ? totalInstallments : "?"}`;
}

export function buildInstallmentPatch(
  initial: InstallmentEditableValues,
  current: InstallmentEditableValues,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const description = current.description.trim();
  const initialNote = initial.note.trim();
  const currentNote = current.note.trim();
  if (description !== initial.description.trim()) patch.description = description;
  if (currentNote !== initialNote) patch.note = currentNote || null;
  if (current.categoryId !== initial.categoryId) patch.categoryId = current.categoryId || null;
  return patch;
}

export interface HistoricalCategoryOption {
  value: string;
  label: string;
  disabled: boolean;
}

export function buildHistoricalCategoryOption(
  installment: OperationalInstallmentRecord,
): HistoricalCategoryOption | undefined {
  const categoryId = installment.transaction?.categoryId?.trim();
  if (!categoryId) return undefined;

  const name = installment.category?.name?.trim() || "Categoria histórica";
  const archived = installment.category?.status === "archived";

  return {
    value: categoryId,
    label: archived ? `${name} (arquivada)` : name,
    disabled: archived,
  };
}

const OPERATIONAL_INSTALLMENTS_CSS = `
  .installment-badge {
    align-items: center;
    background: #ecfeff;
    border: 1px solid #a5f3fc;
    border-radius: 999px;
    color: #0f3d4c;
    display: inline-flex;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.2;
    margin-left: 7px;
    padding: 3px 7px;
    vertical-align: middle;
  }
  .installment-badge[data-installment-block-reason] {
    cursor: help;
    position: relative;
  }
  .installment-badge[data-installment-block-reason]::after {
    background: #0f172a;
    border-radius: 8px;
    color: #f8fafc;
    content: attr(data-installment-block-reason);
    display: none;
    font-size: 0.75rem;
    font-weight: 500;
    left: 0;
    line-height: 1.35;
    max-width: min(320px, calc(100vw - 32px));
    padding: 8px 10px;
    position: absolute;
    top: calc(100% + 6px);
    white-space: normal;
    width: max-content;
    z-index: 30;
  }
  .installment-badge[data-installment-block-reason]:hover::after,
  .installment-badge[data-installment-block-reason]:focus::after {
    display: block;
  }
  .installment-assistive-text {
    border: 0;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    left: 0;
    top: 0;
    white-space: nowrap;
    width: 1px;
  }
  .installment-details {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    display: grid;
    gap: 8px;
    grid-column: 1 / -1;
    padding: 12px;
  }
  .installment-details dl { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
  .installment-details dl > div { display: grid; gap: 2px; }
  .installment-details dt { color: #475569; font-size: 0.75rem; }
  .installment-details dd { color: #0f172a; font-size: 0.875rem; font-weight: 650; margin: 0; }
  .installment-details [data-installment-reason] { color: #92400e; margin: 0; }
  .installment-amount-editor { display: grid; gap: 5px; grid-column: 1 / -1; font-size: .8rem; font-weight: 650; }
  .installment-amount-editor input { width: 100%; min-height: 44px; border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 12px; color: var(--text); background: var(--surface); font-variant-numeric: tabular-nums; }
  .installment-amount-editor input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .installment-amount-hint { color: var(--muted); font-size: .73rem; font-weight: 400; }
  .installment-form-status { grid-column: 1 / -1; margin: 0; }
  .installment-form-status.error { color: #b91c1c; }
  .installment-form-status.success { color: #166534; }
  .installment-reload { justify-self: start; }
  .installment-scope-dialog { border: 0; border-radius: var(--radius-lg); box-shadow: 0 24px 70px rgba(6,25,35,.23); color: var(--text); max-width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 24px); overflow-y: auto; padding: 0; width: 100%; }
  .installment-scope-dialog::backdrop { background: rgba(6,25,35,.38); }
  .installment-scope-panel { display: grid; gap: 12px; padding: 22px; }
  .installment-scope-panel h3 { font-size: 1.1rem; margin: 0; }
  .installment-scope-panel p { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: 0; }
  /* Golden Screen: choices are neutral controls, never primary/dark actions. */
  .installment-scope-dialog button.installment-scope-option {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--primary);
    cursor: pointer;
    font-size: .875rem;
    font-weight: 650;
    min-height: 48px;
    padding: 12px;
    text-align: center;
    white-space: normal;
    width: 100%;
  }
  /* More specific than the shell's button:hover:not(:disabled). */
  .installment-scope-dialog button.installment-scope-option:hover:not(:disabled),
  .installment-scope-dialog button.installment-scope-option:focus-visible {
    background: var(--neutral-control-hover);
    border-color: var(--neutral-control-border-hover);
    color: var(--neutral-control-text-hover);
  }
  .installment-scope-dialog button.installment-scope-option:focus-visible,
  .installment-scope-dialog button.installment-scope-cancel:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
  .installment-scope-panel .installment-scope-cancel { justify-self: end; min-height: 44px; }
  .installment-scope-panel .installment-scope-note { font-size: .75rem; }
  @media (max-width: 560px) {
    .installment-details dl { grid-template-columns: 1fr; }
    .installment-badge { margin-left: 4px; }
  }
`;

export function operationalInstallmentsController(): string {
  return (
    operationalControllerScriptPart1(BLOCK_REASON_LABELS, OPERATIONAL_INSTALLMENTS_CSS) +
    operationalControllerScriptPart2() +
    operationalControllerScriptPart3()
  );
}
