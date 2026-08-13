# Runbook de regressao e baseline da Fase 2

Este documento define o gate final da Fase 2 usando apenas as validacoes ja existentes no SolverFin. Ele nao cria uma suite agregada paralela: cada evidencia deve vir dos contratos, testes e workflows canonicos do repositorio.

## Condicoes de aprovacao

O candidato so pode ser aprovado quando:

- as issues #561 a #568 estiverem concluidas e integradas;
- o fluxo CSV/OFX/mensagem -> extracao -> categorizacao -> deduplicacao/conciliacao -> Inbox -> insight -> assistente estiver coberto pela composicao final de testes;
- provider desabilitado, indisponivel ou em timeout preservar os caminhos deterministas previstos;
- concorrencia, idempotencia, retry, rollback e recuperacao apos reinicio permanecerem cobertos nos fluxos criticos;
- isolamento por organizacao/perfil e consentimento permanecerem cobertos nas superficies sensiveis;
- os jobs `Validate monorepo` e `Integration API + PostgreSQL` estiverem verdes no SHA candidato;
- o job `Chrome visual validation` estiver verde no mesmo SHA e publicar `statement-visual-evidence-<sha>`;
- teclado, foco, texto a 200%, mobile e ausencia de overflow horizontal permanecerem cobertos para as interfaces novas;
- logs, fixtures, seeds, screenshots e artefatos nao exponham dados reais, prompts, respostas brutas ou segredos;
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

Use uma base local ou efemera de teste e somente dados ficticios. Os contratos automatizados usam doubles controlados quando precisam exercitar integracoes externas.

## Gates oficiais

### CI funcional

`.github/workflows/ci.yml` e o gate funcional canonico. Nao crie workflow ou suite especial para #569.

O job `Validate monorepo` cobre ambiente, Prisma, seed, formatacao, lint, tipos, testes e build. O build web inclui o contrato de estilos SSR.

O job `Integration API + PostgreSQL` cobre migrations, seed e integracao real da API com PostgreSQL efemero.

### Validacao visual

`.github/workflows/statement-visual-validation.yml` e o gate visual canonico. O workflow usa Chrome, PostgreSQL efemero e os cenarios existentes em `scripts/statement-visual/`.

Mudancas nos documentos que fecham o baseline da Fase 2 invalidam evidencia ligada a um SHA anterior. O candidato final deve possuir uma nova execucao bem-sucedida do workflow visual e o artefato correspondente.

## Matriz de regressao da Fase 2

| Composicao | Evidencia minima reutilizada |
| --- | --- |
| CSV e OFX | parsers/preview, persistencia/revisao, idempotencia, isolamento e integracao PostgreSQL |
| Mensagem bancaria | consentimento, extracao deterministica/integracao controlada, sanitizacao, retry e privacidade |
| Extracao estruturada | schemas versionados, payload/fingerprint, legado e projecao publica |
| Categorizacao | precedencia regra -> aprendizado -> IA, baixa confianca, edicao, aprovacao e isolamento por perfil |
| Deduplicacao e conciliacao | scanner generalizado, concorrencia, alvo obsoleto, rollback e decisao atomica |
| Inbox | fila unificada, filtros/estados, conflito de versao, erro controlado e retry |
| Insights | geracao deterministica/idempotente, dados insuficientes, multimoeda, integracao indisponivel e renderizacao |
| Assistente | somente leitura, integracao controlada, fallback deterministico, reinicio, cancelamento, concorrencia, perfil/moeda e privacidade |
| Core preservado | regressao de transacoes, cartoes, recorrencias, parcelas e relatorios nos gates gerais e visuais existentes |

A matriz e uma lista de verificacao de composicao. Os documentos donos de cada dominio continuam sendo a fonte de verdade detalhada.

## Cenarios adversariais obrigatorios

A composicao final deve manter evidencia automatizada para, no minimo:

- integracao externa habilitada com cliente controlado;
- integracao externa desabilitada;
- timeout seguido do fallback previsto;
- sugestao de baixa confianca editada e aprovada;
- duplicidade e conciliacao concorrentes;
- categoria aprendida em um perfil sem reutilizacao indevida em outro;
- insight sem dados suficientes;
- conversa retomada apos reinicio e cancelada durante processamento;
- regressao completa de CSV e OFX.

## Robustez, privacidade e observabilidade

A regressao deve confirmar que tenant/perfil, consentimento, idempotencia, concorrencia, retry, rollback e estados obsoletos continuam controlados onde aplicavel. Logs e erros devem manter contexto diagnostico sem incluir conteudo bruto ou credenciais. Fixtures, seeds, screenshots e artefatos devem permanecer ficticios e minimizados.

## Findings

Se a regressao revelar um defeito ou limitacao nao documentada:

1. abrir uma issue com reproducao, impacto e evidencia minima;
2. vincular a issue a #569;
3. classificar se e bug da Fase 2 ou limitacao explicitamente fora da fase;
4. para bug da Fase 2, corrigir no fluxo canonico e reexecutar os gates afetados;
5. nao aprovar o baseline enquanto houver requisito global da Fase 2 sem resolucao.

## Registro do baseline

O baseline aprovado e o SHA final do PR de #569 com todos os gates exigidos verdes. O GitHub e a fonte de verdade para o SHA, os checks e o artefato visual; o SHA nao deve ser hardcoded neste documento porque qualquer edicao produziria um novo candidato.

`docs/STATUS_MATRIX.md` registra o estado funcional consolidado. `docs/product/INTERFACE_INVENTORY.md` registra o recorte navegavel usado na revisao final e aponta para `apps/web/src/app-shell/routes.ts`, que continua sendo o catalogo canonico de rotas.