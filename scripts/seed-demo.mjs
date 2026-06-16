import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

const profiles = {
  personal: "33333333-3333-4333-8333-333333333331",
  mei: "33333333-3333-4333-8333-333333333332",
  business: "33333333-3333-4333-8333-333333333333",
};

const accounts = {
  personalChecking: "44444444-4444-4444-8444-444444444441",
  meiChecking: "44444444-4444-4444-8444-444444444442",
  businessChecking: "44444444-4444-4444-8444-444444444443",
};

const cards = {
  personalCard: "55555555-5555-4555-8555-555555555551",
};

const categories = [
  ["66666666-6666-4666-8666-666666666601", profiles.personal, "Salario demo", "INCOME"],
  ["66666666-6666-4666-8666-666666666602", profiles.personal, "Moradia demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666603", profiles.personal, "Alimentacao demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666604", profiles.personal, "Transporte demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666605", profiles.personal, "Transferencias demo", "TRANSFER"],
  ["66666666-6666-4666-8666-666666666621", profiles.mei, "Receita de servicos demo", "INCOME"],
  ["66666666-6666-4666-8666-666666666622", profiles.mei, "Ferramentas demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666623", profiles.mei, "Impostos demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666641", profiles.business, "Vendas demo", "INCOME"],
  ["66666666-6666-4666-8666-666666666642", profiles.business, "Fornecedores demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666643", profiles.business, "Operacao demo", "EXPENSE"],
];

const budgets = [
  [
    "77777777-7777-4777-8777-777777777701",
    profiles.personal,
    categories[2][0],
    "2026-06-01",
    "2026-06-30",
    120000,
    80,
  ],
  [
    "77777777-7777-4777-8777-777777777702",
    profiles.mei,
    categories[6][0],
    "2026-06-01",
    "2026-06-30",
    35000,
    80,
  ],
  [
    "77777777-7777-4777-8777-777777777703",
    profiles.business,
    categories[10][0],
    "2026-06-01",
    "2026-06-30",
    180000,
    85,
  ],
];

const transactions = [
  [
    "88888888-8888-4888-8888-888888888801",
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[0][0],
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    520000,
    "2026-06-05",
    "Receita mensal ficticia",
  ],
  [
    "88888888-8888-4888-8888-888888888802",
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[2][0],
    null,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    8650,
    "2026-06-07",
    "Compra de mercado ficticia",
  ],
  [
    "88888888-8888-4888-8888-888888888803",
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[3][0],
    null,
    "EXPENSE",
    "PLANNED",
    "MANUAL",
    4200,
    "2026-06-18",
    "Transporte previsto ficticio",
  ],
  [
    "88888888-8888-4888-8888-888888888821",
    profiles.mei,
    accounts.meiChecking,
    null,
    categories[5][0],
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    185000,
    "2026-06-10",
    "Servico prestado ficticio",
  ],
  [
    "88888888-8888-4888-8888-888888888822",
    profiles.mei,
    accounts.meiChecking,
    null,
    categories[7][0],
    null,
    "EXPENSE",
    "PLANNED",
    "MANUAL",
    9800,
    "2026-06-20",
    "Guia mensal ficticia",
  ],
  [
    "88888888-8888-4888-8888-888888888841",
    profiles.business,
    accounts.businessChecking,
    null,
    categories[8][0],
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    735000,
    "2026-06-12",
    "Venda consolidada ficticia",
  ],
  [
    "88888888-8888-4888-8888-888888888842",
    profiles.business,
    accounts.businessChecking,
    null,
    categories[9][0],
    null,
    "EXPENSE",
    "SUGGESTED",
    "IMPORT",
    146000,
    "2026-06-14",
    "Fornecedor sugerido ficticio",
  ],
];

function assertSafeEnvironment() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run the demo seed.");
  }

  if (process.env.NODE_ENV === "production" && process.env.SOLVERFIN_ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed is blocked in production unless SOLVERFIN_ALLOW_DEMO_SEED=true.");
  }
}

async function upsertDemoUser(client) {
  await client.query(
    `INSERT INTO "User" ("id", "email", "displayName", "status", "createdAt", "updatedAt")
     VALUES ($1, 'demo@solverfin.example.invalid', 'Usuario Demo SolverFin', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT ("id") DO UPDATE SET
       "email" = EXCLUDED."email",
       "displayName" = EXCLUDED."displayName",
       "status" = EXCLUDED."status",
       "updatedAt" = CURRENT_TIMESTAMP`,
    [DEMO_USER_ID],
  );
}

async function upsertDemoOrganization(client) {
  await client.query(
    `INSERT INTO "Organization" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Organizacao Demo SolverFin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT ("id") DO UPDATE SET
       "ownerUserId" = EXCLUDED."ownerUserId",
       "name" = EXCLUDED."name",
       "updatedAt" = CURRENT_TIMESTAMP`,
    [DEMO_ORGANIZATION_ID, DEMO_USER_ID],
  );
}

async function upsertDemoProfiles(client) {
  const rows = [
    [profiles.personal, "Pessoal Demo", "PERSONAL"],
    [profiles.mei, "MEI Demo", "MEI"],
    [profiles.business, "Negocio Demo", "BUSINESS"],
  ];

  for (const [id, name, kind] of rows) {
    await client.query(
      `INSERT INTO "FinancialProfile"
       ("id", "organizationId", "ownerUserId", "name", "kind", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [id, DEMO_ORGANIZATION_ID, DEMO_USER_ID, name, kind],
    );
  }
}

async function upsertDemoAccounts(client) {
  const rows = [
    [accounts.personalChecking, profiles.personal, "Conta pessoal demo", "CHECKING", 125000],
    [accounts.meiChecking, profiles.mei, "Conta MEI demo", "CHECKING", 85000],
    [accounts.businessChecking, profiles.business, "Conta negocio demo", "CHECKING", 320000],
  ];

  for (const [id, financialProfileId, name, kind, openingBalanceMinor] of rows) {
    await client.query(
      `INSERT INTO "Account"
       ("id", "organizationId", "financialProfileId", "name", "kind", "status", "currency", "openingBalanceMinor", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'BRL', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "openingBalanceMinor" = EXCLUDED."openingBalanceMinor",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [id, DEMO_ORGANIZATION_ID, financialProfileId, name, kind, openingBalanceMinor],
    );
  }
}

async function upsertDemoCards(client) {
  await client.query(
    `INSERT INTO "Card"
     ("id", "organizationId", "financialProfileId", "paymentAccountId", "name", "status", "closingDay", "dueDay", "creditLimitMinor", "maskedIdentifier", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Cartao demo', 'ACTIVE', 20, 10, 250000, 'final 4242 ficticio', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT ("id") DO UPDATE SET
       "paymentAccountId" = EXCLUDED."paymentAccountId",
       "name" = EXCLUDED."name",
       "status" = EXCLUDED."status",
       "closingDay" = EXCLUDED."closingDay",
       "dueDay" = EXCLUDED."dueDay",
       "creditLimitMinor" = EXCLUDED."creditLimitMinor",
       "maskedIdentifier" = EXCLUDED."maskedIdentifier",
       "updatedAt" = CURRENT_TIMESTAMP`,
    [cards.personalCard, DEMO_ORGANIZATION_ID, profiles.personal, accounts.personalChecking],
  );
}

async function upsertDemoCategories(client) {
  for (const [id, financialProfileId, name, kind] of categories) {
    await client.query(
      `INSERT INTO "Category"
       ("id", "organizationId", "financialProfileId", "name", "kind", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [id, DEMO_ORGANIZATION_ID, financialProfileId, name, kind],
    );
  }
}

async function upsertDemoBudgets(client) {
  for (const [
    id,
    financialProfileId,
    categoryId,
    periodStartOn,
    periodEndOn,
    plannedAmountMinor,
    threshold,
  ] of budgets) {
    await client.query(
      `INSERT INTO "Budget"
       ("id", "organizationId", "financialProfileId", "categoryId", "status", "periodStartOn", "periodEndOn", "plannedAmountMinor", "currency", "alertThresholdPercent", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, 'BRL', $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "categoryId" = EXCLUDED."categoryId",
         "status" = EXCLUDED."status",
         "periodStartOn" = EXCLUDED."periodStartOn",
         "periodEndOn" = EXCLUDED."periodEndOn",
         "plannedAmountMinor" = EXCLUDED."plannedAmountMinor",
         "alertThresholdPercent" = EXCLUDED."alertThresholdPercent",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        categoryId,
        periodStartOn,
        periodEndOn,
        plannedAmountMinor,
        threshold,
      ],
    );
  }
}

async function upsertDemoTransactions(client) {
  for (const row of transactions) {
    const [
      id,
      financialProfileId,
      accountId,
      destinationAccountId,
      categoryId,
      cardId,
      kind,
      status,
      source,
      amountMinor,
      occurredOn,
      description,
    ] = row;

    await client.query(
      `INSERT INTO "Transaction"
       ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId", "cardId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "description", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'BRL', $12, $13, $14, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "accountId" = EXCLUDED."accountId",
         "destinationAccountId" = EXCLUDED."destinationAccountId",
         "categoryId" = EXCLUDED."categoryId",
         "cardId" = EXCLUDED."cardId",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "source" = EXCLUDED."source",
         "amountMinor" = EXCLUDED."amountMinor",
         "occurredOn" = EXCLUDED."occurredOn",
         "description" = EXCLUDED."description",
         "updatedByUserId" = EXCLUDED."updatedByUserId",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        accountId,
        destinationAccountId,
        categoryId,
        cardId,
        kind,
        status,
        source,
        amountMinor,
        occurredOn,
        description,
        DEMO_USER_ID,
      ],
    );
  }
}

async function main() {
  assertSafeEnvironment();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await upsertDemoUser(client);
    await upsertDemoOrganization(client);
    await upsertDemoProfiles(client);
    await upsertDemoAccounts(client);
    await upsertDemoCards(client);
    await upsertDemoCategories(client);
    await upsertDemoBudgets(client);
    await upsertDemoTransactions(client);
    await client.query("COMMIT");
    console.log("Demo seed applied with fictitious SolverFin data.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
