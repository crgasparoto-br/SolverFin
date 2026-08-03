import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport, sleep } from "./cdp.mjs";
import { loginExpression } from "./fixtures.mjs";

const baseUrl = process.env.SOLVERFIN_WEB_URL ?? "http://127.0.0.1:5173";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];
const screenshots = [];
let browserVersion = "unknown";

if (!chromePath) throw new Error("CHROME_BIN is required for settings visual validation.");
await mkdir(outputDir, { recursive: true });

const profilesDesktop = await runScenario("profiles-desktop", 1440, 1000, "profiles");
const profilesMobile = await runScenario("profiles-mobile", 390, 844, "profiles");
const rulesDesktop = await runScenario("rules-desktop", 1440, 1000, "rules");
const rulesTablet = await runScenario("rules-tablet", 768, 1024, "rules");
const rulesMobile = await runScenario("rules-mobile", 390, 844, "rules");
const rulesZoom = await runScenario("rules-mobile-zoom-200", 390, 844, "rules", true);

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browserVersion,
  failures,
  screenshots,
  profilesDesktop,
  profilesMobile,
  rulesDesktop,
  rulesTablet,
  rulesMobile,
  rulesZoom,
};

await writeFile(join(outputDir, "settings-interface.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue 558 settings desktop, tablet, mobile and 200% text validation passed.");
}

async function runScenario(name, width, height, section, zoom = false) {
  let browser;
  try {
    browser = await launchChrome({ baseUrl, chromePath });
    browserVersion = browser.version;
    await setViewport(browser.cdp, width, height);
    await navigateWithRetry(browser.cdp, `${baseUrl}/login`, `${name}-login`);
    const login = await evaluate(browser.cdp, loginExpression());
    assert.equal(login.ok, true, `Demo login failed: ${login.status} ${login.body}`);
    await navigateWithRetry(browser.cdp, `${baseUrl}/configuracoes?section=${section}`, name);
    await waitForSettings(browser.cdp, section);

    if (zoom) {
      await evaluate(browser.cdp, `document.documentElement.style.fontSize = "200%"`);
      await sleep(120);
    }

    const dialogSelector =
      section === "profiles"
        ? '[data-open-dialog="new-profile-dialog"]'
        : '[data-open-dialog="new-automation-rule-dialog"]';
    await evaluate(
      browser.cdp,
      `document.querySelector(${JSON.stringify(dialogSelector)})?.click()`,
    );
    await waitForDialog(browser.cdp);

    const measurements = await evaluate(browser.cdp, measurementExpression(section));
    const filename = `issue-558-${name}.png`;
    await screenshot(browser.cdp, join(outputDir, filename));
    screenshots.push(filename);

    check(measurements.viewport.width === width, `${name}: largura inesperada`, measurements);
    check(measurements.noHorizontalOverflow, `${name}: overflow horizontal`, measurements);
    check(measurements.h1Count === 1, `${name}: deve existir um único h1`, measurements);
    check(measurements.h1Text === "Configurações", `${name}: h1 incorreto`, measurements);
    check(measurements.activeSection === section, `${name}: seção ativa incorreta`, measurements);
    check(measurements.linksAreGet, `${name}: navegação não usa links GET reais`, measurements);
    check(measurements.dialogOpen, `${name}: diálogo não abriu`, measurements);
    check(measurements.dialogInsideViewport, `${name}: diálogo excede o viewport`, measurements);
    check(measurements.focusableNavigation, `${name}: navegação não recebe foco`, measurements);
    check(!measurements.hasTenantOperational, `${name}: texto técnico ainda visível`, measurements);
    check(
      !measurements.hasCentavosLabel,
      `${name}: rótulo em centavos ainda visível`,
      measurements,
    );

    if (section === "profiles") {
      check(measurements.hasProfileHeading, `${name}: seção de perfis ausente`, measurements);
      check(
        !measurements.hasRulesHeading,
        `${name}: regras renderizadas junto dos perfis`,
        measurements,
      );
      check(measurements.hasProfileAction, `${name}: ação de novo perfil ausente`, measurements);
    } else {
      check(measurements.hasRulesHeading, `${name}: seção de regras ausente`, measurements);
      check(
        !measurements.hasProfileListHeading,
        `${name}: lista de perfis renderizada junto das regras`,
        measurements,
      );
      check(
        measurements.hasPriorityHelp,
        `${name}: explicação de prioridade ausente`,
        measurements,
      );
      check(measurements.hasDecimalInputs, `${name}: campos decimais ausentes`, measurements);
      check(measurements.hasReviewMessage, `${name}: mensagem de revisão ausente`, measurements);
    }

    return { name, width, height, section, zoom, measurements, screenshot: filename };
  } catch (error) {
    const details = serializeError(error);
    failures.push({ message: `${name}: validação interrompida`, details });
    return { name, width, height, section, zoom, error: details };
  } finally {
    if (browser) await browser.close(outputDir);
    await sleep(200);
  }
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
      console.warn(`Navigation to ${label} failed on attempt ${attempt}; retrying.`);
      await sleep(350 * attempt);
    }
  }
}

async function waitForSettings(cdp, section) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `document.querySelector('.settings-section-link[aria-current="page"]')?.getAttribute('href') === '/configuracoes?section=${section}'`,
    );
    if (ready) return;
    await sleep(100);
  }
  throw new Error(`Settings section ${section} did not render.`);
}

async function waitForDialog(cdp) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const open = await evaluate(cdp, `Boolean(document.querySelector('dialog[open]'))`);
    if (open) return;
    await sleep(50);
  }
  throw new Error("Settings dialog did not open.");
}

function measurementExpression(section) {
  return `(() => {
    const bodyText = document.body.innerText;
    const active = document.querySelector('.settings-section-link[aria-current="page"]');
    const dialog = document.querySelector('dialog[open]');
    const dialogRect = dialog?.getBoundingClientRect();
    const links = Array.from(document.querySelectorAll('.settings-section-link'));
    const expectedLinks = ['/configuracoes?section=profiles', '/configuracoes?section=rules'];
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      h1Count: document.querySelectorAll('h1').length,
      h1Text: document.querySelector('h1')?.textContent?.trim() || '',
      activeSection: active?.getAttribute('href')?.endsWith('section=rules') ? 'rules' : 'profiles',
      linksAreGet: links.length === 2 && links.every((link, index) => link.tagName === 'A' && link.getAttribute('href') === expectedLinks[index]),
      focusableNavigation: links.every((link) => link.tabIndex >= 0),
      dialogOpen: Boolean(dialog?.open),
      dialogInsideViewport: Boolean(dialogRect && dialogRect.left >= 0 && dialogRect.right <= window.innerWidth && dialogRect.top >= 0 && dialogRect.bottom <= window.innerHeight),
      hasTenantOperational: bodyText.includes('Tenant operacional'),
      hasCentavosLabel: bodyText.includes('em centavos'),
      hasProfileHeading: Array.from(document.querySelectorAll('h2')).some((item) => item.textContent?.trim() === 'Perfis financeiros'),
      hasProfileListHeading: Array.from(document.querySelectorAll('h3')).some((item) => item.textContent?.trim() === 'Perfis disponíveis'),
      hasRulesHeading: Array.from(document.querySelectorAll('h2')).some((item) => item.textContent?.trim() === 'Regras automáticas'),
      hasProfileAction: Boolean(document.querySelector('[data-open-dialog="new-profile-dialog"]')),
      hasPriorityHelp: bodyText.includes('Números maiores são aplicados primeiro; em empate, vence a regra criada antes.'),
      hasDecimalInputs: Boolean(document.querySelector('[name="amountMinMinor"][inputmode="decimal"]') && document.querySelector('[name="amountMaxMinor"][inputmode="decimal"]')),
      hasReviewMessage: bodyText.includes('sugestões revisáveis') && bodyText.includes('aprovação'),
      section: ${JSON.stringify(section)},
    };
  })()`;
}

function check(condition, message, details) {
  if (!condition) failures.push({ message, details });
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  return { name: "UnknownError", message: String(error), stack: "" };
}
