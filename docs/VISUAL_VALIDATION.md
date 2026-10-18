# Validacao visual por fluxo e componente

Este documento define o contrato operacional do gate visual do SolverFin durante a migracao incremental da interface descrita na ADR 0014. Ele complementa `docs/RUNBOOK.md`, `docs/DESIGN_SYSTEM.md`, `docs/UI_PRIMITIVES.md` e `docs/SCREEN_ARCHETYPES.md`.

## Fonte executavel

- `scripts/statement-visual/coverage-contract.mjs`: registro canonico dos modulos Chrome, classes de cobertura, rotas-piloto, mapeamento de componentes estruturais para fluxos reais e guards de retirada do legado.
- `scripts/statement-visual/issue-606-remediation-contract.mjs`: acrescenta as evidencias de rota exigidas pela #606, enriquece os registros com componentes/responsabilidades/assertions, gera assertions comportamentais para cada claim e decompoe cenarios compostos em execucoes de um unico registro de cobertura.
- `scripts/statement-visual/semantic-proof.mjs`: contrato de prova semantica que vincula a identidade da unidade executada às assertions realmente observadas.
- `scripts/statement-visual/issue-606-semantic-interactions.mjs`: executor focado das interacoes compostas de maior risco (foco/overflow e filtros/modal); nos fluxos focais de extrato, cartoes e relatorios, grava tambem a evidencia comportamental discriminante produzida pelo mesmo Chrome que executou o cenario.
- `scripts/statement-visual/issue-606-behavior-claims.mjs`: adaptador de evidencia que consome somente artefatos exact-SHA produzidos pelos cenarios Chrome e converte essas observacoes em assertions de `components`, `legacyProcessorIds` e `desktop-mobile`, sem abrir um segundo navegador nem mutar fixtures compartilhadas.
- `scripts/validate-statement-visual-coverage.mjs`: valida o contrato antes de abrir o navegador e executa mutation controls que preservam metadata enquanto retiram a capability observavel.
- `scripts/statement-visual/coverage-contract.test.mjs`: controles negativos e mutation tests do proprio gate.
- `scripts/run-statement-visual-validation.mjs`: executa c...[truncated]