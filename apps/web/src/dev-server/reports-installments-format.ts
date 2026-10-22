export function normalizeMonth(value: string | null): string | undefined {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;
}

export function normalizeStatus(value: string | null): string {
  return value && new Set(["all", "planned", "posted", "reconciled", "cancelled"]).has(value)
    ? value
    : "all";
}

export function nonEmpty(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

export function currentMonth(): string {
  return todayDateOnly().slice(0, 7);
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(
    2,
    "0",
  )}`;
}

export function formatMonthYear(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const label = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatInstallmentStatus(status: string): string {
  if (status === "planned") return "Planejada";
  if (status === "posted") return "Postada";
  if (status === "reconciled") return "Conciliada";
  if (status === "cancelled") return "Cancelada";
  return status;
}

export function formatInvoiceStatus(status: string): string {
  if (status === "open") return "aberta";
  if (status === "closed") return "fechada";
  if (status === "paid") return "paga";
  if (status === "overdue") return "vencida";
  if (status === "cancelled") return "cancelada";
  return status;
}
