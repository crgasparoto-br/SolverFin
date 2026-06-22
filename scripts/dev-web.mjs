import { spawn, spawnSync } from "node:child_process";

const initialBuild = spawnSync("tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
if (initialBuild.status !== 0) process.exit(initialBuild.status ?? 1);

const processes = [
  spawnService("tsc", ["-p", "tsconfig.json", "--watch", "--preserveWatchOutput"]),
  spawnService("web", ["--watch", "dist/dev-server.js"], "node"),
];

let shuttingDown = false;

function spawnService(name, args, command = "tsc") {
  const child = spawn(command, args, { stdio: "pipe" });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixOutput(name, chunk));
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixOutput(name, chunk));
  });

  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

function prefixOutput(name, chunk) {
  return String(chunk)
    .split("\n")
    .map((line, index, lines) => {
      if (index === lines.length - 1 && line === "") return "";
      return `[${name}] ${line}`;
    })
    .join("\n");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    child.kill("SIGTERM");
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
