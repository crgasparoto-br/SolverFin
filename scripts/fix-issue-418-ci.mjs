import { readFile, writeFile } from "node:fs/promises";

async function replaceRequired(path, search, replacement) {
  const current = await readFile(path, "utf8");
  if (!current.includes(search)) {
    throw new Error(`Expected fragment not found in ${path}`);
  }
  await writeFile(path, current.replace(search, replacement));
}

const accountPath = "apps/api/src/repositories/recurring-account-transaction-edit.ts";
await replaceRequired(
  accountPath,
  `import { query, withTransaction } from "../db.js";`,
  `import { withTransaction, type query } from "../db.js";`,
);
await replaceRequired(
  accountPath,
  `      redactedChanges: {
        recurringEditScope: "current_and_future",
        selectedOccurrence: "changed",
        futureOccurrences: eligible.length > 0 ? "changed" : "unchanged",
      },`,
  `      redactedChanges: {
        recurringEditScope: "changed",
        selectedOccurrence: "changed",
        ...(eligible.length > 0 ? { futureOccurrences: "changed" as const } : {}),
      },`,
);
await replaceRequired(
  accountPath,
  `      redactedChanges: {
        schedule:
          recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn) ? "changed" : "unchanged",
        futureOccurrences: eligible.length > 0 ? "changed" : "unchanged",
      },`,
  `      redactedChanges: {
        ...(recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn)
          ? { schedule: "changed" as const }
          : {}),
        ...(eligible.length > 0 ? { futureOccurrences: "changed" as const } : {}),
      },`,
);

const cardPath = "apps/api/src/repositories/recurring-card-purchase-edit.ts";
await replaceRequired(
  cardPath,
  `import { query, withTransaction } from "../db.js";`,
  `import { withTransaction, type query } from "../db.js";`,
);
await replaceRequired(
  cardPath,
  `      redactedChanges: {
        recurringEditScope: "current_and_future",
        selectedOccurrence: "changed",
        futureOccurrences: updates.length > 0 ? "changed" : "unchanged",
      },`,
  `      redactedChanges: {
        recurringEditScope: "changed",
        selectedOccurrence: "changed",
        ...(updates.length > 0 ? { futureOccurrences: "changed" as const } : {}),
      },`,
);
await replaceRequired(
  cardPath,
  `      redactedChanges: {
        amountMinor: amountMinor !== selected.amountMinor ? "changed" : "unchanged",
        schedule:
          recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn) ? "changed" : "unchanged",
        futureOccurrences: updates.length > 0 ? "changed" : "unchanged",
      },`,
  `      redactedChanges: {
        ...(amountMinor !== selected.amountMinor ? { amountMinor: "changed" as const } : {}),
        ...(recurrenceStartOn !== toDateOnly(selected.recurrenceStartOn)
          ? { schedule: "changed" as const }
          : {}),
        ...(updates.length > 0 ? { futureOccurrences: "changed" as const } : {}),
      },`,
);
