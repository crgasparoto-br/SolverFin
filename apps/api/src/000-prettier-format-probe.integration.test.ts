import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const source = await readFile(
    resolve(
      process.cwd(),
      "src/manual-installments-audit-remediation.integration.test.ts",
    ),
    "utf8",
  );
  const formatted = await format(source, { parser: "typescript" });

  console.log("PRETTIER_PROBE_BEGIN");
  console.log(Buffer.from(formatted, "utf8").toString("base64"));
  console.log("PRETTIER_PROBE_END");
  process.exitCode = 1;
}
