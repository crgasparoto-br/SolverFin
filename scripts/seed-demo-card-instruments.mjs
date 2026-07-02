import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DEMO_ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

const profiles = {
  personal: "33333333-3333-4333-8333-333333333331",
};

const cards = {
  personalCard: "55555555-5555-4555-8555-555555555551",
  personalTravelCard: "55555555-5555-4555-8555-555555555552",
};

const cardInstruments = {
  personalPhysical: "5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5551",
  personalVirtual: "5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5552",
  travelPhysical: "5a5a5a5a-5a5a-45a5-85a5-5a5a5a5a5553",
};

const demoCardInstruments = [
  [
    cardInstruments.personalPhysical,
    profiles.personal,
    cards.personalCard,
    "PHYSICAL",
    "PRIMARY",
    true,
    "Fisico titular demo",
    "final 9876 ficticio",
    250000,
  ],
  [
    cardInstruments.personalVirtual,
    profiles.personal,
    cards.personalCard,
    "VIRTUAL",
    "PRIMARY",
    false,
    "Virtual titular demo",
    "virtual 1122 ficticio",
    100000,
  ],
  [
    cardInstruments.travelPhysical,
    profiles.personal,
    cards.personalTravelCard,
    "PHYSICAL",
    "PRIMARY",
    true,
    "Fisico viagens demo",
    "final 1234 ficticio",
    120000,
  ],
];

function assertSafeEnvironment() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required to run the demo card instrument seed.",
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.SOLVERFIN_ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error(
      "Demo card instrument seed is blocked in production unless SOLVERFIN_ALLOW_DEMO_SEED=true.",
    );
  }
}

async function upsertDemoCardInstruments(client) {
  for (const [
    id,
    financialProfileId,
    cardId,
    type,
    holder,
    isDefault,
    name,
    maskedIdentifier,
    creditLimitMinor,
  ] of demoCardInstruments) {
    await client.query(
      `INSERT INTO "CardInstrument"
       ("id", "organizationId", "financialProfileId", "cardId", "type", "holder", "status", "isDefault", "name", "maskedIdentifier", "creditLimitMinor", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO UPDATE SET
         "cardId" = EXCLUDED."cardId",
         "type" = EXCLUDED."type",
         "holder" = EXCLUDED."holder",
         "status" = EXCLUDED."status",
         "isDefault" = EXCLUDED."isDefault",
         "name" = EXCLUDED."name",
         "maskedIdentifier" = EXCLUDED."maskedIdentifier",
         "creditLimitMinor" = EXCLUDED."creditLimitMinor",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [
        id,
        DEMO_ORGANIZATION_ID,
        financialProfileId,
        cardId,
        type,
        holder,
        isDefault,
        name,
        maskedIdentifier,
        creditLimitMinor,
      ],
    );
  }
}

async function linkDemoCardTransactionsToInstruments(client) {
  await client.query(
    `UPDATE "Transaction"
     SET "cardInstrumentId" = $1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "organizationId" = $2
       AND "financialProfileId" = $3
       AND "cardId" = $4
       AND "accountId" IS NULL`,
    [
      cardInstruments.personalPhysical,
      DEMO_ORGANIZATION_ID,
      profiles.personal,
      cards.personalCard,
    ],
  );

  await client.query(
    `UPDATE "Transaction"
     SET "cardInstrumentId" = $1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "organizationId" = $2
       AND "financialProfileId" = $3
       AND "cardId" = $4
       AND "accountId" IS NULL`,
    [
      cardInstruments.travelPhysical,
      DEMO_ORGANIZATION_ID,
      profiles.personal,
      cards.personalTravelCard,
    ],
  );
}

async function main() {
  assertSafeEnvironment();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await upsertDemoCardInstruments(client);
    await linkDemoCardTransactionsToInstruments(client);
    await client.query("COMMIT");
    console.log("Demo card instruments applied.");
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
