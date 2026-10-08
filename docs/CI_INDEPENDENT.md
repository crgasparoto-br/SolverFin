# CI independente — issue #704

## Contrato

O workflow `.github/workflows/delivery-v2-ci.yml` mantém temporariamente o nome do arquivo e o **check `Delivery V2 gate`**, para preservar required checks existentes até a auditoria dos branch rulesets. Apesar desses nomes de compatibilidade, a execução usa exclusivamente `scripts/ci-classifier.mjs`, `scripts/ci-risk-policy.json`, `scripts/ci-risk-profile.mjs` e `scripts/ci-repository-risk-policy.mjs`. Nenhum job executa skills ou agentes de IA.

A classificação determinística contempla FAST, STANDARD e CRITICAL, sempre promovendo mudanças sensíveis para CRITICAL e falhando de forma conservadora para caminhos desconhecidos. O check de merge preview roda no merge ref gerado pelo GitHub, enquanto as validações específicas fazem checkout do SHA exato do head e verificam `git rev-parse HEAD`.

Os gates existentes continuam independentes: `.github/workflows/ci.yml` executa validação de monorepo e integração PostgreSQL no push de `main`; `.github/workflows/statement-visual-validation.yml` mantém a evidência Chrome nas PRs com mudanças cobertas pelos seus filtros. A trilha CRITICAL segue incluindo PostgreSQL, Prisma, integração de API e diagnóstico de consistência do extrato.

## Revisão de required checks antes de renomear

1. Inspecionar Settings > Rules > Rulesets e Settings > Branches para `main`, inclusive regras em nível de organização.
2. Conferir se `Delivery V2 gate`, `Merge preview compatibility`, `Validate monorepo`, `Integration API + PostgreSQL` e `Chrome visual validation` estão exigidos, e quais são condicionais.
3. Não exigir jobs FAST/STANDARD/CRITICAL individualmente: dois são pulados por design. Exigir o gate agregador que falha quando a única trilha escolhida não conclui com sucesso.
4. Para futura renomeação do gate, adicionar o novo check e atualizar regras na mesma janela operacional, confirmar PR de prova e então retirar o antigo.
5. Validar a PR desta migração com classificação CRITICAL e checar head SHA, merge preview, testes unitários, integração e gates visuais aplicáveis. Não habilitar merge automático.

## Rollback

Se a validação falhar, reverter o commit da migração em PR de rollback, sem excluir evidências de CI. Os nomes atuais de check/arquivo não foram alterados para tornar esse rollback seguro e evitar bloqueios de branch protection. `.delivery-v2` permanece somente como legado não referenciado pelo novo workflow; sua exclusão exige uma etapa posterior, após validação dos consumidores e comunicação prévia.

## Execução local

```bash
node --test scripts/ci-classifier.test.mjs
node scripts/ci-classifier.mjs --paths-file /tmp/ci-changed-paths.json
npm run format:check
npm run test
```
