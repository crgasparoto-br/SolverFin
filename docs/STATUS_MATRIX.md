# Matriz de status do MVP

Esta matriz registra o estado consolidado do SolverFin e separa o baseline concluido da Fase 2 de lacunas gerais do MVP. Os contratos detalhados permanecem nos documentos donos de cada dominio.

## Legenda

- **Feito:** existe implementacao verificavel no codigo atual.
- **Parcial:** existe parte relevante, mas a lacuna restante pertence a outro recorte.
- **Legado:** existe para compatibilidade ou transicao e nao orienta novas jornadas.

## Fontes de verdade

- `docs/PRODUCT.md`: escopo, principios e roadmap.
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

## Decisoes de jornada preservadas

- compromissos de conta corrente permanecem no Extrato da conta;
- compromissos de cartao permanecem em Cartoes de Credito;
- recorrencias e parcelas permanecem incorporadas as jornadas existentes, sem rota propria;
- a Inbox continua sendo a fronteira unificada para sugestoes revisaveis;
- o assistente continua estritamente somente leitura;
- o inventario completo de rotas fica em `docs/product/INTERFACE_INVENTORY.md`, com `apps/web/src/app-shell/routes.ts` como fonte executavel.

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

As lacunas gerais marcadas como `Parcial` nesta matriz nao sao reclassificadas como trabalho da Fase 2. A Fase 3 permanece separada e inclui o recorte descrito em `docs/PRODUCT.md`.
