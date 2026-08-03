import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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
  const formattedPath = "/tmp/manual-installments-audit-remediation.formatted.ts";
  const source = await readFile(filePath, "utf8");
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(source, { ...config, filepath: filePath });
  await writeFile(formattedPath, formatted, "utf8");

  const result = spawnSync("diff", ["-u", filePath, formattedPath], {
    encoding: "utf8",
  });
  console.log("PRETTIER_CONFIG_DIFF_BEGIN");
  console.log(result.stdout);
  console.log("PRETTIER_CONFIG_DIFF_END");
  process.exitCode = 1;
}
