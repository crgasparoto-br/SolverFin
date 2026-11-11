import { createManualInstallmentActions } from "./issue-553-manual-actions.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const scenarios = [];

if (!chromePath) throw new Error("CHROME_BIN is required for issue 553 visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const {
  installReloadGuard,
  interceptFormPost,
  readPausedRequest,
  assertCanonicalPost,
  openExpenseModalByKeyboard,
  openExpenseModal,
  waitForModal,
  fillInstallmentForm,
  submitControlIsKeyboardReady,
  submitForm,
  setMoney,
  waitForFormStatus,
  readFormState,
  readModalFocusContract,
  readModalEscapeContract,
  readInstallments,
  pressEnter,
  pressEscape,
  createAccountExpression,
} = createManualInstallmentActions(browser);

try {
  await setViewport(browser.cdp, 1366, 768);
  await navigate(browser.cdp, `${baseUrl}/login`);
  const login = await evaluate(browser.cdp, loginExpression());
  assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
  const fixture = await evaluate(browser.cdp, createAccountExpression());
  const route = `/lancamentos?accountId=${encodeURIComponent(fixture.accountId)}&month=2026-08`;

  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installReloadGuard();
  const desktopPageScrollBaseline = await evaluate(browser.cdp, "window.scrollY");
  await openExpenseModalByKeyboard();
  const desktopFocus = await readModalFocusContract();
  check(desktopFocus.focusInsideDialog, "Desktop modal did not receive focus", desktopFocus);
  await pressEscape();
  const desktopEscape = await readModalEscapeContract();
  check(desktopEscape.closed, "Escape did not close the desktop modal", desktopEscape);
  check(
    desktopEscape.focusReturnedToOpener,
    "Focus did not return to the desktop opener",
    desktopEscape,
  );
  await openExpenseModalByKeyboard();
  const desktopForm = await fillInstallmentForm({
    amount: "120,00",
    plannedOn: "2026-08-31",
    installments: 3,
    installmentStart: 1,
    amountMode: "total",
    description: "QA parcelamento manual canonico",
    note: "Observacao preservada no retry",
  });
  const desktopModal = await readFormState(desktopPageScrollBaseline);
  check(desktopModal.dialogCentered, "Desktop modal is not centered in the viewport", desktopModal);
  check(desktopModal.dialogWithinViewport, "Desktop modal escapes the viewport", desktopModal);
  check(
    desktopModal.dialogSafeMargins,
    "Desktop modal does not preserve the safe viewport margins",
    desktopModal,
  );
  check(
    desktopModal.pageScrollYStable,
    "Opening or inspecting the desktop modal moved the page",
    desktopModal,
  );
  check(
    desktopForm.repeatMode === "installment",
    "Desktop form did not retain installment mode",
    desktopForm,
  );
  check(await submitControlIsKeyboardReady(), "Submit control is not keyboard ready", desktopForm);

  const ambiguous = await interceptFormPost({
    action: submitForm,
    fulfill: {
      statusCode: 504,
      body: {
        error: {
          code: "GATEWAY_TIMEOUT",
          message: "Tempo limite no gateway; a operação pode ter sido concluída.",
        },
      },
    },
  });
  assertCanonicalPost(ambiguous);
  const ambiguousStatus = await waitForFormStatus("A resposta foi inconclusiva");
  const preserved = await readFormState();
  check(preserved.modalOpen, "Modal closed after ambiguous response", preserved);
  check(!preserved.submitDisabled, "Submit remained disabled after ambiguous response", preserved);
  check(
    preserved.description === desktopForm.description,
    "Description was lost after timeout",
    preserved,
  );
  check(preserved.note === desktopForm.note, "Note was lost after timeout", preserved);

  const retry = await interceptFormPost({ action: submitForm });
  assertCanonicalPost(retry);
  await waitForFormStatus("Ação concluída");
  check(
    ambiguous.first.idempotencyKey === retry.first.idempotencyKey,
    "Ambiguous retry generated another idempotency key",
    { ambiguous, retry },
  );
  check(
    ambiguous.first.fingerprint === retry.first.fingerprint,
    "Ambiguous retry changed the logical payload",
    { ambiguous, retry },
  );

  const desktopRows = await readInstallments(fixture.accountId, "2026-08-01", "2026-10-31");
  check(
    desktopRows.length === 3,
    "Desktop retry created an incomplete or duplicate set",
    desktopRows,
  );
  check(
    desktopRows
      .map((item) => item.sequenceNumber)
      .sort((a, b) => a - b)
      .join(",") === "1,2,3",
    "Desktop canonical sequence is incomplete",
    desktopRows,
  );
  check(
    desktopRows.every(
      (item) => item.transaction?.description === "QA parcelamento manual canonico",
    ),
    "Description received a textual sequence suffix",
    desktopRows,
  );
  check(
    desktopRows.every((item) => item.transaction?.note === "Observacao preservada no retry"),
    "Note was not persisted separately",
    desktopRows,
  );
  const desktopScreenshot = "issue-553-manual-installments-desktop-1366x768.png";
  await screenshot(browser.cdp, join(outputDir, desktopScreenshot));
  scenarios.push({
    route,
    viewport: "1366x768",
    state: "canonical retry reused the same key after an ambiguous 504",
    screenshot: desktopScreenshot,
    ambiguousStatus,
    ambiguous,
    retry,
    desktopRows,
  });

  await setViewport(browser.cdp, 1366, 500);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installReloadGuard();
  const compactDesktopPageScrollBaseline = await evaluate(browser.cdp, "window.scrollY");
  await openExpenseModal();
  await fillInstallmentForm({
    amount: "120,00",
    plannedOn: "2026-08-31",
    installments: 3,
    installmentStart: 1,
    amountMode: "total",
    description: "QA rolagem interna desktop compacto",
    note: "Conteúdo longo",
  });
  const compactDesktopModal = await readFormState(compactDesktopPageScrollBaseline);
  check(
    compactDesktopModal.modalScrollsInternally,
    "Compact desktop modal does not expose internal scrolling for the long form",
    compactDesktopModal,
  );
  check(
    compactDesktopModal.dialogWithinViewport,
    "Compact desktop modal escapes the viewport",
    compactDesktopModal,
  );
  check(
    compactDesktopModal.dialogSafeMargins,
    "Compact desktop modal does not preserve the safe viewport margins",
    compactDesktopModal,
  );
  check(
    !compactDesktopModal.globalOverflow,
    "Compact desktop modal introduces horizontal overflow",
    compactDesktopModal,
  );

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await installReloadGuard();
  const mobilePageScrollBaseline = await evaluate(browser.cdp, "window.scrollY");
  await openExpenseModalByKeyboard();
  const mobileFocus = await readModalFocusContract();
  check(mobileFocus.focusInsideDialog, "Mobile modal did not receive focus", mobileFocus);
  await pressEscape();
  const mobileEscape = await readModalEscapeContract();
  check(mobileEscape.closed, "Escape did not close the mobile modal", mobileEscape);
  check(
    mobileEscape.focusReturnedToOpener,
    "Focus did not return to the mobile opener",
    mobileEscape,
  );
  await openExpenseModalByKeyboard();
  const mobileForm = await fillInstallmentForm({
    amount: "0,01",
    plannedOn: "2026-11-30",
    installments: 2,
    installmentStart: 1,
    amountMode: "total",
    description: "QA correcao material mobile",
    note: "Chave deve mudar apos validacao",
  });
  check(
    mobileForm.repeatMode === "installment",
    "Mobile form did not retain installment mode",
    mobileForm,
  );
  const mobileModal = await readFormState(mobilePageScrollBaseline);
  check(mobileModal.dialogCentered, "Mobile modal is not centered in the viewport", mobileModal);
  check(mobileModal.dialogWithinViewport, "Mobile modal escapes the viewport", mobileModal);
  check(
    mobileModal.dialogSafeMargins,
    "Mobile modal does not preserve the safe viewport margins",
    mobileModal,
  );
  check(
    mobileModal.modalScrollsInternally,
    "Mobile modal does not expose internal scrolling",
    mobileModal,
  );
  check(!mobileModal.globalOverflow, "Mobile modal introduces horizontal overflow", mobileModal);

  const validation = await interceptFormPost({
    action: async () => {
      await evaluate(
        browser.cdp,
        `(() => {
          const form = document.querySelector("[data-form]");
          form.requestSubmit();
          form.requestSubmit();
        })()`,
      );
    },
    observeAfterFirst: 500,
  });
  assertCanonicalPost(validation);
  await waitForFormStatus("ao menos um centavo por parcela");
  const rejected = await readFormState();
  check(validation.requests.length === 1, "Double submit issued duplicate requests", validation);
  check(rejected.modalOpen, "Modal closed after definitive validation", rejected);
  check(!rejected.submitDisabled, "Submit was not restored after definitive validation", rejected);

  await setMoney("1,00");
  const corrected = await interceptFormPost({ action: submitForm });
  assertCanonicalPost(corrected);
  await waitForFormStatus("Ação concluída");
  check(
    validation.first.idempotencyKey !== corrected.first.idempotencyKey,
    "Material correction reused the rejected idempotency key",
    { validation, corrected },
  );
  const correctedState = await readFormState();
  check(
    !correctedState.globalOverflow,
    "Installment modal overflowed horizontally on mobile",
    correctedState,
  );
  check(
    correctedState.dialogCentered,
    "Mobile modal is not centered in the viewport",
    correctedState,
  );
  check(correctedState.dialogWithinViewport, "Mobile modal escapes the viewport", correctedState);
  check(
    correctedState.modalScrollsInternally,
    "Mobile modal does not expose internal scrolling for the long form",
    correctedState,
  );
  check(
    correctedState.pageScrollYStable,
    "Opening or inspecting the mobile modal moved the page",
    correctedState,
  );
  const mobileRows = await readInstallments(fixture.accountId, "2026-11-01", "2026-12-31");
  check(
    mobileRows.length === 2,
    "Corrected mobile submission did not persist two installments",
    mobileRows,
  );
  const mobileScreenshot = "issue-553-manual-installments-mobile-390x844.png";
  await screenshot(browser.cdp, join(outputDir, mobileScreenshot));
  scenarios.push({
    route,
    viewport: "390x844",
    state: "double submit blocked and key rotated after definitive validation",
    screenshot: mobileScreenshot,
    validation,
    corrected,
    mobileRows,
  });

  await setViewport(browser.cdp, 768, 1024);
  await navigate(browser.cdp, `${baseUrl}${route}`);
  await openExpenseModal();
  const tablet = await readFormState();
  check(tablet.modalOpen, "Tablet modal did not open", tablet);
  check(
    tablet.dialogLabel.includes("Novo lançamento"),
    "Tablet modal has no usable heading",
    tablet,
  );
  check(tablet.liveRegion === "polite", "Form feedback is not announced", tablet);
  check(tablet.dialogCentered, "Tablet modal is not centered in the viewport", tablet);
  check(tablet.dialogWithinViewport, "Tablet modal escapes the viewport", tablet);
  check(
    tablet.modalScrollsInternally,
    "Tablet modal does not expose internal scrolling for the long form",
    tablet,
  );
  check(tablet.pageScrollYStable, "Opening the tablet modal moved the page", tablet);
  check(!tablet.globalOverflow, "Installment modal overflowed horizontally on tablet", tablet);
  const tabletScreenshot = "issue-553-manual-installments-tablet-768x1024.png";
  await screenshot(browser.cdp, join(outputDir, tabletScreenshot));
  scenarios.push({
    route,
    viewport: "768x1024",
    state: "installment form remained usable without overflow",
    screenshot: tabletScreenshot,
    tablet,
  });
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  scenarios,
};
await writeFile(
  join(outputDir, "issue-553-manual-installments.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 553 manual installments visual validation passed.");
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}
