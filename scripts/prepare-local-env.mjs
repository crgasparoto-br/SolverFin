import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(repoRoot, ".env");
const envExamplePath = resolve(repoRoot, ".env.example");

if (!existsSync(envExamplePath)) {
  console.error("Nao foi possivel preparar o ambiente local: .env.example nao foi encontrado.");
  process.exit(1);
}

if (!existsSync(envPath)) {
  copyFileSync(envExamplePath, envPath);
  console.info("Arquivo .env criado a partir de .env.example para desenvolvimento local.");
}

const envContent = readFileSync(envPath, "utf8");

if (!hasNonEmptyEnvValue(envContent, "DATABASE_URL")) {
  console.error("DATABASE_URL nao foi encontrada no .env local.");
  console.error("Adicione uma string PostgreSQL valida, por exemplo:");
  console.error(
    "DATABASE_URL=postgresql://solverfin:solverfin_dev_password@localhost:5432/solverfin?schema=public",
  );
  process.exit(1);
}

function hasNonEmptyEnvValue(content, key) {
  return content.split(/\r?\n/u).some((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return false;
    }

    const [name, ...valueParts] = trimmedLine.split("=");

    return name.trim() === key && valueParts.join("=").trim() !== "";
  });
}
