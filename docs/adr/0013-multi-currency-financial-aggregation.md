# ADR 0013 - Multi-moedas e agregacao financeira explicita

- Status: Aceito
- Data: 2026-08-16

## Contexto

O SolverFin atende contextos pessoais, familiares, MEI, profissionais e pequenos negocios e ja possui moeda em diferentes entidades e contratos. O produto deve ser tratado como multi-moedas de ponta a ponta.

Um valor monetario sem moeda conhecida e ambiguo. Da mesma forma, somar valores denominados em moedas diferentes sem uma etapa de conversao produz um resultado matematicamente valido, mas financeiramente incorreto. Esse risco afeta dashboard, saldos, relatorios, orcamentos, metas, projecoes, insights e assistente.

## Decisao

O SolverFin adota os seguintes invariantes:

1. Todo valor monetario deve possuir moeda explicita no boundary em que e persistido, calculado ou exibido.
2. Agregacoes financeiras devem ocorrer somente entre valores da mesma moeda.
3. Quando um recorte contiver mais de uma moeda, a resposta padrao deve ser particionada por moeda.
4. E proibido rotular um agregado multi-moedas como BRL ou qualquer outra moeda sem conversao comprovada.
5. Consolidacao em uma moeda de referencia somente pode ser introduzida com um contrato explicito de cambio.
6. Uma conversao deve manter informacao suficiente para auditoria e reproducao: moeda de origem, moeda de destino, taxa, data/instante de referencia e origem da cotacao.
7. A eventual moeda de referencia do perfil e uma preferencia de apresentacao/consolidacao; ela nao altera a moeda nativa do registro e nao autoriza conversao implicita.
8. APIs, dominio, relatorios, view-models e componentes de UI devem transportar moeda sem depender de hardcode de BRL.
9. Testes relevantes devem incluir cenarios com pelo menos duas moedas e controlar explicitamente o comportamento sem cotacao disponivel.

A ADR 0015 detalha a responsabilidade da moeda de referencia e o shape auditavel da conversao futura sem ativar provider cambial produtivo.

## Consequencias

### Positivas

- impede saldos e totais silenciosamente incorretos;
- torna relatorios e projecoes auditaveis;
- permite evoluir posteriormente para patrimonio consolidado e Open Finance sem reescrever a semantica basica;
- reduz divergencia entre backend, interface e assistente.

### Custos

- endpoints que hoje retornam um unico total podem precisar evoluir para blocos por moeda;
- componentes e testes precisam carregar moeda explicitamente;
- consolidacao em moeda de referencia exige uma capacidade separada de cotacao/cambio;
- fixtures e cenarios de teste precisam deixar de assumir BRL universal.

## Nao decisoes deste ADR

Este ADR nao escolhe:

- provider de cotacao cambial;
- politica de fechamento diario ou intraday de cotacoes;
- moeda de referencia padrao de novos perfis;
- tratamento fiscal/contabil de ganho cambial;
- estrategia de hedge ou recomendacao financeira.

Esses pontos exigem issues/ADRs proprias quando entrarem no escopo. A ADR 0015 resolve apenas o contrato e o ownership da moeda de referencia; provider, politica temporal e default de novos perfis continuam nao definidos.

## Regras de migracao

Enquanto nao existir conversao cambial produtiva:

- telas e APIs devem exibir/separar totais por moeda;
- qualquer consolidado convertido deve permanecer indisponivel em vez de inferir paridade ou usar taxa ficticia;
- contratos antigos que assumem BRL devem ser identificados e migrados por issues rastreaveis;
- o comportamento legado pode permanecer temporariamente apenas quando explicitamente coberto pela issue de migracao e sem produzir agregado misto incorreto.

## Validacao minima

A implementacao desta decisao deve comprovar, quando aplicavel:

- BRL + BRL agrega em BRL;
- USD + USD agrega em USD;
- BRL + USD nao produz um total unico sem conversao;
- filtros por moeda preservam tenant/perfil;
- respostas e componentes mostram a moeda correta;
- ausencia de cotacao falha de forma controlada quando uma conversao for solicitada.

## Referencias

- `docs/EVOLUTION_STRATEGY.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/REPORTS.md`
- `docs/API_REPORTS.md`
- `docs/CURRENCY_CONVERSION_CONTRACT.md`
- `docs/adr/0015-reference-currency-and-fx-conversion-contract.md`
