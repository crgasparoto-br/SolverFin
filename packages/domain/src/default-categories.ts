import type { CategoryKind } from "./index.js";

export interface DefaultCategoryNode {
  readonly name: string;
  readonly children?: readonly DefaultCategoryNode[];
}

export interface DefaultCategoryGroup {
  readonly kind: CategoryKind;
  readonly roots: readonly DefaultCategoryNode[];
}

export interface DefaultCategorySuggestion {
  readonly name: string;
  readonly kind: CategoryKind;
  readonly source: "system_default";
  readonly parentName?: string;
}

export interface FlattenedDefaultCategory {
  readonly name: string;
  readonly kind: CategoryKind;
  readonly parentName?: string;
}

export const DEFAULT_CATEGORY_TREE: readonly DefaultCategoryGroup[] = [
  {
    kind: "expense",
    roots: [
      {
        name: "Moradia",
        children: [
          { name: "Aluguel" },
          { name: "Condomínio" },
          { name: "Água" },
          { name: "Energia elétrica" },
          { name: "Gás" },
          { name: "Internet" },
          { name: "Telefone" },
          { name: "IPTU" },
          { name: "Manutenção residencial" },
        ],
      },
      {
        name: "Alimentação",
        children: [
          { name: "Mercado" },
          { name: "Feira" },
          { name: "Padaria" },
          { name: "Restaurante" },
          { name: "Delivery" },
          { name: "Lanches" },
        ],
      },
      {
        name: "Transporte",
        children: [
          { name: "Combustível" },
          { name: "Transporte público" },
          { name: "Aplicativos de transporte" },
          { name: "Estacionamento" },
          { name: "Pedágio" },
          { name: "Manutenção do veículo" },
          { name: "Seguro do veículo" },
          { name: "IPVA e licenciamento" },
        ],
      },
      {
        name: "Saúde",
        children: [
          { name: "Plano de saúde" },
          { name: "Consultas" },
          { name: "Exames" },
          { name: "Medicamentos" },
          { name: "Dentista" },
          { name: "Terapia" },
        ],
      },
      {
        name: "Educação",
        children: [
          { name: "Escola ou faculdade" },
          { name: "Cursos" },
          { name: "Livros" },
          { name: "Material escolar" },
        ],
      },
      {
        name: "Lazer",
        children: [
          { name: "Viagens" },
          { name: "Cinema e eventos" },
          { name: "Assinaturas e streaming" },
          { name: "Hobbies" },
          { name: "Bares e restaurantes" },
        ],
      },
      {
        name: "Compras",
        children: [
          { name: "Vestuário" },
          { name: "Eletrônicos" },
          { name: "Casa e decoração" },
          { name: "Presentes" },
          { name: "Cuidados pessoais" },
        ],
      },
      {
        name: "Serviços financeiros",
        children: [
          { name: "Tarifas bancárias" },
          { name: "Juros" },
          { name: "Multas" },
          { name: "Anuidade de cartão" },
          { name: "Seguros" },
        ],
      },
      {
        name: "Família e dependentes",
        children: [{ name: "Filhos" }, { name: "Pets" }, { name: "Ajuda familiar" }],
      },
      {
        name: "Impostos e taxas",
        children: [
          { name: "Imposto de renda" },
          { name: "Taxas públicas" },
          { name: "Documentos e cartório" },
        ],
      },
      {
        name: "Outros",
        children: [{ name: "Doações" }, { name: "Diversos" }, { name: "Ajustes" }],
      },
    ],
  },
  {
    kind: "income",
    roots: [
      {
        name: "Trabalho",
        children: [
          { name: "Salário" },
          { name: "Pró-labore" },
          { name: "Bônus" },
          { name: "Comissões" },
          { name: "Freelance" },
          { name: "13º salário" },
          { name: "Férias" },
        ],
      },
      {
        name: "Negócios",
        children: [
          { name: "Vendas" },
          { name: "Prestação de serviços" },
          { name: "Reembolsos de clientes" },
        ],
      },
      {
        name: "Investimentos",
        children: [
          { name: "Rendimentos" },
          { name: "Dividendos" },
          { name: "Juros" },
          { name: "Aluguéis recebidos" },
          { name: "Venda de ativos" },
        ],
      },
      {
        name: "Reembolsos",
        children: [{ name: "Reembolso de despesas" }, { name: "Estornos" }, { name: "Cashback" }],
      },
      {
        name: "Outros recebimentos",
        children: [{ name: "Presentes recebidos" }, { name: "Ajuda familiar" }, { name: "Outros" }],
      },
    ],
  },
  {
    kind: "transfer",
    roots: [
      {
        name: "Transferências",
        children: [
          { name: "Entre contas próprias" },
          { name: "Aplicações" },
          { name: "Resgates" },
          { name: "Pagamento de cartão" },
        ],
      },
    ],
  },
];

export function flattenDefaultCategoryTree(): readonly FlattenedDefaultCategory[] {
  return DEFAULT_CATEGORY_TREE.flatMap((group) =>
    group.roots.flatMap((root) => [
      { name: root.name, kind: group.kind },
      ...(root.children ?? []).map((child) => ({
        name: child.name,
        kind: group.kind,
        parentName: root.name,
      })),
    ]),
  );
}

export function getDefaultCategorySuggestions(): readonly DefaultCategorySuggestion[] {
  return flattenDefaultCategoryTree().map((category) => ({
    ...category,
    source: "system_default",
  }));
}

export function normalizeCategoryNameForUniqueness(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
