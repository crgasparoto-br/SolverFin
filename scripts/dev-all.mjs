import { spawnSync, spawn } from "node:child_process";

const build = spawnSync("npm", ["run", "build:packages"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const processes = [
  { name: "api", args: ["run", "dev", "--workspace", "@solverfin/api"] },
  { name: "web", args: ["run", "dev", "--workspace", "@solverfin/web"] },
].map(({ name, args }) => {
  const child = spawn("npm", args, { stdio: "pipe", detached: true });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on("exit", (code) => {
    console.error(`[${name}] exited with code ${code}`);
    shutdown(code ?? 1);
  });

  return child;
});

let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // process group already gone
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
