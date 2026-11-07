import { evaluate } from "./cdp.mjs";

// Shared real manual-plan fixture for restricted-editor regressions. The account
// recurrence remains in its own full transaction editor, never downgraded.
export function manualFinitePlanRequestScript(date, description, totalInstallments) {
  return `request("/api/installments", "POST", {
    accountId: account.id, categoryId: category.id,
    kind: "expense", status: "planned",
    description: ${JSON.stringify(description)}, plannedOn: ${JSON.stringify(date)},
    amountMinor: 12345, amountMode: "per_installment",
    totalInstallments: ${totalInstallments}, initialSequenceNumber: 1,
    idempotencyKey: crypto.randomUUID()
  })`;
}

export function manualFinitePlanSetupScript(date, description, totalInstallments) {
  const request = manualFinitePlanRequestScript(date, description, totalInstallments);
  return `const manualInstallments = (await ${request}).installments;
    const accountInstallment = manualInstallments.find(
      (item) => item.dueOn === "2026-07-05" && item.transaction?.id,
    );
    const conflictAccountInstallment = manualInstallments.find(
      (item) => item.dueOn === "2026-09-05" && item.transaction?.id,
    );`;
}

export async function assertFullRecurringLine(cdp, transactionId, check) {
  const line = await evaluate(
    cdp,
    `(async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const node = document.querySelector('script[data-transaction="${transactionId}"]');
        const row = node?.closest("article");
        const edit = row?.querySelector('[data-edit="${transactionId}"]');
        if (row && edit && !edit.disabled && !edit.dataset.installmentEdit &&
            edit.title === "Editar lançamento recorrente") {
          return {
            badge: row.querySelector("[data-installment-badge]")?.textContent.trim() || "",
            hasRecurrenceIndicator: Boolean(row.querySelector(".recurrence-indicator")),
            editable: true
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for the full account recurrence editor");
    })()`,
  );
  check(line.badge === "", "Fixed recurrence must not display a finite badge", line);
  check(line.hasRecurrenceIndicator, "Recurrence indicator was not preserved", line);
  check(line.editable, "Full account recurrence edit action was not available", line);
}
