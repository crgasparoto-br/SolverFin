import { runPilotEmptyState } from "./issue-606-pilot-empty-shared.mjs";

await runPilotEmptyState({
  route: "/contas-cartoes",
  expectedTexts: ["Nenhuma conta cadastrada.", "Nenhum cartão cadastrado."],
  artifactStem: "issue-606-accounts-cards-empty",
});
