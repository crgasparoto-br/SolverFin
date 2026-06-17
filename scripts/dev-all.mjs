import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:net";

const host = process.env.HOST ?? "0.0.0.0";
const services = [
  { name: "api", envName: "API_PORT", port: parsePort(process.env.API_PORT, 4000, "API_PORT") },
  { name: "web", envName: "PORT", port: parsePort(process.env.PORT, 5173, "PORT") },
];

await ensurePortsAvailable(services, host);

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

function parsePort(value, fallback, envName) {
  if (value === undefined || value === "") return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(`${envName} deve ser uma porta TCP valida. Valor recebido: ${value}`);
    process.exit(1);
  }

  return port;
}

async function ensurePortsAvailable(candidateServices, candidateHost) {
  const busyServices = [];

  for (const service of candidateServices) {
    if (!(await isPortAvailable(service.port, candidateHost))) {
      busyServices.push(service);
    }
  }

  if (busyServices.length === 0) return;

  console.error("Nao foi possivel iniciar o ambiente de desenvolvimento: porta(s) em uso.");
  for (const service of busyServices) {
    console.error(`- ${service.name}: ${candidateHost}:${service.port} (${service.envName})`);
  }
  console.error("");
  console.error("Para identificar o processo que esta ocupando a porta:");
  for (const service of busyServices) {
    console.error(`  sudo ss -ltnp 'sport = :${service.port}'`);
  }
  console.error("");
  console.error("Para encerrar o processo que esta ocupando a porta:");
  for (const service of busyServices) {
    console.error(`  sudo fuser -k ${service.port}/tcp`);
  }
  console.error("");
  console.error("Ou rode com portas alternativas, por exemplo:");
  console.error("  API_PORT=4001 PORT=5174 npm run dev:all");
  process.exit(1);
}

function isPortAvailable(candidatePort, candidateHost) {
  return new Promise((resolve, reject) => {
    const probe = createServer();

    probe.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error) {
        const code = error.code;
        if (code === "EADDRINUSE" || code === "EACCES") {
          resolve(false);
          return;
        }
      }

      reject(error);
    });

    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });

    probe.listen(candidatePort, candidateHost);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
