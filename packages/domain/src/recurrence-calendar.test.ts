import { addRecurrenceFrequency } from "./recurrence-calendar.js";

runDailyIntervalAdvancement();
runWeeklyIntervalAdvancement();
runMonthlyEndOfMonthCharacterization();
runMonthlyAfterFebruaryCharacterization();
runYearlyLeapDayCharacterization();
runYearlyFebruaryEndCharacterization();

function runDailyIntervalAdvancement(): void {
  assertEqual(
    addRecurrenceFrequency("2026-06-01", "daily", 2, 3),
    "2026-06-07",
    "daily recurrence should multiply offset by interval",
  );
}

function runWeeklyIntervalAdvancement(): void {
  assertEqual(
    addRecurrenceFrequency("2026-06-01", "weekly", 2, 2),
    "2026-06-29",
    "weekly recurrence should advance by seven days per interval step",
  );
}

function runMonthlyEndOfMonthCharacterization(): void {
  assertEqual(
    addRecurrenceFrequency("2026-01-31", "monthly", 1),
    "2026-02-28",
    "monthly recurrence should clamp missing month days",
  );
  assertEqual(
    addRecurrenceFrequency("2026-01-31", "monthly", 2),
    "2026-03-31",
    "monthly recurrence should calculate each offset from the original start date",
  );
}

function runMonthlyAfterFebruaryCharacterization(): void {
  assertEqual(
    addRecurrenceFrequency("2026-01-30", "monthly", 1),
    "2026-02-28",
    "monthly recurrence should clamp day 30 in February",
  );
  assertEqual(
    addRecurrenceFrequency("2026-01-30", "monthly", 2),
    "2026-03-30",
    "monthly recurrence should keep the requested day when the target month has it",
  );
}

function runYearlyLeapDayCharacterization(): void {
  assertEqual(
    addRecurrenceFrequency("2024-02-29", "yearly", 1),
    "2025-02-28",
    "yearly recurrence from leap day should clamp in non-leap years",
  );
  assertEqual(
    addRecurrenceFrequency("2024-02-29", "yearly", 4),
    "2028-02-29",
    "yearly recurrence should recover leap day when the target year supports it",
  );
}

function runYearlyFebruaryEndCharacterization(): void {
  assertEqual(
    addRecurrenceFrequency("2023-02-28", "yearly", 1),
    "2024-02-28",
    "yearly recurrence keeps the original day instead of promoting February 28 to leap day",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
