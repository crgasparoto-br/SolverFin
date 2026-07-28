import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const outputDir = process.env.STATEMENT_VISUAL_OUTPUT ?? "artifacts/statement-visual";
const exportDir = join(outputDir, "canonical-label-remediation");
const sourcePath = "apps/api/src/category-evolution-report.ts";
const routerPath = "apps/api/src/reports-router.ts";
const testPath = "apps/api/src/category-evolution-report.test.ts";

await mkdir(exportDir, { recursive: true });

const source = await readFile(sourcePath, "utf8");
const nextSource = source.replace(
  'return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;',
  'return `${MONTH_LABELS[month - 1]}/${String(year).padStart(4, "0").slice(-2)}`;',
);
if (nextSource === source) throw new Error("Canonical compactMonth replacement was not applied.");
await writeFile(sourcePath, nextSource);

const router = await readFile(routerPath, "utf8");
let nextRouter = router.replace(
  /,\n  type CategoryEvolutionPeriod,\n  type CategoryEvolutionReport/,
  "",
);
nextRouter = nextRouter.replace(
  /    const report = normalizeCategoryEvolutionPeriodLabels\(\n      await buildCategoryEvolutionReportForContext\(context, filters\),\n    \);/,
  "    const report = await buildCategoryEvolutionReportForContext(context, filters);",
);
nextRouter = nextRouter.replace(
  /const MONTH_LABELS = \[[\s\S]*?\] as const;\n\n/,
  "",
);
nextRouter = nextRouter.replace(
  /export function normalizeCategoryEvolutionPeriodLabels\([\s\S]*?\n}\n\nfunction compactMonth\([\s\S]*?\n}\n\n/,
  "",
);
if (nextRouter === router || nextRouter.includes("normalizeCategoryEvolutionPeriodLabels")) {
  throw new Error("Router normalization removal was not applied completely.");
}
await writeFile(routerPath, nextRouter);

const test = await readFile(testPath, "utf8");
const marker = '    assert.equal(rolling.periods[2]?.endsOn, "2026-07-31");\n';
const addition = `${marker}\n    const lowerYearMonthly = parseCategoryEvolutionFilters(\n      new URLSearchParams({ interval: "monthly", start: "0001-01", periods: "1" }),\n      reference,\n    );\n    assert.equal(lowerYearMonthly.periods[0]?.label, "Jan/01");\n\n    const lowerYearRolling = parseCategoryEvolutionFilters(\n      new URLSearchParams({ interval: "rolling-year", start: "0001-01", periods: "1" }),\n      reference,\n    );\n    assert.equal(lowerYearRolling.periods[0]?.label, "Jan/01–Dez/01");\n`;
if (!test.includes(marker)) throw new Error("Unit-test insertion marker was not found.");
const nextTest = test.replace(marker, addition);
await writeFile(testPath, nextTest);

const formatResult = spawnSync("npm", ["run", "format"], { encoding: "utf8" });
if (formatResult.status !== 0) {
  throw new Error(`npm run format failed: ${formatResult.stdout}${formatResult.stderr}`);
}

for (const path of [sourcePath, routerPath, testPath]) {
  const target = join(exportDir, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(path, target);
}

await writeFile(
  join(outputDir, "canonical-label-remediation.json"),
  `${JSON.stringify({ paths: [sourcePath, routerPath, testPath], formatStatus: formatResult.status }, null, 2)}\n`,
);

console.error("Canonical label remediation exported.");
process.exitCode = 1;
