import { runPilotEmptyState } from "./issue-606-pilot-empty-shared.mjs";

await runPilotEmptyState({
  route: "/orcamentos",
  expectedTexts: [
    "Nenhum item para acompanhar.",
    "Crie um orçamento ou ajuste os filtros para acompanhar outra moeda ou estado.",
  ],
  artifactStem: "issue-606-budgets-empty",
});
