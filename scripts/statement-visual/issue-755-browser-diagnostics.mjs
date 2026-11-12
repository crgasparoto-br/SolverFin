import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluate } from "./cdp.mjs";
import { watchVisualFailures } from "./issue-755-ci-determinism.mjs";

// Negative control on a live Chromium/CDP client: a genuine browser exception
// and an adversarial synthetic Network event pass through the same CDP dispatcher.
// Check the serialized JSON and erase the synthetic evidence after verification.
export async function assertBrowserDiagnosticPrivacy(cdp) {
  const marker = "MariaAccountError";
  const method = "PRIVATEACCOUNT";
  const dir = await mkdtemp(join(tmpdir(), "issue-755-browser-privacy-"));
  const diagnostics = watchVisualFailures(cdp);
  let stopException;
  let timer;
  const exceptionObserved = new Promise((resolve, reject) => {
    stopException = cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      if (exceptionDetails?.exception?.className === marker) resolve();
    });
    timer = setTimeout(
      () => reject(new Error("Chromium privacy probe exception was not observed")),
      8000,
    );
  });
  try {
    const before = await evaluate(
      cdp,
      `(() => ({ route: location.pathname,
      dialogs: document.querySelectorAll('dialog[open]').length }))()`,
    );
    await evaluate(
      cdp,
      `(() => {
      setTimeout(() => {
        class MariaAccountError extends Error {}
        throw new MariaAccountError('Synthetic financial amount R$ 12,34');
      }, 0);
      return true;
    })()`,
    );
    await exceptionObserved;
    // A browser cannot normally send arbitrary HTTP verb strings. Inject the
    // adversarial method at the trusted CDP event-dispatch boundary instead.
    const requestId = "synthetic-privacy-request";
    const url = "https://example.invalid/api/budgets/private-id";
    cdp.onMessage(
      JSON.stringify({
        method: "Network.requestWillBeSent",
        params: { requestId, request: { method, url } },
      }),
    );
    cdp.onMessage(
      JSON.stringify({
        method: "Network.responseReceived",
        params: { requestId, response: { status: 403, url } },
      }),
    );
    await diagnostics.save(dir, "chrome-privacy-probe", new Error("Synthetic R$ 12,34"));
    const data = await readFile(join(dir, "issue-755-chrome-privacy-probe-failure.json"), "utf8");
    const report = JSON.parse(data);
    assert.ok(report.browserErrors.some((item) => item.className === "browser-exception"));
    assert.ok(
      report.networkErrors.some((item) => item.method === "unknown" && item.status === 403),
    );
    for (const sensitive of [marker, method, "12,34", "Maria", "private-id"]) {
      assert.equal(data.includes(sensitive), false, `Chrome JSON leaked ${sensitive}`);
    }
    const after = await evaluate(
      cdp,
      `(() => ({ route: location.pathname,
      dialogs: document.querySelectorAll('dialog[open]').length }))()`,
    );
    assert.deepEqual(after, before, "Privacy probe modified the browser view");
    return { realChromeException: true, injectedCdpMethod: true, redacted: true, restored: true };
  } finally {
    clearTimeout(timer);
    stopException?.();
    diagnostics.stop();
    await rm(dir, { recursive: true, force: true });
  }
}
