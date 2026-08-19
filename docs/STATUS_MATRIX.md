# Matriz de status do MVP

Esta matriz registra o estado consolidado do SolverFin e separa o baseline concluido da Fase 2 das lacunas gerais do MVP e das proximas fases planejadas. Os contratos detalhados permanecem nos documentos donos de cada dominio.

## Legenda

- **Feito:** existe implementacao verificavel no codigo atual.
- **Parcial:** existe parte relevante, mas a lacuna restante pertence a outro recorte.
- **Legado:** existe para compatibilidade ou transicao e nao orienta novas jornadas.
- **Planejado:** decisao/estrategia documentada, mas implementacao depende de issue aberta e nao deve ser tratada como concluida.

## Fontes de verdade

- `docs/PRODUCT.md`: escopo, principios e fases de evolucao.
- `docs/EVOLUTION_STRATEGY.md`: estrategia das Fases 3 e 4 e ordem de dependencias.
- `docs/ARCHITECTURE.md`: arquitetura, CI e invariantes tecnicos.
- `docs/RUNBOOK.md`: gate final e reproducao da regressao da Fase 2.
- `docs/product/INTERFACE_INVENTORY.md`: recorte navegavel do baseline.
- `apps/web/src/app-shell/routes.ts`: catalogo canonico de rotas.
- contratos de dominio/API/IA em `docs/` e `docs/ai/`.

## Baseline da Fase 2 - Automacao e IA aplicada

As dependencias #561, #562, #563, #564, #565, #566, #567 e #568 estao concluidas como `completed`. A issue #569 e o gate de composicao final e nao adiciona funcionalidade nova.

| Capacidade da Fase 2                      | Estado | Contrato principal                                         |
| ----------------------------------------- | ------ | ---------------------------------------------------------- |
| Payloads estruturados e versionados       | Feito  | `docs/AI_SUGGESTION_PAYLOADS.md`                           |
| Integracao externa substituivel e segura  | Feito  | `docs/ai/providers.md`, `docs/ENVIRONMENT.md`, ADR 0010    |
| Importacao CSV/OFX revisavel              | Feito  | `docs/IMPORTS.md`                                          |
| Mensagens bancarias autorizadas           | Feito  | `docs/BANK_MESSAGE_INBOX.md`                               |
| Categorizacao por regra, aprendizado e IA | Feito  | `docs/AUTOMATION_RULES.md`, `docs/ai/category-learning.md` |
| Fila unificada de revisao                 | Feito  | `docs/AI_REVIEW_QUEUE.md`                                  |
| Deduplicacao e conciliacao generalizadas  | Feito  | `docs/DETERMINISTIC_DEDUP_RECONCILIATION.md`               |
| Insights financeiros verificaveis         | Feito  | `docs/FINANCIAL_INSIGHTS.md`                               |
| Assistente financeiro somente leitura     | Feito  | `docs/FINANCIAL_ASSISTANT.md`, ADR 0011                    |

### Composicao ponta a ponta

O recorte integrado da fase e:

1. entrada CSV, OFX ou mensagem autorizada;
2. extracao estruturada;
3. categorizacao;
4. deteccao deterministica de duplicidade ou conciliacao;
5. edicao e decisao pela fila unificada da Inbox;
6. geracao de insight verificavel;
7. consulta somente leitura pelo assistente.

A composicao preserva os caminhos deterministas quando a integracao externa esta desabilitada, indisponivel ou em timeout.

### Invariantes transversais

- isolamento por organizacao e perfil financeiro;
- consentimento revalidado nas superficies aplicaveis;
- idempotencia, concorrencia, retry, rollback e estados obsoletos controlados onde aplicavel;
- payload estruturado como fonte de valores e vinculos;
- evidencias operacionais com dados ficticios e minimizados;
- interfaces novas cobertas por teclado, foco, mobile, texto a 200% e reflow nos cenarios dedicados.

## Status geral fora do gate da Fase 2

As linhas `Parcial` abaixo sao lacunas gerais do MVP e nao pendencias implicitas da Fase 2. Evolucoes exigem issue propria.

| Area                   | Estado atual         | Limite explicito                                 |
| ---------------------- | -------------------- | ------------------------------------------------ |
| Contas                 | Parcial              | Sem tela dedicada de detalhe                     |
| Categorias             | Parcial              | Sem tela dedicada de detalhe                     |
| Lancamentos / Extrato  | Feito no fluxo atual | Jornada operacional permanece no Extrato         |
| Recorrencias           | Feito no fluxo atual | Sem rota propria                                 |
| Parcelas               | Feito no fluxo atual | Sem rota propria; manutencao conservadora        |
| Cartoes / Faturas      | Feito no fluxo atual | Cadastro mestre separado da rotina operacional   |
| Orcamentos             | Parcial              | Sem tela dedicada de detalhe/uso                 |
| Contas a pagar/receber | Legado               | Compatibilidade sem jornada operacional propria  |
| Relatorios             | Feito                | Somente leitura no recorte atual                 |
| Perfis financeiros     | Parcial              | Evolucoes multiusuario ficam em recorte separado |
| Autenticacao produtiva | Feito no codigo      | Ativacao depende da configuracao do ambiente     |
| Configuracoes          | Parcial              | Novas preferencias ficam em evolucao propria     |

## Fase 3 - Integridade financeira, multi-moedas e fundacao de interface

A Fase 3 esta **em execucao**. O trabalho operacional esta organizado nas epicas #589, #590 e #591 e respectivas subissues; cada capacidade abaixo deve refletir apenas o estado verificavel do seu proprio recorte.

| Capacidade estrutural                                         | Estado    | Contrato principal                           |
| ------------------------------------------------------------- | --------- | -------------------------------------------- |
| Compra de cartao x liquidacao sem dupla contabilizacao        | Feito     | #593, `docs/CARDS.md`, `docs/API_REPORTS.md` |
| Saldo/metricas coerentes com a semantica financeira           | Feito     | #594, `docs/API_FINANCIAL_SUMMARY.md`        |
| Agregacao multi-moedas explicita                              | Planejado | #589, ADR 0013                               |
| Contrato para consolidacao cambial auditavel futura           | Planejado | #589, ADR 0013                               |
| Datas financeiras formalizadas                                | Feito     | #597, `docs/TRANSACTION_DATES.md`            |
| Invariantes financeiros ponta a ponta                         | Planejado | #589                                         |
| Design system operacional com primitivas executaveis          | Planejado | #590, `docs/DESIGN_SYSTEM.md`                |
| View-models/presenters para separar UI de calculos            | Planejado | #590, ADR 0014                               |
| Retirada gradual de pos-processamento textual de HTML         | Planejado | #590, ADR 0014                               |
| Dashboard migrado para cockpit de decisao                     | Planejado | #591                                         |
| Extrato migrado para novo padrao                              | Planejado | #591                                         |
| Cartoes/Faturas migrados para hierarquia cartao-fatura        | Planejado | #591                                         |
| Relatorios com resumo/visualizacao antes da matriz detalhada  | Planejado | #591                                         |
| Demais superficies convergentes aos arquetipos compartilhados | Planejado | #591                                         |

### Regras de transicao da Fase 3

- O baseline da Fase 2 nao e reclassificado como incompleto por causa da nova estrategia.
- O SSR e o gate visual permanecem obrigatorios enquanto cada rota depender do mecanismo atual.
- Pos-processadores HTML atuais sao legado de migracao e nao justificam novos pos-processadores como arquitetura preferencial.
- Multi-moedas e invariante imediato para novas implementacoes; nenhum trabalho novo deve introduzir agregado cruzado entre moedas.
- Itens planejados so mudam para `Parcial` ou `Feito` quando houver implementacao verificavel e issue correspondente.

## Fase 4 - Previsibilidade financeira e planejamento

A primeira trilha da Fase 4 esta **planejada** na epica #592 e depende dos contratos e superficies estruturados na Fase 3.

| Capacidade de previsibilidade                              | Estado    | Contrato principal    |
| ---------------------------------------------------------- | --------- | --------------------- |
| Fonte canonica de compromissos futuros sem dupla contagem  | Planejado | #592 / #616           |
| Projecao de fluxo de caixa 30/60/90 dias por moeda         | Planejado | #592 / #617, ADR 0013 |
| Valor livre para gastar deterministico e explicavel        | Planejado | #592 / #618           |
| Orcamentos com realizado/comprometido/disponivel/projetado | Planejado | #592 / #619           |
| Recorrencias futuras acionaveis nas jornadas existentes    | Planejado | #592 / #620           |
| Insights priorizados, deduplicados e com drilldown         | Planejado | #592 / #621           |

### Regras da Fase 4

- A Fase 4 nao corrige por conta propria semantica financeira que deveria estar resolvida na #589.
- Projecoes e indicadores permanecem deterministas e separados por moeda sem conversao explicita.
- A Fase 4 reutiliza components/view-models da #590 e superficies migradas da #591.
- Open Finance, provider de cambio, carteira completa de ativos e recomendacoes reguladas permanecem fora da epica #592.
- Itens planejados so mudam para `Parcial` ou `Feito` quando houver implementacao verificavel e issue correspondente.

## Decisoes de jornada preservadas

- compromissos de conta corrente permanecem no Extrato da conta;
- compromissos de cartao permanecem em Cartoes de Credito;
- recorrencias e parcelas permanecem incorporadas as jornadas existentes, sem rota propria;
- a Inbox continua sendo a fronteira unificada para sugestoes revisaveis;
- o assistente continua estritamente somente leitura;
- o provider do assistente aceita somente `DIRECT` ou `CONTEXTUAL`; numeros e fatos seguem deterministas;
- o inventario completo de rotas fica em `docs/product/INTERFACE_INVENTORY.md`, com `apps/web/src/app-shell/routes.ts` como fonte executavel;
- telas e contratos multi-moedas devem separar totais por moeda ate existir conversao explicita.

## Gate final da Fase 2 (#569)

O baseline so e considerado aprovado no SHA final do PR de #569 quando, no mesmo candidato:

- `Validate monorepo` estiver verde;
- `Integration API + PostgreSQL` estiver verde;
- `Chrome visual validation` estiver verde e publicar `statement-visual-evidence-<sha>`;
- os cenarios minimos e adversariais de `docs/RUNBOOK.md` estiverem representados pelas suites canonicas;
- nao houver finding de regressao da Fase 2 sem issue explicita e resolucao;
- nenhuma capacidade da Fase 2 permanecer como `Parcial` sem issue vinculada.

O SHA aprovado e o head do PR com os checks verdes no GitHub e nao e hardcoded neste arquivo, evitando uma atualizacao autorreferente que criaria outro candidato.

## Limites fora da Fase 2

As lacunas gerais marcadas como `Parcial` nesta matriz nao sao reclassificadas como trabalho da Fase 2. As Fases 3 e 4 seguem `docs/PRODUCT.md` e `docs/EVOLUTION_STRATEGY.md`, e cada capacidade exige issue propria.
