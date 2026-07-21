import { readFile, writeFile } from "node:fs/promises";

const path = "apps/api/src/csv-import-review.integration.test.ts";
const source = await readFile(path, "utf8");
const before = `    csv: { delimiterCandidates: string[]; missingRequiredFields: string[]; valueStrategy?: string };`;
const after = `    csv: {\n      delimiterCandidates: string[];\n      missingRequiredFields: string[];\n      valueStrategy?: string;\n    };`;
if (!source.includes(before)) throw new Error("Formatting target not found");
if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error("Formatting target is not unique");
await writeFile(path, source.replace(before, after), "utf8");
