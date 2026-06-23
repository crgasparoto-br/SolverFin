import "dotenv/config";

import { createHash } from "node:crypto";
import pg from "pg";

const { Client } = pg;

const DEFAULT_CATEGORY_TREE = [
  {
    kind: "EXPENSE",
    roots: [
      ["Moradia", ["Aluguel", "Condominio", "Agua", "Energia eletrica", "Gas", "Internet", "Telefone", "IPTU", "Manutencao residencial"]],
      ["Alimentacao", ["Mercado", "Feira", "Padaria", "Restaurante", "Delivery", "Lanches"]],
      ["Transporte", ["Combustivel", "Transporte publico", "Aplicativos de transporte", "Estacionamento", "Pedagio", "Manutencao do veiculo", "Seguro do veiculo", "IPVA e licenciamento"]],
      ["Saude", ["Plano de saude", "Consultas", "Exames", "Medicamentos", "Dentista", "Terapia"]],
      ["Educacao", ["Escola ou faculdade", "Cursos", "Livros", "Material escolar"]],
      ["Lazer", ["Viagens", "Cinema e eventos", "Assinaturas e streaming", "Hobbies", "Bares e restaurantes"]],
      ["Compras", ["Vestuario", "Eletronicos", "Casa e decoracao", "Presentes", "Cuidados pessoais"]],
      ["Servicos financeiros", ["Tarifas bancarias", "Juros", "Multas", "Anuidade de cartao", "Seguros"]],
      ["Familia e dependentes", ["Filhos", "Pets", "Ajuda familiar"]],
      ["Impostos e taxas", ["Imposto de renda", "Taxas publicas", "Documentos e cartorio"]],
      ["Outros", ["Doacoes", "Diversos", "Ajustes"]],
    ],
  },
  {
    kind: "INCOME",
    roots: [
      ["Trabalho", ["Salario", "Pro-labore", "Bonus", "Comissoes", "Freelance", "13o salario", "Ferias"]],
      ["Negocios", ["Vendas", "Prestacao de servicos", "Reembolsos de clientes"]],
      ["Investimentos", ["Rendimentos", "Dividendos", "Juros", "Alugueis recebidos", "Venda de ativos"]],
      ["Reembolsos", ["Reembolso de despesas", "Estornos", "Cashback"]],
      ["Outros recebimentos", ["Presentes recebidos", "Ajuda familiar", "Outros"]],
    ],
  },
];

function assertSafeEnvironment() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed default categories.");
  }

  if (process.env.NODE_ENV === "production" && process.env.SOLVERFIN_ALLOW_DEMO_SEED !== "true") {
    throw new Error("Default category seed is blocked in production unless SOLVERFIN_ALLOW_DEMO_SEED=true.");
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
    for (const [parentName, children] of group.roots) {
      const parentId = buildDeterministicUuid([
        profile.organizationId,
        profile.id,
        "default-category",
        group.kind,
        parentName,
      ]);

      await insertCategory(client, profile, {
        id: parentId,
        parentCategoryId: null,
        name: parentName,
        kind: group.kind,
      });
      createdCount += 1;

      for (const childName of children) {
        await insertCategory(client, profile, {
          id: buildDeterministicUuid([
            profile.organizationId,
            profile.id,
            "default-category",
            group.kind,
            parentName,
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
