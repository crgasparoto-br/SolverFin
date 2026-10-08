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

## Evidência de remediação da auditoria da issue #704

- **A-704-01:** `scripts/ci-legacy-dependency.test.mjs` examina todos os arquivos YAML de workflows ativos e reprova comandos de execução do runtime legado. O diretório `.delivery-v2` ainda existe apenas por compatibilidade histórica; não removê-lo nesta PR sem revisar consumidores e comunicar previamente. A ausência de dependências em outros ambientes externos não é inferida deste teste.
- **A-704-02:** o contexto `Delivery V2 gate` segue inalterado para evitar bloquear regras já existentes. A conferência real dos rulesets de repositório e organização é uma verificação operacional obrigatória antes do merge; documentação ou CI verde não a substituem. Registrar os checks requeridos e seu source app no registro operacional de mudança.
- **A-704-03:** `scripts/ci-gate.test.mjs` executa cenários positivos e negativos dos três perfis, incluindo falha de classificação, falha no merge preview e trilha adicional indevida. São testes do contrato do gate, não substitutos de PRs reais classificadas FAST e STANDARD, cuja execução deve ser verificada em PRs próprias antes da conclusão da migração.
- **A-704-04:** o fallback de formatação usa apenas `prettier --check`; a CI não modifica arquivos versionados durante os diagnósticos.

### Critérios operacionais de liberação

Antes do merge manual, confirmar o workflow no SHA exato, ausência de references executáveis legadas fora dos workflows GitHub, required checks nas regras aplicáveis e uma estratégia documentada para validação de FAST/STANDARD. Nunca tratar um check skipped como sucesso obrigatório isolado.

## Auditoria da PR #705

- A-705-01: merge preview instala dependencias quando a trilha FAST altera arquivos web estaticos, inclusive SVG, antes de executar typecheck. Teste de regressao em `scripts/ci-classifier.test.mjs`.
- A-705-02: verificar invocacoes indiretas por scripts de pacotes, scripts shell e acoes locais antes de declarar independencia completa do runtime legado.
- A-705-03: obter evidencia das regras de protecao de `main` e required checks no GitHub, incluindo source app; a verificacao exige acesso administrativo.
- A-705-04: executar PRs reais separadas para FAST e STANDARD. Os testes de unidade nao substituem os workflows de integracao.

A PR #705 permanece sem merge ate a verificacao operacional.
