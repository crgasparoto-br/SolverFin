import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "apps", "web");
const distDir = path.join(webRoot, "dist");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

rmSync(distDir, { force: true, recursive: true });

const build = spawnSync(process.execPath, [tscBin, "-p", path.join(webRoot, "tsconfig.json")], {
  cwd: webRoot,
  stdio: "inherit",
});

if (build.error) {
  console.error(build.error);
  process.exit(1);
}

if (build.status !== 0) process.exit(build.status ?? 1);
