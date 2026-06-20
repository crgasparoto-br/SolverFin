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
  personalSavings: "44444444-4444-4444-8444-444444444444",
  personalWallet: "44444444-4444-4444-8444-444444444445",
};

const cards = {
  personalCard: "55555555-5555-4555-8555-555555555551",
  personalTravelCard: "55555555-5555-4555-8555-555555555552",
};

const invoices = {
  personalCardOpen: "99999999-9999-4999-8999-999999999901",
  personalCardPaid: "99999999-9999-4999-8999-999999999902",
  travelCardClosed: "99999999-9999-4999-8999-999999999903",
};

const cardPayments = {
  personalCardPaid: "88888888-8888-4888-8888-888888888909",
};

const categories = [
  ["66666666-6666-4666-8666-666666666601", profiles.personal, "Salario demo", "INCOME"],
  ["66666666-6666-4666-8666-666666666602", profiles.personal, "Moradia demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666603", profiles.personal, "Alimentacao demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666604", profiles.personal, "Transporte demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666605", profiles.personal, "Transferencias demo", "TRANSFER"],
  ["66666666-6666-4666-8666-666666666606", profiles.personal, "Assinaturas demo", "EXPENSE"],
  ["66666666-6666-4666-8666-666666666607", profiles.personal, "Saude demo", "EXPENSE"],
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
    categories[8][0],
    "2026-06-01",
    "2026-06-30",
    35000,
    80,
  ],
  [
    "77777777-7777-4777-8777-777777777703",
    profiles.business,
    categories[12][0],
    "2026-06-01",
    "2026-06-30",
    180000,
    85,
  ],
];

const demoInvoices = [
  [
    invoices.personalCardOpen,
    profiles.personal,
    cards.personalCard,
    null,
    "OPEN",
    "2026-06-01",
    "2026-06-20",
    "2026-07-10",
    48760,
    null,
  ],
  [
    invoices.personalCardPaid,
    profiles.personal,
    cards.personalCard,
    null,
    "PAID",
    "2026-05-01",
    "2026-05-20",
    "2026-06-10",
    21990,
    "2026-06-09T12:00:00.000Z",
  ],
  [
    invoices.travelCardClosed,
    profiles.personal,
    cards.personalTravelCard,
    null,
    "CLOSED",
    "2026-06-06",
    "2026-07-05",
    "2026-07-15",
    12340,
    null,
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
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    520000,
    "2026-06-05",
    "Receita mensal ficticia",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888802",
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[2][0],
    null,
    null,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    8650,
    "2026-06-07",
    "Compra de mercado ficticia",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888803",
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[3][0],
    null,
    null,
    "EXPENSE",
    "PLANNED",
    "MANUAL",
    4200,
    "2026-06-18",
    "Transporte previsto ficticio",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888821",
    profiles.mei,
    accounts.meiChecking,
    null,
    categories[7][0],
    null,
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    185000,
    "2026-06-10",
    "Servico prestado ficticio",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888822",
    profiles.mei,
    accounts.meiChecking,
    null,
    categories[9][0],
    null,
    null,
    "EXPENSE",
    "PLANNED",
    "MANUAL",
    9800,
    "2026-06-20",
    "Guia mensal ficticia",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888841",
    profiles.business,
    accounts.businessChecking,
    null,
    categories[10][0],
    null,
    null,
    "INCOME",
    "POSTED",
    "MANUAL",
    735000,
    "2026-06-12",
    "Venda consolidada ficticia",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888842",
    profiles.business,
    accounts.businessChecking,
    null,
    categories[11][0],
    null,
    null,
    "EXPENSE",
    "SUGGESTED",
    "IMPORT",
    146000,
    "2026-06-14",
    "Fornecedor sugerido ficticio",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888901",
    profiles.personal,
    null,
    null,
    categories[2][0],
    cards.personalCard,
    invoices.personalCardOpen,
    "EXPENSE",
    "RECONCILED",
    "MANUAL",
    18690,
    "2026-06-08",
    "Mercado bairro demo no cartao",
    "2026-06-09T10:00:00.000Z",
  ],
  [
    "88888888-8888-4888-8888-888888888902",
    profiles.personal,
    null,
    null,
    categories[6][0],
    cards.personalCard,
    invoices.personalCardOpen,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    7340,
    "2026-06-11",
    "Farmacia ficticia no cartao",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888903",
    profiles.personal,
    null,
    null,
    categories[3][0],
    cards.personalCard,
    invoices.personalCardOpen,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    4270,
    "2026-06-14",
    "Aplicativo de transporte demo",
    null,
  ],
  [
    "88888888-8888-4888-8888-888888888904",
    profiles.personal,
    null,
    null,
    categories[5][0],
    cards.personalCard,
    invoices.personalCardOpen,
    "EXPENSE",
    "RECONCILED",
    "MANUAL",
    18460,
    "2026-06-18",
    "Assinatura digital ficticia",
    "2026-06-18T18:00:00.000Z",
  ],
  [
    "88888888-8888-4888-8888-888888888905",
    profiles.personal,
    null,
    null,
    categories[2][0],
    cards.personalCard,
    invoices.personalCardPaid,
    "EXPENSE",
    "RECONCILED",
    "MANUAL",
    13990,
    "2026-05-06",
    "Supermercado demo fatura paga",
    "2026-05-07T09:00:00.000Z",
  ],
  [
    "88888888-8888-4888-8888-888888888906",
    profiles.personal,
    null,
    null,
    categories[3][0],
    cards.personalCard,
    invoices.personalCardPaid,
    "EXPENSE",
    "RECONCILED",
    "MANUAL",
    8000,
    "2026-05-12",
    "Mobilidade demo fatura paga",
    "2026-05-13T09:00:00.000Z",
  ],
  [
    "88888888-8888-4888-8888-888888888907",
    profiles.personal,
    null,
    null,
    categories[3][0],
    cards.personalTravelCard,
    invoices.travelCardClosed,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    12340,
    "2026-06-28",
    "Hospedagem ficticia para demonstracao",
    null,
  ],
  [
    cardPayments.personalCardPaid,
    profiles.personal,
    accounts.personalChecking,
    null,
    categories[5][0],
    null,
    invoices.personalCardPaid,
    "EXPENSE",
    "POSTED",
    "MANUAL",
    21990,
    "2026-06-09",
    "Pagamento ficticio da fatura demo",
    null,
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
    [
      accounts.personalChecking,
      profiles.personal,
      "Conta pessoal demo",
      "CHECKING",
      125000,
      "solverfin_demo",
      "final 1001 ficticio",
    ],
    [
      accounts.personalSavings,
      profiles.personal,
      "Reserva pessoal demo",
      "SAVINGS",
      280000,
      "inter",
      "final 2026 ficticio",
    ],
    [
      accounts.personalWallet,
      profiles.personal,
      "Carteira dinheiro demo",
      "CASH",
      18000,
      "solverfin_demo",
      "carteira ficticia",
    ],
    [
      accounts.meiChecking,
      profiles.mei,
      "Conta MEI demo",
      "CHECKING",
      85000,
      "solverfin_demo",
      "final 3003 ficticio",
    ],
    [
      accounts.businessChecking,
      profiles.business,
      "Conta negocio demo",
      "CHECKING",
      320000,
      "solverfin_demo",
      "final 4004 ficticio",
    ],
  ];

  for (const [
    id,
    financialProfileId,
    name,
    kind,
    openingBalanceMinor,
    institutionKey,
    maskedIdentifier,
  ] of rows) {
    await client.query(
      `INSERT INTO "Account"
       ("id", "organizationId", "financialProfileId", "name", "kind", "status", "currency", "openingBalanceMinor", "maskedIdentifier", "institutionKey", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'BRL', $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "openingBalanceMinor" = EXCLUDED."openingBalanceMinor",
         "maskedIdentifier" = EXCLUDED."maskedIdentifier",
         "institutionKey" = EXCLUDED."institutionKey",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        name,
        kind,
        openingBalanceMinor,
        maskedIdentifier,
        institutionKey,
      ],
    );
  }
}

async function upsertDemoCards(client) {
  const rows = [
    [
      cards.personalCard,
      profiles.personal,
      accounts.personalChecking,
      "Cartao rotina demo",
      "ACTIVE",
      20,
      10,
      350000,
      "final 9876 ficticio",
      "porto_bank",
      "visa",
    ],
    [
      cards.personalTravelCard,
      profiles.personal,
      accounts.personalChecking,
      "Cartao viagens demo",
      "ACTIVE",
      5,
      15,
      120000,
      "final 1234 ficticio",
      "c6",
      "mastercard",
    ],
  ];

  for (const [
    id,
    financialProfileId,
    paymentAccountId,
    name,
    status,
    closingDay,
    dueDay,
    creditLimitMinor,
    maskedIdentifier,
    institutionKey,
    brandKey,
  ] of rows) {
    await client.query(
      `INSERT INTO "Card"
       ("id", "organizationId", "financialProfileId", "paymentAccountId", "name", "status", "closingDay", "dueDay", "creditLimitMinor", "maskedIdentifier", "institutionKey", "brandKey", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "paymentAccountId" = EXCLUDED."paymentAccountId",
         "name" = EXCLUDED."name",
         "status" = EXCLUDED."status",
         "closingDay" = EXCLUDED."closingDay",
         "dueDay" = EXCLUDED."dueDay",
         "creditLimitMinor" = EXCLUDED."creditLimitMinor",
         "maskedIdentifier" = EXCLUDED."maskedIdentifier",
         "institutionKey" = EXCLUDED."institutionKey",
         "brandKey" = EXCLUDED."brandKey",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        paymentAccountId,
        name,
        status,
        closingDay,
        dueDay,
        creditLimitMinor,
        maskedIdentifier,
        institutionKey,
        brandKey,
      ],
    );
  }
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

async function upsertDemoInvoices(client) {
  for (const [
    id,
    financialProfileId,
    cardId,
    paymentTransactionId,
    status,
    periodStartOn,
    periodEndOn,
    dueOn,
    totalAmountMinor,
    paidAt,
  ] of demoInvoices) {
    await client.query(
      `INSERT INTO "Invoice"
       ("id", "organizationId", "financialProfileId", "cardId", "paymentTransactionId", "status", "periodStartOn", "periodEndOn", "dueOn", "totalAmountMinor", "currency", "paidAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BRL', $11, $12, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "cardId" = EXCLUDED."cardId",
         "paymentTransactionId" = EXCLUDED."paymentTransactionId",
         "status" = EXCLUDED."status",
         "periodStartOn" = EXCLUDED."periodStartOn",
         "periodEndOn" = EXCLUDED."periodEndOn",
         "dueOn" = EXCLUDED."dueOn",
         "totalAmountMinor" = EXCLUDED."totalAmountMinor",
         "paidAt" = EXCLUDED."paidAt",
         "updatedByUserId" = EXCLUDED."updatedByUserId",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        cardId,
        paymentTransactionId,
        status,
        periodStartOn,
        periodEndOn,
        dueOn,
        totalAmountMinor,
        paidAt,
        DEMO_USER_ID,
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
      invoiceId,
      kind,
      status,
      source,
      amountMinor,
      occurredOn,
      description,
      reconciledAt,
    ] = row;

    await client.query(
      `INSERT INTO "Transaction"
       ("id", "organizationId", "financialProfileId", "accountId", "destinationAccountId", "categoryId", "cardId", "invoiceId", "kind", "status", "source", "amountMinor", "currency", "occurredOn", "description", "reconciledAt", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'BRL', $13, $14, $15, $16, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "accountId" = EXCLUDED."accountId",
         "destinationAccountId" = EXCLUDED."destinationAccountId",
         "categoryId" = EXCLUDED."categoryId",
         "cardId" = EXCLUDED."cardId",
         "invoiceId" = EXCLUDED."invoiceId",
         "kind" = EXCLUDED."kind",
         "status" = EXCLUDED."status",
         "source" = EXCLUDED."source",
         "amountMinor" = EXCLUDED."amountMinor",
         "occurredOn" = EXCLUDED."occurredOn",
         "description" = EXCLUDED."description",
         "reconciledAt" = EXCLUDED."reconciledAt",
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
        invoiceId,
        kind,
        status,
        source,
        amountMinor,
        occurredOn,
        description,
        reconciledAt,
        DEMO_USER_ID,
      ],
    );
  }
}

async function linkDemoInvoicePayments(client) {
  await client.query(
    `UPDATE "Invoice"
     SET "paymentTransactionId" = $1, "updatedByUserId" = $5, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = $2 and "organizationId" = $3 and "financialProfileId" = $4`,
    [cardPayments.personalCardPaid, invoices.personalCardPaid, DEMO_ORGANIZATION_ID, profiles.personal, DEMO_USER_ID],
  );
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
    await upsertDemoInvoices(client);
    await upsertDemoTransactions(client);
    await linkDemoInvoicePayments(client);
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
