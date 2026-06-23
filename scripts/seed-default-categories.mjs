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
          "Condomínio",
          "Água",
          "Energia elétrica",
          "Gás",
          "Internet",
          "Telefone",
          "IPTU",
          "Manutenção residencial",
        ],
      },
      {
        name: "Alimentação",
        children: ["Mercado", "Feira", "Padaria", "Restaurante", "Delivery", "Lanches"],
      },
      {
        name: "Transporte",
        children: [
          "Combustível",
          "Transporte público",
          "Aplicativos de transporte",
          "Estacionamento",
          "Pedágio",
          "Manutenção do veículo",
          "Seguro do veículo",
          "IPVA e licenciamento",
        ],
      },
      {
        name: "Saúde",
        children: ["Plano de saúde", "Consultas", "Exames", "Medicamentos", "Dentista", "Terapia"],
      },
      {
        name: "Educação",
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
          "Vestuário",
          "Eletrônicos",
          "Casa e decoração",
          "Presentes",
          "Cuidados pessoais",
        ],
      },
      {
        name: "Serviços financeiros",
        children: ["Tarifas bancárias", "Juros", "Multas", "Anuidade de cartão", "Seguros"],
      },
      {
        name: "Família e dependentes",
        children: ["Filhos", "Pets", "Ajuda familiar"],
      },
      {
        name: "Impostos e taxas",
        children: ["Imposto de renda", "Taxas públicas", "Documentos e cartório"],
      },
      {
        name: "Outros",
        children: ["Doações", "Diversos", "Ajustes"],
      },
    ],
  },
  {
    kind: "INCOME",
    roots: [
      {
        name: "Trabalho",
        children: [
          "Salário",
          "Pró-labore",
          "Bônus",
          "Comissões",
          "Freelance",
          "13º salário",
          "Férias",
        ],
      },
      {
        name: "Negócios",
        children: ["Vendas", "Prestação de serviços", "Reembolsos de clientes"],
      },
      {
        name: "Investimentos",
        children: ["Rendimentos", "Dividendos", "Juros", "Aluguéis recebidos", "Venda de ativos"],
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
    throw new Error("DATABASE_URL is required to seed default categories.");
  }

  if (process.env.NODE_ENV === "production" && process.env.SOLVERFIN_ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Default category seed is blocked in production unless SOLVERFIN_ALLOW_DEMO_SEED=true.",
    );
  }
}

function buildDeterministicUuid(parts) {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex");
  const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

  return uuid;
}

async function listProfiles(client) {
  const result = await client.query(
    `select "id", "organizationId", "ownerUserId"
     from "FinancialProfile"
     where "status" = 'ACTIVE'
     order by "createdAt" asc`,
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
    return 0;
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

  return createdCount;
}

async function main() {
  assertSafeEnvironment();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    const profiles = await listProfiles(client);
    let createdCount = 0;

    for (const profile of profiles) {
      createdCount += await seedProfileDefaultCategories(client, profile);
    }

    await client.query("COMMIT");
    console.log(`Default category seed applied.
Categories created or refreshed: ${createdCount}.`);
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
