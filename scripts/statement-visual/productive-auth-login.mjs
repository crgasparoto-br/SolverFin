import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluate, launchChrome, navigate, screenshot, setViewport } from "./cdp.mjs";

const baseUrl = process.env.SOLVERFIN_PRODUCTIVE_AUTH_URL ?? "http://127.0.0.1:5174";
const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const chromePath = process.env.CHROME_BIN;
const failures = [];

if (!chromePath) throw new Error("CHROME_BIN is required for productive auth visual validation.");
await mkdir(outputDir, { recursive: true });
const browser = await launchChrome({ baseUrl, chromePath });
const viewports = [];
let accessibility;
let keyboard;
let cookieUnavailable;

try {
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await setViewport(browser.cdp, viewport.width, viewport.height);
    await navigate(browser.cdp, `${baseUrl}/login`);
    const measurements = await readMeasurements(browser.cdp);
    const image = `issue-551-productive-login-${viewport.name}.png`;
    await screenshot(browser.cdp, join(outputDir, image));

    check(measurements.passwordInputs === 0, "Productive login rendered a password field", {
      viewport,
      measurements,
    });
    check(measurements.registerActions === 0, "Productive login rendered local registration", {
      viewport,
      measurements,
    });
    check(measurements.primary.visible, "Primary secure-access action is not visible", {
      viewport,
      measurements,
    });
    check(measurements.recovery.visible, "Recovery action is not visible", {
      viewport,
      measurements,
    });
    check(
      measurements.primary.href === "/api/auth/oidc/start?returnTo=/dashboard",
      "Primary action does not use the backend-controlled OIDC start route",
      { viewport, measurements },
    );
    check(
      measurements.recovery.href === "/api/auth/oidc/start?returnTo=/dashboard",
      "Recovery action bypasses the backend-controlled OIDC start route",
      { viewport, measurements },
    );
    check(measurements.horizontalOverflow === false, "Productive login has horizontal overflow", {
      viewport,
      measurements,
    });

    viewports.push({ ...viewport, measurements, screenshot: image });
  }

  await setViewport(browser.cdp, 390, 844);
  await navigate(browser.cdp, `${baseUrl}/login`);
  await evaluate(
    browser.cdp,
    `(() => { document.documentElement.style.fontSize = '200%'; return true; })()`,
  );
  const zoomed = await readMeasurements(browser.cdp);
  check(
    zoomed.horizontalOverflow === false,
    "Productive login overflows at 200% text size",
    zoomed,
  );
  await screenshot(browser.cdp, join(outputDir, "issue-551-productive-login-zoom-200.png"));

  await navigate(browser.cdp, `${baseUrl}/login`);
  keyboard = await validateKeyboardActivation(browser.cdp);
  accessibility = await readAccessibility(browser.cdp);

  await navigate(browser.cdp, `${baseUrl}/login?erro=cookie-unavailable`);
  cookieUnavailable = await evaluate(
    browser.cdp,
    `(() => {
      const alert = document.querySelector('[role="alert"]');
      return {
        exists: Boolean(alert),
        text: alert?.textContent?.trim() || '',
        restartVisible: Boolean(document.querySelector('.primary-auth-action')),
      };
    })()`,
  );
  check(
    cookieUnavailable.exists,
    "Cookie-unavailable state does not expose an alert",
    cookieUnavailable,
  );
  check(
    cookieUnavailable.text.includes("Habilite cookies"),
    "Cookie-unavailable state does not explain how to recover",
    cookieUnavailable,
  );
  check(
    cookieUnavailable.restartVisible,
    "Cookie-unavailable state does not preserve the restart action",
    cookieUnavailable,
  );
  await screenshot(
    browser.cdp,
    join(outputDir, "issue-551-productive-login-cookie-unavailable.png"),
  );
} finally {
  await browser.close(outputDir);
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  browser: browser.version,
  failures,
  viewports,
  keyboard,
  accessibility,
  cookieUnavailable,
  screenshots: [
    ...viewports.map((viewport) => viewport.screenshot),
    "issue-551-productive-login-zoom-200.png",
    "issue-551-productive-login-cookie-unavailable.png",
  ],
};
await writeFile(
  join(outputDir, "issue-551-productive-auth.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(join(outputDir, "ISSUE-551.md"), renderReport(report));

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log("Issue #551 productive authentication visual validation passed.");
}

async function readMeasurements(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const primary = document.querySelector('.primary-auth-action');
      const recovery = document.querySelector('.productive-recovery');
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return {
        passwordInputs: document.querySelectorAll('input[type="password"]').length,
        registerActions: [...document.querySelectorAll('button, a')].filter((element) =>
          /criar usu.rio/i.test(element.textContent || '')
        ).length,
        primary: {
          visible: visible(primary),
          href: primary?.getAttribute('href') || '',
          role: primary?.getAttribute('role') || primary?.tagName.toLowerCase() || '',
        },
        recovery: {
          visible: visible(recovery),
          href: recovery?.getAttribute('href') || '',
          role: recovery?.getAttribute('role') || recovery?.tagName.toLowerCase() || '',
        },
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    })()`,
  );
}

async function validateKeyboardActivation(cdp) {
  const result = {};

  for (const [key, selector] of [
    ["primary", ".primary-auth-action"],
    ["recovery", ".productive-recovery"],
  ]) {
    await evaluate(
      cdp,
      `(() => {
        const target = document.querySelector(${JSON.stringify(selector)});
        window.__issue551Activated = '';
        target?.addEventListener('click', (event) => {
          event.preventDefault();
          window.__issue551Activated = event.currentTarget.getAttribute('href') || '';
        }, { once: true });
        target?.focus();
        return document.activeElement === target;
      })()`,
    );
    await pressEnter(cdp);
    const activated = await evaluate(cdp, `window.__issue551Activated || ''`);
    check(
      activated === "/api/auth/oidc/start?returnTo=/dashboard",
      `${key} link was not activated by Enter`,
      { activated },
    );
    result[key] = { activated };
  }

  return result;
}

async function readAccessibility(cdp) {
  await cdp.send("Accessibility.enable");
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
  const links = nodes
    .filter((node) => node.role?.value === "link")
    .map((node) => String(node.name?.value ?? ""));

  check(
    links.includes("Continuar com acesso seguro"),
    "Primary action is absent from the AX tree",
    {
      links,
    },
  );
  check(links.includes("Recuperar acesso"), "Recovery action is absent from the AX tree", {
    links,
  });

  return { linkNames: links };
}

async function pressEnter(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

function check(condition, message, details) {
  if (condition) return;
  failures.push({ message, details });
}

function renderReport(value) {
  const lines = [
    "# Issue 551 - autenticação produtiva",
    "",
    `- Commit: ${value.commit}`,
    `- Navegador: ${value.browser}`,
    `- Viewports: ${value.viewports.map((item) => `${item.width}x${item.height}`).join(", ")}`,
    `- Falhas: ${value.failures.length}`,
    "",
    "## Controles",
    "",
    "- login produtivo sem senha ou cadastro local;",
    "- início e recuperação pelo endpoint OIDC controlado pelo backend;",
    "- ativação dos links por teclado;",
    "- árvore de acessibilidade com nomes das ações;",
    "- estado de cookie indisponível com orientação e reinício;",
    "- três viewports e texto a 200% sem overflow horizontal.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
