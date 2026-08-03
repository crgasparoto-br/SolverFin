import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format, resolveConfig } from "prettier";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const filePath = resolve(
    process.cwd(),
    "src/manual-installments-audit-remediation.integration.test.ts",
  );
  const source = await readFile(filePath, "utf8");
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(source, { ...config, filepath: filePath });

  console.log("PRETTIER_CONFIG_PROBE_BEGIN");
  console.log(Buffer.from(formatted, "utf8").toString("base64"));
  console.log("PRETTIER_CONFIG_PROBE_END");
  process.exitCode = 1;
}
