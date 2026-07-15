import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const webDist = path.join(repoRoot, "apps", "web", "dist");
const staleArtifact = path.join(webDist, "stale-build-artifact.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

mkdirSync(webDist, { recursive: true });
writeFileSync(staleArtifact, "throw new Error('stale artifact must be removed');\n", "utf8");

const build = spawnSync(npmCommand, ["run", "build", "--workspace", "@solverfin/web"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: process.env,
});

assert.equal(
  build.status,
  0,
  `Web build failed.\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
);
assert.equal(existsSync(staleArtifact), false, "web build must remove stale dist files");

const compiledEntry = path.join(webDist, "dev-server.js");
const compiledShell = path.join(webDist, "dev-server", "shell.js");
assert.equal(existsSync(compiledEntry), true, "web build must emit dist/dev-server.js");
assert.equal(existsSync(compiledShell), true, "web build must emit the SSR shell module");

const shellModule = (await import(
  `${pathToFileURL(compiledShell).href}?build-smoke=${Date.now()}`
)) as {
  renderAuthenticatedShellDocument(input: {
    activePathname: string;
    content: string;
    currentLabel: string;
    styles: string;
  }): string;
};

const html = shellModule.renderAuthenticatedShellDocument({
  activePathname: "/dashboard",
  content: "<section>Resumo financeiro</section>",
  currentLabel: "Resumo",
  styles: "",
});

assert.match(html, /<!doctype html>/i);
assert.match(html, /<nav[^>]*aria-label="Menu principal"[\s\S]*?<svg\b/);
assert.match(html, /<button[^>]*data-logout[^>]*>[\s\S]*?<svg\b/);
