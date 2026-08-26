import { runPilotEmptyState } from "./issue-606-pilot-empty-shared.mjs";

await runPilotEmptyState({
  route: "/dashboard",
  expectedTexts: ["Nenhuma pendência agora."],
  artifactStem: "issue-606-dashboard-empty",
});
