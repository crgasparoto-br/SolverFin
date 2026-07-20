#!/usr/bin/env node

import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const expectZero = process.argv.includes("--expect-zero");
const json = process.argv.includes("--json");

if (!connectionString) {
  console.error("DATABASE_URL is required for the read-only import consistency diagnostic.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const result = await pool.query(`
    select count(*)::int as "count"
      from "AiSuggestion" s
      left join "Transaction" t
        on t."organizationId" = s."organizationId"
       and t."financialProfileId" = s."financialProfileId"
       and (t."id" = s."targetEntityId" or t."aiSuggestionId" = s."id")
     where s."kind" = 'TRANSACTION_EXTRACTION'
       and s."status" = 'APPROVED'
       and t."id" is null
  `);
  const count = result.rows[0]?.count ?? 0;
  const output = { approvedImportSuggestionsWithoutTransaction: count };

  if (json) console.log(JSON.stringify(output));
  else console.log(`[import-statement-diagnostic] inconsistent approved suggestions: ${count}`);

  if (expectZero && count !== 0) process.exitCode = 1;
} finally {
  await pool.end();
}
