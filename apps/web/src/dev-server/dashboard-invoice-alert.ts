import { formatDateOnly } from "@solverfin/shared";

export function describeOpenInvoiceDueDates(
  invoices: readonly { dueOn: string }[],
  today: string,
): string {
  // Dates are canonical YYYY-MM-DD civil dates, not UTC timestamps.
  const dueDates = invoices
    .map((invoice) => invoice.dueOn)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((left, right) => left.localeCompare(right));
  const overdue = dueDates.filter((date) => date < today);
  const dueTodayCount = dueDates.filter((date) => date === today).length;
  const next = dueDates.find((date) => date > today);
  const messages: string[] = [];

  const oldestOverdue = overdue[0];
  if (oldestOverdue) {
    if (overdue.length === 1) {
      messages.push(`1 fatura vencida em ${formatDateOnly(oldestOverdue)}.`);
    } else {
      messages.push(
        `${overdue.length} faturas vencidas; a mais antiga venceu em ${formatDateOnly(oldestOverdue)}.`,
      );
    }
  }
  if (dueTodayCount > 0) {
    messages.push(`${dueTodayCount} fatura${dueTodayCount === 1 ? " vence" : "s vencem"} hoje.`);
  }
  if (next) {
    messages.push(`Próximo vencimento em ${formatDateOnly(next)}.`);
  }
  return messages.join(" ") || "Consulte os cartões para confirmar os vencimentos.";
}
