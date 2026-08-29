import { runPilotEmptyState } from "./issue-606-pilot-empty-shared.mjs";

await runPilotEmptyState({
  route: "/dashboard",
  expectedTexts: [
    "Ainda não há dados financeiros para este perfil.",
    "Cadastre uma conta ou um lançamento para iniciar o cockpit financeiro.",
  ],
  artifactStem: "issue-606-dashboard-empty",
});
