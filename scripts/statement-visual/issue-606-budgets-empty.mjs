import { runPilotEmptyState } from "./issue-606-pilot-empty-shared.mjs";

await runPilotEmptyState({
  route: "/orcamentos",
  expectedTexts: ["Nenhum orçamento cadastrado."],
  artifactStem: "issue-606-budgets-empty",
});
