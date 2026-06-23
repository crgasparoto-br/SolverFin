import "dotenv/config";

import { createHash } from "node:crypto";
import pg from "pg";

const { Client } = pg;

const DEFAULT_CATEGORY_TREE = [
  {
    kind: "EXPENSE",
    roots: [
      {
        name: "Moradia",
        children: [
          "Aluguel",
          "Condominio",
          "Agua",
          "Energia eletrica",
          "Gas",
          "Internet",
          "Telefone",
          "IPTU",
          "Manutencao residencial",
        ],
      },
      {
        name: "Alimentacao",
        children: ["Mercado", "Feira", "Padaria", "Restaurante", "Delivery", "Lanches"],
      },
      {
        name: "Transporte",
        children: [
          "Combustivel",
          "Transporte publico",
          "Aplicativos de transporte",
          "Estacionamento",
          "Pedagio",
          "Manutencao do veiculo",
          "Seguro do veiculo",
          "IPVA e licenciamento",
        ],
      },
      {
        name: "Saude",
        children: ["Plano de saude", "Consultas", "Exames", "Medicamentos", "Dentista", "Terapia"],
      },
      {
        name: "Educacao",
        children: ["Escola ou faculdade", "Cursos", "Livros", "Material escolar"],
      },
      {
        name: "Lazer",
        children: [
          "Viagens",
          "Cinema e eventos",
          "Assinaturas e streaming",
          "Hobbies",
          "Bares e restaurantes",
        ],
      },
      {
        name: "Compras",
        children: [
          "Vestuario",
          "Eletronicos",
          "Casa e decoracao",
          "Presentes",
          "Cuidados pessoais",
        ],
      },
      {
        name: "Servicos financeiros",
        children: ["Tarifas bancarias", "Juros", "Multas", "Anuidade de cartao", "Seguros"],
      },
      {
        name: "Familia e dependentes",
        children: ["Filhos", "Pets", "Ajuda familiar"],
      },
      {
        name: "Impostos e taxas",
        children: ["Imposto de renda", "Taxas publicas", "Documentos e cartorio"],
      },
      {
        name: "Outros",
        children: ["Doacoes", "Diversos", "Ajustes"],
      },
    ],
  },
  {
    kind: "INCOME",
    roots: [
      {
        name: "Trabalho",
        children: [
          "Salario",
          "Pro-labore",
          "Bonus",
          "Comissoes",
          "Freelance",
          "13o salario",
          "Ferias",
        ],
      },
      {
        name: "Negocios",
        children: ["Vendas", "Prestacao de servicos", "Reembolsos de clientes"],
      },
      {
        name: "Investimentos",
        children: ["Rendimentos", "Dividendos", "Juros", "Alugueis recebidos", "Venda de ativos"],
      },
      {
        name: "Reembolsos",
        children: ["Reembolso de despesas", "Estornos", "Cashback"],
      },
      {
        name: "Outros recebimentos",
        children: ["Presentes recebidos", "Ajuda familiar", "Outros"],
      },
    ],
  },
];

function assertSafeEnvironment() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed default categories for a user.");
  }

  if (process.env.NODE_ENV === "production" && process.env.SOLVERFIN_ALLOW_USER_SEED !== "true") {
    throw new Error(
      "User category seed is blocked in production unless SOLVERFIN_ALLOW_USER_SEED=true.",
    );
  }
}

function readTargetEmail() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run db:seed:categories:user -- email@example.com");
  }

  return email;
}

function buildDeterministicUuid(parts) {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
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

async function hasExistingCategoryStructure(client, profile) {
  const result = await client.query(
    `select 1 from "Category"
     where "organizationId" = $1 and "financialProfileId" = $2
     limit 1`,
    [profile.organizationId, profile.id],
  );

  return result.rowCount > 0;
}

async function insertCategory(client, profile, category) {
  await client.query(
    `insert into "Category"
     ("id", "organizationId", "financialProfileId", "parentCategoryId", "name", "kind", "status", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     on conflict ("id") do update set
       "parentCategoryId" = excluded."parentCategoryId",
       "name" = excluded."name",
       "kind" = excluded."kind",
       "status" = excluded."status",
       "updatedByUserId" = excluded."updatedByUserId",
       "updatedAt" = CURRENT_TIMESTAMP`,
    [
      category.id,
      profile.organizationId,
      profile.id,
      category.parentCategoryId,
      category.name,
      category.kind,
      profile.ownerUserId,
    ],
  );
}

async function seedProfileDefaultCategories(client, profile) {
  if (await hasExistingCategoryStructure(client, profile)) {
    return { createdCount: 0, skipped: true };
  }

  let createdCount = 0;

  for (const group of DEFAULT_CATEGORY_TREE) {
    for (const root of group.roots) {
      const parentId = buildDeterministicUuid([
        profile.organizationId,
        profile.id,
        "default-category",
        group.kind,
        root.name,
      ]);

      await insertCategory(client, profile, {
        id: parentId,
        parentCategoryId: null,
        name: root.name,
        kind: group.kind,
      });
      createdCount += 1;

      for (const childName of root.children) {
        await insertCategory(client, profile, {
          id: buildDeterministicUuid([
            profile.organizationId,
            profile.id,
            "default-category",
            group.kind,
            root.name,
            childName,
          ]),
          parentCategoryId: parentId,
          name: childName,
          kind: group.kind,
        });
        createdCount += 1;
      }
    }
  }

  return { createdCount, skipped: false };
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
    let skippedProfiles = 0;

    for (const profile of profiles) {
      const result = await seedProfileDefaultCategories(client, profile);
      createdCount += result.createdCount;
      if (result.skipped) skippedProfiles += 1;
    }

    await client.query("COMMIT");
    console.log(`Default category seed applied for ${user.email}.`);
    console.log(`Active profiles checked: ${profiles.length}.`);
    console.log(`Profiles skipped because they already had categories: ${skippedProfiles}.`);
    console.log(`Categories created or refreshed: ${createdCount}.`);
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
