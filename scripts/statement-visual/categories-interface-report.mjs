export function renderReport(report) {
  const status = report.failures.length === 0 ? "APROVADO" : "REPROVADO";
  const screenshot = (result) => result?.screenshot ?? "não gerada";
  const hierarchyScreenshots = (result) =>
    result?.hierarchyScreenshots?.join(", ") ?? "não geradas";
  return `# Evidência visual — Categorias\n\n- Status: **${status}**\n- Commit: \`${report.commit}\`\n- Navegador: ${report.browser}\n- Desktop: \`${screenshot(report.desktop)}\`\n- Modal desktop: \`${screenshot(report.desktopModal)}\`\n- Mobile: \`${screenshot(report.mobile)}\`\n- Modal mobile: \`${screenshot(report.mobileModal)}\`\n- Mobile estreito: \`${screenshot(report.compactMobile)}\`\n- Árvore e nomes longos 390px: \`${hierarchyScreenshots(report.mobile)}\`\n- Árvore e nomes longos 320px: \`${hierarchyScreenshots(report.compactMobile)}\`\n\n## Falhas\n\n${report.failures.length === 0 ? "Nenhuma falha encontrada.\n" : report.failures.map((failure) => `- ${failure.message}`).join("\n") + "\n"}`;
}
