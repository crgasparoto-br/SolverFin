import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const webSourceDir = dirname(fileURLToPath(import.meta.url));
const candidateEnvPaths = [
  resolve(webSourceDir, "../../../.env"),
  resolve(webSourceDir, "../../.env"),
  resolve(process.cwd(), ".env"),
];

const envPath = candidateEnvPaths.find((candidatePath) => existsSync(candidatePath));

if (envPath) {
  config({ path: envPath });
} else {
  config();
}
