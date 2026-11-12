import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, navigate, screenshot, setViewport } from "./cdp.mjs";

/** Real SSR states: unmatched search and rejected demo session, with no fixture HTML. */
export async function validateStatementAlternativeStates(cdp, { baseUrl, route, outputDir }) {
  const subjectSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const report = {
    subjectSha,
    route,
    scope: "real-application",
    status: "running",
    observations: [],
    controls: [],
  };
  // Cookie values stay in memory; neither reports nor accessibility trees contain them.
  const { cookies } = await cdp.send("Network.getCookies", { urls: [baseUrl] });
  const session = cookies.find((cookie) => cookie.name === "solverfin_session");
  assert.ok(session, "Authenticated demo session cookie is required for the rejection fixture.");
  const setSession = (value) =>
    cdp.send("Network.setCookie", {
      name: session.name,
      value,
      url: baseUrl,
      path: session.path,
      httpOnly: session.httpOnly,
      secure: session.secure,
      sameSite: session.sameSite,
    });
  const emptyRoute = new URL(route, baseUrl);
  emptyRoute.searchParams.set("q", "golden-no-matching-transaction-fixture");
  const readState = (selector) =>
    evaluate(
      cdp,
      `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    const box = node?.getBoundingClientRect();
    return { visible: !!box?.width && !!box?.height && getComputedStyle(node).visibility !== 'hidden',
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      context: !!document.querySelector('.statement-account-control'),
      retry: !!document.querySelector('a[href="/lancamentos"]'),
      transactionCount: document.querySelectorAll('.statement-body').length };
  })()`,
    );
  try {
    for (const [width, height] of [
      [1366, 768],
      [390, 844],
      [320, 740],
    ]) {
      await setViewport(cdp, width, height);
      for (const state of ["empty", "error"]) {
        await setSession(state === "error" ? "invalid-contextual-error-fixture" : session.value);
        await navigate(cdp, state === "empty" ? emptyRoute.href : `${baseUrl}${route}`);
        const selector = state === "empty" ? ".statement-panel .empty" : ".error";
        const measured = await readState(selector);
        assert.equal(measured.visible, true, `${state}: canonical SSR state must be visible`);
        assert.equal(measured.overflow, false, `${state}: document overflows`);
        assert.equal(
          measured.transactionCount,
          0,
          `${state}: financial rows should not be exposed`,
        );
        assert.equal(
          state === "empty" ? measured.context : measured.retry,
          true,
          `${state}: account context or recovery action was lost`,
        );
        const file = `statement-alternative-${state}-${width}x${height}.png`;
        await screenshot(cdp, join(outputDir, file));
        report.observations.push({
          state,
          viewport: { width, height },
          measured,
          screenshot: file,
          fixture:
            state === "empty"
              ? "Unmatched query preserves canonical financial context"
              : "API rejects an invalid synthetic session; no rendered transaction data",
        });
        const savedStyle = await evaluate(
          cdp,
          `(() => {
          const node = document.querySelector(${JSON.stringify(selector)});
          const saved = node.getAttribute('style'); node.style.setProperty('display','none','important'); return saved;
        })()`,
        );
        try {
          const hidden = await readState(selector);
          assert.throws(() => assert.equal(hidden.visible, true), { code: "ERR_ASSERTION" });
        } finally {
          await evaluate(
            cdp,
            `(() => { const node=document.querySelector(${JSON.stringify(selector)});
            const saved=${JSON.stringify(savedStyle)};
            if (saved === null) node.removeAttribute('style'); else node.setAttribute('style',saved);
          })()`,
          );
        }
        assert.equal((await readState(selector)).visible, true);
        report.controls.push({
          id: `GS-ALTERNATIVE-VISIBILITY-${state}`,
          viewport: { width, height },
          mutation: "Hide canonical empty/error message",
          rejected: true,
          restored: "passed",
        });
      }
    }
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await screenshot(cdp, join(outputDir, "statement-alternative-failure.png")).catch(
      () => undefined,
    );
    throw error;
  } finally {
    await setSession(session.value);
    await setViewport(cdp, 1366, 768);
    await navigate(cdp, `${baseUrl}${route}`);
    await writeFile(
      join(outputDir, "statement-alternative-states.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
