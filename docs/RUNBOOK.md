# Runbook de regressao e baseline da Fase 2

Este documento define o gate final da Fase 2 usando apenas as validacoes ja existentes no SolverFin.

## Condicoes de aprovacao

O candidato so pode ser aprovado quando:

- as issues #561 a #568 estiverem concluidas;
- os jobs `Validate monorepo` e `Integration API + PostgreSQL` estiverem verdes no SHA candidato;
- o job `Chrome visual validation` estiver verde no mesmo SHA e publicar `statement-visual-evidence-<sha>`;
- nao houver regressao conhecida de robustez, privacidade, isolamento ou observabilidade;
- todo bug encontrado durante a regressao estiver vinculado a #569 e resolvido antes do fechamento.

## Reproducao local

```bash
npm ci
npm run validate
```

Para a integracao com PostgreSQL local:

```bash
cp .env.example .env
docker compose up -d postgres
npm run test:integration
```

Use uma base local ou efemera de teste. O gate de CI continua sendo a evidencia executavel do candidato publicado.

## Gates oficiais

### CI

`.github/workflows/ci.yml` e o gate funcional canonico. Nao crie uma suite paralela para #569.

O job `Validate monorepo` cobre ambiente, Prisma, seed, formatacao, lint, tipos, testes e build. O build web inclui o contrato de estilos SSR.

O job `Integration API + PostgreSQL` cobre migrations, seed e integracao real da API com PostgreSQL efemero.

### Validacao visual

`.github/workflows/statement-visual-validation.yml` e o gate visual canonico. O workflow usa Chrome, PostgreSQL efemero e os cenarios existentes em `scripts/statement-visual/`.

Mudancas nos documentos de fechamento da Fase 2 invalidam a evidencia ligada a um SHA anterior. O candidato final deve possuir uma nova execucao bem-sucedida do workflow visual e o artefato correspondente.

## Matriz de regressao

| Jornada | Evidencia minima |
| --- | --- |
| Autenticacao, shell e navegacao | testes web/SSR, contrato de estilos e cenarios de login/navegacao existentes |
| Dashboard e relatorios | testes web/API e cenarios visuais de relatorios |
| Lancamentos, recorrencias e parcelas | testes de dominio/API/web, integracao PostgreSQL e cenarios visuais do Extrato/parcelas |
| Confirmacoes e estados apos mutacoes | contratos de API/web e cobertura existente de idempotencia, concorrencia e retorno de estado |
| Planejamento financeiro | testes existentes de orcamentos, metas e fluxos relacionados |
| Inbox, alertas e revisao | testes da fila unificada, categorizacao, deduplicacao/conciliacao e cenarios visuais da Inbox |
| Insights e assistente | testes deterministas, provider fake e cenarios visuais dedicados de #567 e #568 |

A matriz e uma lista de verificacao. Os contratos donos de cada dominio continuam sendo a fonte de verdade detalhada.

## Robustez e privacidade

A regressao deve confirmar que isolamento por tenant/perfil, idempotencia, concorrencia, retry e estados obsoletos continuam controlados onde aplicavel. Logs, erros, fixtures, screenshots e artefatos devem permanecer ficticios e minimizados.

## Findings

Se a regressao revelar um defeito:

1. abrir uma issue de bug com reproducao e impacto;
2. vincular o bug a #569;
3. corrigir no fluxo canonico;
4. reexecutar os gates afetados no novo SHA;
5. nao aprovar o baseline enquanto houver bug descoberto e nao resolvido.

## Registro do baseline

O baseline aprovado e o SHA final do PR de #569 com todos os gates exigidos verdes. O GitHub e a fonte de verdade para o SHA, os checks e o artefato visual.

`docs/STATUS_MATRIX.md` registra o estado funcional consolidado. `docs/product/INTERFACE_INVENTORY.md` registra o recorte navegavel usado na revisao final e aponta para `apps/web/src/app-shell/routes.ts`, que continua sendo o catalogo canonico de rotas.