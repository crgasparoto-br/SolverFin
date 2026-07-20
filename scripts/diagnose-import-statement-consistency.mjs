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
    select count(distinct s."id")::int as "count"
      from "AiSuggestion" s
      left join "Transaction" target
        on target."organizationId" = s."organizationId"
       and target."financialProfileId" = s."financialProfileId"
       and target."id" = s."targetEntityId"
      left join "Transaction" linked
        on linked."organizationId" = s."organizationId"
       and linked."financialProfileId" = s."financialProfileId"
       and linked."aiSuggestionId" = s."id"
     where s."kind" = 'TRANSACTION_EXTRACTION'
       and s."status" = 'APPROVED'
       and (
         s."targetEntityId" is null
         or target."id" is null
         or (linked."id" is not null and linked."id" <> target."id")
       )
  `);
  const count = result.rows[0]?.count ?? 0;
  const output = { approvedImportSuggestionsWithoutTransaction: count };

  if (json) console.log(JSON.stringify(output));
  else console.log(`[import-statement-diagnostic] inconsistent approved suggestions: ${count}`);

  if (expectZero && count !== 0) process.exitCode = 1;
} finally {
  await pool.end();
}
