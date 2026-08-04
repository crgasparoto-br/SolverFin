import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluate,
  launchChrome,
  navigate,
  screenshot,
  setViewport,
  sleep,
} from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir =
  process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
let browserVersion = "unknown";

if (!chromePath) {
  throw new Error(
    "CHROME_BIN is required for settings reservation validation.",
  );
}
await mkdir(outputDir, { recursive: true });

const mutationCoverage = await validateMutationSectionPreservation();
const profilesNormal = await captureProfilesTextScale(
  "profiles-mobile-baseline",
  false,
);
const profilesZoom = await captureProfilesTextScale(
  "profiles-mobile-zoom-200",
  true,
);
const profilesZoomEvidence = await compareScreenshots(
  profilesNormal,
  profilesZoom,
);

check(
  profilesZoomEvidence.available,
  "profiles-mobile-zoom-200: screenshots comparáveis ausentes",
  profilesZoomEvidence,
);
check(
  !profilesZoomEvidence.available || profilesZoomEvidence.different,
  "profiles-mobile-zoom-200: evidência ampliada é idêntica à baseline",
  profilesZoomEvidence,
);

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  failures,
  mutationCoverage,
  profilesNormal,
  profilesZoom,
  profilesZoomEvidence,
};

await writeFile(
  join(outputDir, "settings-interface-reservations.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(
    "Issue 558 reservation coverage passed: section preserved after profile/rule mutations and profiles usable at 200% text.",
  );
}

async function validateMutationSectionPreservation() {
  let browser;
  const result = {
    profileCreate: false,
    profileEdit: false,
    profileArchive: false,
    ruleCreate: false,
    ruleInactivate: false,
    rulesApply: false,
  };

  try {
    browser = await launchChrome({ baseUrl, chromePath });
    browserVersion = browser.version;
    await setViewport(browser.cdp, 1280, 900);
    await login(browser.cdp, "settings-mutation-preservation");

    const suffix = Date.now().toString(36);
    const profileName = `QA Issue 558 - Perfil ${suffix}`;
    const editedProfileName = `${profileName} editado`;
    const ruleName = `QA Issue 558 - Regra seção ${suffix}`;

    await navigateWithRetry(
      browser.cdp,
      `${baseUrl}/configuracoes?section=profiles`,
      "mutation-profiles",
    );
    await waitForSettings(browser.cdp, "profiles");

    result.profileCreate = await submitAndAssertReload(
      browser.cdp,
      "profiles",
      `(() => {
      document.querySelector('[data-open-dialog="new-profile-dialog"]')?.click();
      const form = document.querySelector('#new-profile-dialog form[data-api-form]');
      if (!form) throw new Error('new profile form missing');
      form.elements.namedItem('name').value = ${JSON.stringify(profileName)};
      form.elements.namedItem('kind').value = 'family';
      form.requestSubmit();
    })()`,
      "",
      profileName,
    );

    result.profileEdit = await submitAndAssertReload(
      browser.cdp,
      "profiles",
      `(() => {
      const name = ${JSON.stringify(profileName)};
      const row = Array.from(document.querySelectorAll('.profile-item')).find((item) => item.textContent.includes(name));
      const opener = row?.querySelector('[data-open-dialog^="edit-profile-dialog-"]');
      if (!opener) throw new Error('profile edit action missing');
      opener.click();
      const dialogId = opener.getAttribute('data-open-dialog');
      const form = document.querySelector('#' + CSS.escape(dialogId) + ' form[data-api-form]');
      if (!form) throw new Error('profile edit form missing');
      form.elements.namedItem('name').value = ${JSON.stringify(editedProfileName)};
      form.requestSubmit();
    })()`,
      profileName,
      editedProfileName,
    );

    result.profileArchive = await submitAndAssertReload(
      browser.cdp,
      "profiles",
      `(() => {
      const name = ${JSON.stringify(editedProfileName)};
      const row = Array.from(document.querySelectorAll('.profile-item')).find((item) => item.textContent.includes(name));
      const archive = row?.querySelector('[data-api-action][data-api-path$="/archive"]');
      if (!archive) throw new Error('profile archive action missing');
      window.confirm = () => true;
      archive.click();
    })()`,
      "",
      editedProfileName,
      "Arquivado",
    );

    await navigateWithRetry(
      browser.cdp,
      `${baseUrl}/configuracoes?section=rules`,
      "mutation-rules",
    );
    await waitForSettings(browser.cdp, "rules");

    result.ruleCreate = await submitAndAssertReload(
      browser.cdp,
      "rules",
      `(() => {
      document.querySelector('[data-open-dialog="new-automation-rule-dialog"]')?.click();
      const form = document.querySelector('#new-automation-rule-dialog form[data-api-form]');
      if (!form) throw new Error('new rule form missing');
      form.elements.namedItem('name').value = ${JSON.stringify(ruleName)};
      form.elements.namedItem('priority').value = '321';
      form.elements.namedItem('descriptionIncludes').value = 'preservar seção';
      form.elements.namedItem('amountMinMinor').value = '10,50';
      form.requestSubmit();
    })()`,
      "",
      ruleName,
    );

    result.ruleInactivate = await submitAndAssertReload(
      browser.cdp,
      "rules",
      `(() => {
      const name = ${JSON.stringify(ruleName)};
      const row = Array.from(document.querySelectorAll('.rule-item')).find((item) => item.textContent.includes(name));
      const archive = row?.querySelector('[data-api-action][data-api-path$="/archive"]');
      if (!archive) throw new Error('rule inactivation action missing');
      window.confirm = () => true;
      archive.click();
    })()`,
      "",
      ruleName,
      "Inativa",
    );

    result.rulesApply = await submitAndAssertReload(
      browser.cdp,
      "rules",
      `(() => {
      const apply = document.querySelector('[data-api-action][data-api-path="/api/automation-rules/apply"]');
      if (!apply) throw new Error('apply rules action missing');
      window.confirm = () => true;
      apply.click();
    })()`,
    );

    for (const [operation, passed] of Object.entries(result)) {
      check(
        passed,
        `settings mutation did not preserve its section: ${operation}`,
        result,
      );
    }

    return result;
  } catch (error) {
    const details = serializeError(error);
    failures.push({
      message: "settings mutation preservation validation interrupted",
      details,
    });
    return { ...result, error: details };
  } finally {
    if (browser) await browser.close(outputDir);
  }
}

async function submitAndAssertReload(
  cdp,
  section,
  expression,
  absentText = "",
  presentText = "",
  statusText = "",
) {
  const before = await evaluate(cdp, "performance.timeOrigin");
  await evaluate(cdp, expression);
  const state = await waitForReload(cdp, before, section);
  const content = await evaluate(
    cdp,
    `(() => {
      const presentText = ${JSON.stringify(presentText)};
      const absentText = ${JSON.stringify(absentText)};
      const statusText = ${JSON.stringify(statusText)};
      const items = Array.from(document.querySelectorAll('.profile-item, .rule-item'));
      const titleOf = (item) => item.querySelector('strong')?.textContent?.trim() || '';
      const relevantItem = presentText ? items.find((item) => titleOf(item) === presentText) : null;
      return {
        present: !presentText || Boolean(relevantItem),
        absent: !absentText || !items.some((item) => titleOf(item) === absentText),
        status: !statusText || Boolean(relevantItem?.textContent.includes(statusText)),
      };
    })()`,
  );
  return (
    state.search === `?section=${section}` &&
    content.present &&
    content.absent &&
    content.status
  );
}

async function captureProfilesTextScale(name, zoom) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    browserVersion = browser.version;
    await setViewport(browser.cdp, 390, 844);
    await login(browser.cdp, name);
    await navigateWithRetry(
      browser.cdp,
      `${baseUrl}/configuracoes?section=profiles`,
      "mutation-profiles",
    );
    await waitForSettings(browser.cdp, "profiles");

    const beforePx = await evaluate(
      browser.cdp,
      "parseFloat(getComputedStyle(document.documentElement).fontSize)",
    );
    if (zoom) {
      await evaluate(
        browser.cdp,
        `document.documentElement.style.fontSize = "200%"`,
      );
      await sleep(150);
    }
    const afterPx = await evaluate(
      browser.cdp,
      "parseFloat(getComputedStyle(document.documentElement).fontSize)",
    );

    await evaluate(
      browser.cdp,
      `document.querySelector('[data-open-dialog="new-profile-dialog"]')?.click()`,
    );
    await waitForExpression(
      browser.cdp,
      "Boolean(document.querySelector('#new-profile-dialog[open]'))",
    );

    const measurements = await evaluate(
      browser.cdp,
      `(() => {
        const dialog = document.querySelector('#new-profile-dialog[open]');
        const rect = dialog?.getBoundingClientRect();
        return {
          search: window.location.search,
          rootFontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize),
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          dialogInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
          headingVisible: document.querySelector('#profiles-section-title')?.textContent?.trim() === 'Perfis financeiros',
          profileItems: document.querySelectorAll('.profile-item').length,
        };
      })()`,
    );

    const filename = `issue-558-${name}.png`;
    await screenshot(browser.cdp, join(outputDir, filename));

    const textScale = {
      requested: zoom,
      beforePx,
      afterPx,
      ratio: beforePx > 0 ? afterPx / beforePx : 0,
    };

    check(
      measurements.search === "?section=profiles",
      `${name}: seção de perfis não foi preservada`,
      measurements,
    );
    check(
      measurements.noHorizontalOverflow,
      `${name}: overflow horizontal`,
      measurements,
    );
    check(
      measurements.dialogInsideViewport,
      `${name}: diálogo excede o viewport`,
      measurements,
    );
    check(
      measurements.headingVisible,
      `${name}: título da seção ausente`,
      measurements,
    );
    check(
      measurements.profileItems > 0,
      `${name}: perfis preenchidos ausentes`,
      measurements,
    );
    if (zoom) {
      check(
        textScale.ratio >= 1.95 && textScale.ratio <= 2.05,
        `${name}: ampliação de texto não atingiu 200%`,
        textScale,
      );
      check(
        Math.abs(measurements.rootFontSizePx - afterPx) < 0.1,
        `${name}: ampliação foi perdida antes da captura`,
        { textScale, measurements },
      );
    }

    return { name, zoom, filename, textScale, measurements };
  } catch (error) {
    const details = serializeError(error);
    failures.push({
      message: `${name}: profile text-scale validation interrupted`,
      details,
    });
    return { name, zoom, error: details };
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(200);
  }
}

async function compareScreenshots(normalScenario, zoomScenario) {
  if (!normalScenario?.filename || !zoomScenario?.filename) {
    return { available: false, different: false };
  }
  try {
    const [normalBytes, zoomBytes] = await Promise.all([
      readFile(join(outputDir, normalScenario.filename)),
      readFile(join(outputDir, zoomScenario.filename)),
    ]);
    const normalSha256 = createHash("sha256").update(normalBytes).digest("hex");
    const zoomSha256 = createHash("sha256").update(zoomBytes).digest("hex");
    return {
      available: true,
      different: normalSha256 !== zoomSha256,
      normalFile: normalScenario.filename,
      zoomFile: zoomScenario.filename,
      normalSha256,
      zoomSha256,
    };
  } catch (error) {
    return { available: false, different: false, error: serializeError(error) };
  }
}

async function login(cdp, label) {
  await navigateWithRetry(cdp, `${baseUrl}/login`, `${label}-login`);
  const loginResult = await evaluate(cdp, loginExpression());
  assert.equal(
    loginResult.ok,
    true,
    `${label}: demo login failed: ${loginResult.status} ${loginResult.body}`,
  );
}

async function navigateWithRetry(cdp, url, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await navigate(cdp, url);
      return;
    } catch (error) {
      const state = await evaluate(
        cdp,
        `({ href: window.location.href, readyState: document.readyState })`,
      ).catch(() => ({ href: "", readyState: "" }));
      if (state.href.startsWith(url) && state.readyState !== "loading") return;
      if (attempt === 3) throw error;
      console.warn(
        `Navigation to ${label} failed on attempt ${attempt}; retrying.`,
      );
      await sleep(350 * attempt);
    }
  }
}

async function waitForSettings(cdp, section) {
  await waitForExpression(
    cdp,
    `document.querySelector('.settings-section-link[aria-current="page"]')?.getAttribute('href') === '/configuracoes?section=${section}'`,
  );
}

async function waitForReload(cdp, previousTimeOrigin, section) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const state = await evaluate(
        cdp,
        `({
          timeOrigin: performance.timeOrigin,
          search: window.location.search,
          ready: document.readyState === 'complete',
          active: document.querySelector('.settings-section-link[aria-current="page"]')?.getAttribute('href') || ''
        })`,
      );
      if (
        state.timeOrigin !== previousTimeOrigin &&
        state.ready &&
        state.search === `?section=${section}` &&
        state.active === `/configuracoes?section=${section}`
      ) {
        return state;
      }
    } catch {
      // Reload briefly replaces the execution context.
    }
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for settings reload in section ${section}.`,
  );
}

async function waitForExpression(cdp, expression, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {
      // Navigation can replace the execution context briefly.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
    };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}
