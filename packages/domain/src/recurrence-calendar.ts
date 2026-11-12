import type { ISODate, RecurrenceFrequency } from "./index.js";

export function addRecurrenceFrequency(
  startOn: ISODate,
  frequency: RecurrenceFrequency,
  offset: number,
  interval = 1,
): ISODate {
  const steps = offset * interval;

  if (frequency === "daily") {
    return addDays(startOn, steps);
  }

  if (frequency === "weekly") {
    return addDays(startOn, steps * 7);
  }

  if (frequency === "yearly") {
    return addMonths(startOn, steps * 12);
  }

  return addMonths(startOn, steps);
}

function addDays(startOn: ISODate, days: number): ISODate {
  const date = parseDate(startOn);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDate(date);
}

function addMonths(startOn: ISODate, months: number): ISODate {
  const [year, month, day] = startOn.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = getLastDayOfMonth(targetYear, normalizedMonthIndex + 1);
  const date = new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay)));

  return formatDate(date);
}

function parseDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
