import { evaluate } from "./cdp.mjs";

export function verifyAdminNetworkRecovery(cdp) {
  return evaluate(
    cdp,
    `(async () => {
        const originalFetch = window.fetch;
        const originalAlert = window.alert;
        let lastAlert = "";
        window.fetch = async () => { throw new TypeError("simulated connection reset"); };
        window.alert = (message) => { lastAlert = String(message); };
        try {
          const refresh = document.querySelector("[data-admin-refresh]");
          const statusForm = document.querySelector("[data-status-form]");
          refresh?.click();
          statusForm?.requestSubmit();
          await new Promise((resolve) => setTimeout(resolve, 120));
          return {
            refreshExists: Boolean(refresh), statusExists: Boolean(statusForm),
            refreshEnabled: Boolean(refresh && !refresh.disabled),
            refreshMessage: document.querySelector("[data-admin-refresh-status]")?.textContent?.trim(),
            statusEnabled: Boolean(statusForm?.querySelector("button") && !statusForm.querySelector("button").disabled),
            statusMessage: lastAlert,
          };
        } finally {
          window.fetch = originalFetch;
          window.alert = originalAlert;
        }
    })()`,
  );
}
