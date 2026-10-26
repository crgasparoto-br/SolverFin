import assert from "node:assert/strict";
import test from "node:test";

import { collectDashboard724Evidence } from "./dashboard-724-behavior-evidence.mjs";

function fixture(state) {
  const multiple = state === "multi-currency";
  return {
    route: "/dashboard",
    state,
    provenance: "real dashboard SSR renderer with controlled API responses; authenticated browser session",
    failures: [],
    viewports: [1366, 390, 320].map((width) => ({
      width,
      screenshot: `issue-724-dashboard-${state}-${width}.png`,
      ...(state === "long-content"
        ? { expandedScreenshot: `issue-724-dashboard-${state}-${width}-expanded.png` }
        : {}),
      measurements: {
        viewportWidth: width,
        documentUrl: "about:blank",
        noHorizontalOverflow: true,
        mainPresent: true,
        hasError: state === "error",
        hasPartial: state === "partial",
        currencyCount: state === "error" ? 0 : multiple ? 2 : 1,
        currencies: state === "error" ? [] : multiple ? ["BRL", "USD"] : ["BRL"],
        primaryCount: state === "error" ? 0 : multiple ? 4 : 2,
        hasNextActions: state !== "error",
        supportingAfterActions: state !== "error",
        amountsSeparatedByCurrency: true,
        longItemVisible: state === "long-content",
      },
      ...(state === "error"
        ? {}
        : { keyboard: { open: true, hash: "#dashboard-evidence-brl-available" } }),
    })),
  };
}

for (const state of ["multi-currency", "partial", "error", "long-content"]) {
  test(`Dashboard #724 ${state} produces evidence only after all three widths pass`, async () => {
    const input = fixture(state);
    const observed = [];
    const proof = await collectDashboard724Evidence(
      state,
      async () => input,
      async (name) => observed.push(name),
    );
    assert.deepEqual(proof.assertions, ["behavior:layout:desktop", "behavior:layout:mobile"]);
    assert.deepEqual(proof.observations.widths, [320, 390, 1366]);
    assert.equal(observed.length, state === "long-content" ? 6 : 3);
  });
}

test("Dashboard #724 rejects missing compact-mobile coverage", async () => {
  const input = fixture("partial");
  input.viewports.pop();
  await assert.rejects(
    collectDashboard724Evidence("partial", async () => input, async () => {}),
    /exact Desktop\/Mobile coverage/,
  );
});

test("Dashboard #724 rejects an overwritten SSR and a missing Chrome screenshot", async () => {
  const input = fixture("multi-currency");
  input.viewports[1].measurements.documentUrl = "http://127.0.0.1:5173/dashboard";
  await assert.rejects(
    collectDashboard724Evidence("multi-currency", async () => input, async () => {}),
    /Live page replaced controlled SSR/,
  );
  input.viewports[1].measurements.documentUrl = "about:blank";
  await assert.rejects(
    collectDashboard724Evidence("multi-currency", async () => input, async (name) => {
      if (name.endsWith("-390.png")) throw new Error("Screenshot not found");
    }),
    /Screenshot not found/,
  );
});

test("Dashboard #724 rejects a missing keyboard action", async () => {
  const input = fixture("long-content");
  input.viewports[1].keyboard.open = false;
  await assert.rejects(
    collectDashboard724Evidence("long-content", async () => input, async () => {}),
    /Enter failed to open currency evidence/,
  );
});
