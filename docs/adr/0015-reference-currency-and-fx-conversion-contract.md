# ADR 0015 - Moeda de referencia e contrato de conversao cambial

- Status: Aceito
- Data: 2026-08-19

## Contexto

A ADR 0013 estabeleceu que o SolverFin e multi-moedas e proibiu agregacao implicita entre moedas diferentes. A issue #595 aplicou esse principio aos agregados atuais, que passam a permanecer particionados por moeda.

A proxima evolucao precisa permitir que Dashboard, Relatorios e projecoes solicitem, no futuro, uma apresentacao consolidada em moeda de referencia sem alterar a denominacao original dos registros e sem inventar semantica diferente em cada consumidor.

A issue #596 define somente esse contrato. Nao existe provider cambial produtivo neste recorte.

## Decisao

### Responsabilidade da moeda de referencia

A eventual moeda de referencia e uma preferencia do **perfil financeiro**.

- ela nao pertence a uma conta individual, porque precisa coordenar consumidores que leem varias contas;
- ela nao pertence ao usuario, porque um mesmo usuario pode possuir perfis financeiros com contextos distintos;
- ela nao pertence a organizacao, porque perfis distintos da mesma organizacao podem precisar de apresentacoes diferentes;
- ela nao possui default universal: ausencia de configuracao e um estado valido e nunca implica BRL.

A #596 nao adiciona coluna ao schema nem endpoint de preferencia. Quando uma experiencia produtiva passar a depender dessa configuracao, sua persistencia deve ser nullable no perfil financeiro, sem default de moeda, e a respectiva issue deve definir autorizacao, API e migracao. Essa decisao evita criar estado persistente ainda sem fluxo de leitura/escrita e preserva o contrato de ausencia explicita.

Mudar a preferencia futura afeta novas apresentacoes e consolidacoes. A mudanca nao altera a moeda nativa dos registros existentes e nao reescreve snapshots de conversao que outro fluxo venha a persistir.

### Shape de conversao

O dominio compartilha um contrato discriminado por `status`:

- `native`: origem e referencia ja possuem a mesma moeda; nao ha conversao nem cotacao;
- `converted`: conversao com cotacao utilizavel e metadados completos;
- `stale`: conversao baseada em cotacao que pode ser exibida somente como estimativa;
- `unavailable`: nao existe valor convertido utilizavel.

Todo resultado preserva o valor `native`. Resultados `converted` e `stale` tambem carregam:

- valor convertido e sua moeda;
- moeda de origem;
- moeda de destino;
- taxa decimal positiva;
- data/instante de referencia da cotacao;
- fonte da cotacao;
- identificador de cotacao quando a fonte o fornecer.

A taxa e representada por string decimal no boundary. A politica produtiva de calculo, precisao e arredondamento permanece fora desta ADR.

### Indisponibilidade e freshness

O contrato diferencia explicitamente:

- `reference_currency_unconfigured`;
- `quote_missing`;
- `quote_expired`;
- `provider_unavailable`.

Nenhum desses estados produz valor convertido. `converted` e `quote` permanecem `null`; portanto, ausencia de cotacao nao pode virar zero, copia do valor nativo ou paridade 1:1.

`stale` e diferente de `expired`: stale ainda pode ser apresentado por uma politica futura, mas deve carregar `estimated: true`; expired e indisponivel. A politica temporal concreta que classifica uma cotacao nao pertence a esta issue e deve ser definida junto ao provider/caso de uso que a introduzir.

### Boundary entre backend e interface

Conversao e consolidacao sao responsabilidades de dominio/backend. A interface recebe estados e metadados preparados e nao:

- calcula taxa;
- soma blocos de moedas diferentes;
- converte apenas trocando simbolo/formatter;
- transforma indisponibilidade em numero sintetico.

Consumidores atuais continuam usando `currencyBlocks` da #595 enquanto nao houver capacidade produtiva de conversao.

## Consequencias

### Positivas

- existe um unico vocabulary para Dashboard, Relatorios e projecoes futuras;
- valores originais permanecem rastreaveis;
- estimativas podem ser identificadas sem parecer valores nativos/frescos;
- falhas de provider ou falta de cotacao possuem fallback seguro;
- nenhuma moeda e promovida a default global por acidente.

### Custos

- consumidores futuros precisam tratar estados discriminados em vez de um unico numero;
- uma capacidade produtiva ainda precisara escolher provider, freshness, arredondamento e persistencia da preferencia;
- contratos de API futuros precisarao transportar metadados de cotacao quando exibirem conversoes.

## Nao decisoes

Esta ADR nao escolhe:

- provider ou fonte cambial produtiva;
- SLA, timeout, retry ou cache de provider;
- janela exata de freshness/staleness/expiracao;
- politica de fechamento diario versus intraday;
- algoritmo de arredondamento;
- armazenamento de historico cambial;
- endpoint ou UI para configurar moeda de referencia;
- tratamento fiscal/contabil de variacao cambial.

## Validacao minima

O contrato deve provar que:

- perfil sem moeda de referencia permanece `unconfigured` e nao assume BRL;
- valor cuja moeda ja coincide com a referencia permanece `native` sem cotacao;
- conversao exige par origem/destino coerente e metadados auditaveis;
- `stale` e explicitamente estimado;
- falta/expiracao/indisponibilidade de cotacao nao produz valor convertido;
- o valor nativo e preservado em todos os estados.

## Referencias

- issue #596
- issue #595
- ADR 0013
- `docs/CURRENCY_CONVERSION_CONTRACT.md`
- `docs/MULTI_CURRENCY_AGGREGATION.md`
- `docs/EVOLUTION_STRATEGY.md`
