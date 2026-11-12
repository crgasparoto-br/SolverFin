import "dotenv/config";

import { createHash } from "node:crypto";
import {
  DEFAULT_CATEGORY_TREE,
  normalizeCategoryNameForUniqueness,
} from "../packages/domain/dist/default-categories.js";
import pg from "pg";

const { Client } = pg;
const ROOT_PARENT_KEY = "__root__";

function assertSafeEnvironment() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to repair default categories for a user.");
  }

  if (process.env.NODE_ENV === "production" && process.env.SOLVERFIN_ALLOW_USER_SEED !== "true") {
    throw new Error(
      "User category repair is blocked in production unless SOLVERFIN_ALLOW_USER_SEED=true.",
    );
  }
}

function readTargetEmail() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run db:repair:default-categories:user -- email@example.com");
  }

  return email;
}

function buildDeterministicUuid(parts) {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function toDatabaseKind(kind) {
  return kind.toUpperCase();
}

async function findUserByEmail(client, email) {
  const result = await client.query(
    `select "id", "email", "displayName"
     from "User"
     where lower("email") = lower($1)
     limit 1`,
    [email],
  );

  return result.rows[0];
}

async function listProfilesForUser(client, userId) {
  const result = await client.query(
    `select "id", "organizationId", "ownerUserId", "name"
     from "FinancialProfile"
     where "ownerUserId" = $1 and "status" = 'ACTIVE'
     order by "createdAt" asc`,
    [userId],
  );

  return result.rows;
}

async function listExistingCategories(client, profile) {
  const result = await client.query(
    `select "id", "parentCategoryId", "name", "normalizedName", "kind", "status"
     from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2`,
    [profile.organizationId, profile.id],
  );

  return result.rows;
}

function buildCategoryIndex(categories) {
  return new Map(
    categories.map((category) => [
      buildCategoryIndexKey(
        category.kind.toLowerCase(),
        category.parentCategoryId,
        category.normalizedName ?? normalizeCategoryNameForUniqueness(category.name),
      ),
      category,
    ]),
  );
}

function buildCategoryIndexKey(kind, parentCategoryId, normalizedName) {
  return [kind, parentCategoryId ?? ROOT_PARENT_KEY, normalizedName].join("|");
}

async function insertCategory(client, profile, category) {
  const result = await client.query(
    `insert into "Category"
     ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "normalizedName",
      "kind", "status", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     returning "id", "parentCategoryId", "name", "normalizedName", "kind", "status"`,
    [
      category.id,
      profile.organizationId,
      profile.id,
      category.parentCategoryId,
      category.name,
      normalizeCategoryNameForUniqueness(category.name),
      toDatabaseKind(category.kind),
      profile.ownerUserId,
    ],
  );

  return result.rows[0];
}

async function findOrCreateDefaultCategory(client, profile, index, category) {
  const normalizedName = normalizeCategoryNameForUniqueness(category.name);
  const existingCategory = index.get(
    buildCategoryIndexKey(category.kind, category.parentCategoryId, normalizedName),
  );

  if (existingCategory) {
    return { category: existingCategory, created: false };
  }

  const createdCategory = await insertCategory(client, profile, {
    id: buildDeterministicUuid([
      profile.organizationId,
      profile.id,
      "default-category",
      category.kind,
      category.parentCategoryId ?? ROOT_PARENT_KEY,
      normalizedName,
    ]),
    ...category,
  });

  index.set(
    buildCategoryIndexKey(
      category.kind,
      createdCategory.parentCategoryId,
      createdCategory.normalizedName,
    ),
    createdCategory,
  );

  return { category: createdCategory, created: true };
}

async function repairProfileDefaultCategories(client, profile) {
  const categoryIndex = buildCategoryIndex(await listExistingCategories(client, profile));
  let createdCount = 0;

  for (const group of DEFAULT_CATEGORY_TREE) {
    for (const root of group.roots) {
      const rootResult = await findOrCreateDefaultCategory(client, profile, categoryIndex, {
        parentCategoryId: null,
        name: root.name,
        kind: group.kind,
      });

      if (rootResult.created) createdCount += 1;
      if (rootResult.category.status === "ARCHIVED") continue;

      for (const child of root.children ?? []) {
        const childResult = await findOrCreateDefaultCategory(client, profile, categoryIndex, {
          parentCategoryId: rootResult.category.id,
          name: child.name,
          kind: group.kind,
        });

        if (childResult.created) createdCount += 1;
      }
    }
  }

  return createdCount;
}

async function main() {
  assertSafeEnvironment();

  const email = readTargetEmail();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const user = await findUserByEmail(client, email);

    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    const profiles = await listProfilesForUser(client, user.id);

    if (profiles.length === 0) {
      throw new Error(`No active financial profile found for user: ${email}`);
    }

    let createdCount = 0;

    for (const profile of profiles) {
      const profileCreatedCount = await repairProfileDefaultCategories(client, profile);
      createdCount += profileCreatedCount;
      console.log(
        `Profile ${profile.name ?? profile.id}: default categories created ${profileCreatedCount}.`,
      );
    }

    await client.query("COMMIT");
    console.log(`Default category repair applied for ${user.email}.`);
    console.log(`Active profiles checked: ${profiles.length}.`);
    console.log(`Categories created: ${createdCount}.`);
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
