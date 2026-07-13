import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class CdpClient {
  static async connect(url) {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Node.js 22+ with WebSocket support is required.");
    }
    const socket = new globalThis.WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome DevTools connection timeout")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Chrome DevTools WebSocket failed"));
      });
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.id = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP event timeout: ${method}`)), timeout);
      this.events.set(method, { resolve, reject, timer });
    });
  }

  close() {
    this.socket.close();
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
      return;
    }
    const listener = this.events.get(message.method);
    if (!listener) return;
    clearTimeout(listener.timer);
    this.events.delete(message.method);
    listener.resolve(message.params ?? {});
  }
}

export async function launchChrome({ baseUrl, chromePath, debugPort = 9222 }) {
  const profile = await mkdtemp(join(tmpdir(), "solverfin-chrome-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "--force-device-scale-factor=1",
      "--window-size=1920,1200",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const debugUrl = `http://127.0.0.1:${debugPort}`;
  await waitForHttp(`${debugUrl}/json/version`);
  const response = await fetch(`${debugUrl}/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
  const target = await response.json();
  const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");

  return {
    cdp,
    version: execFileSync(chromePath, ["--version"], { encoding: "utf8" }).trim(),
    async close(outputDir) {
      cdp.close();
      chrome.kill("SIGTERM");
      if (stderr.trim()) await writeFile(join(outputDir, "chrome-stderr.log"), stderr);
      await rm(profile, { recursive: true, force: true });
    },
  };
}

export async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 760,
    screenWidth: width,
    screenHeight: height,
  });
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
}

export async function navigate(cdp, url) {
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url });
  await loaded;
  await waitForExpression(cdp, "document.readyState === 'complete'");
}

export async function evaluate(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}

export async function screenshot(cdp, path) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function waitForHttp(url, timeout = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
