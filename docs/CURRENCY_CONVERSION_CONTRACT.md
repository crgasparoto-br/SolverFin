# Contrato de moeda de referencia e consolidacao cambial

Este documento define o contrato introduzido pela issue #596. Ele complementa o contrato de agregacao multi-moedas da #595: o comportamento padrao continua sendo separar totais por moeda e nenhuma conversao cambial produtiva e adicionada nesta etapa.

## Moeda de referencia

A moeda de referencia pertence ao **perfil financeiro** (`financial_profile`). Ela e uma preferencia de apresentacao e consolidacao e nunca altera a moeda nativa de contas, lancamentos, orcamentos, faturas ou outros registros financeiros.

O contrato de dominio resolve a configuracao em dois estados:

```ts
type ReferenceCurrencyResolution =
  | { status: "configured"; scope: "financial_profile"; currency: string }
  | { status: "unconfigured"; scope: "financial_profile"; currency: null };
```

Regras de lifecycle:

- nao existe moeda universal implicita; em especial, ausencia de configuracao nao significa BRL;
- a configuracao futura deve ser armazenada no perfil financeiro, e nao em conta, usuario ou organizacao;
- mudar a preferencia do perfil afeta apenas novas solicitacoes de apresentacao/consolidacao; nao reescreve a moeda nativa nem metadados de conversoes ja materializadas por outro fluxo;
- a persistencia e a API de leitura/escrita dessa preferencia ficam fora da #596 e exigem a issue que introduzir a primeira experiencia produtiva dependente dela;
- enquanto a preferencia estiver ausente, consumidores continuam exibindo os blocos nativos por moeda definidos pela #595.

## Valor em moeda de referencia

O contrato compartilhado fica em `@solverfin/domain/currency-conversion` e sempre preserva o valor nativo.

### Valor nativo

Quando a moeda nativa ja e a moeda de referencia, nao existe conversao nem cotacao:

```json
{
  "status": "native",
  "native": { "amountMinor": 12500, "currency": "USD" },
  "referenceCurrency": "USD",
  "converted": null,
  "quote": null,
  "estimated": false
}
```

### Valor convertido

Uma conversao valida exige valor nativo, valor convertido e metadados auditaveis da cotacao:

```json
{
  "status": "converted",
  "native": { "amountMinor": 10000, "currency": "USD" },
  "referenceCurrency": "BRL",
  "converted": { "amountMinor": 54250, "currency": "BRL" },
  "quote": {
    "sourceCurrency": "USD",
    "targetCurrency": "BRL",
    "rate": "5.425",
    "quotedAt": "2026-08-19T18:00:00.000Z",
    "source": "provider-or-snapshot-id",
    "quoteId": "optional-provider-quote-id"
  },
  "estimated": false
}
```

A taxa e uma string decimal positiva para que o boundary nao introduza perda de precisao binaria antes de existir uma politica produtiva de arredondamento. O contrato desta issue nao calcula a conversao e nao escolhe provider.

### Cotacao stale

Uma cotacao que a politica do consumidor ainda permite apresentar, apesar de nao ser fresca, usa `status: "stale"` e obrigatoriamente `estimated: true`. Os mesmos metadados auditaveis continuam obrigatorios.

Esse estado permite que API e UI identifiquem a apresentacao como estimativa sem confundi-la com valor nativo ou cotacao fresca. A politica temporal que decide quando uma cotacao passa de fresca para stale ou expirada pertence ao provider/caso de uso futuro.

### Conversao indisponivel

Quando nao e possivel produzir um valor convertido, o contrato nunca sintetiza `0`, repete o valor nativo nem assume taxa `1`. Ele retorna:

```json
{
  "status": "unavailable",
  "native": { "amountMinor": 10000, "currency": "USD" },
  "referenceCurrency": "BRL",
  "converted": null,
  "quote": null,
  "estimated": false,
  "reason": "quote_missing"
}
```

Razoes canonicas:

- `reference_currency_unconfigured`: o perfil nao possui moeda de referencia; nesse caso `referenceCurrency` e `null`;
- `quote_missing`: nao existe cotacao para o par solicitado;
- `quote_expired`: existe evidencia de cotacao, mas ela nao pode mais ser usada segundo a politica de validade;
- `provider_unavailable`: a fonte necessaria para resolver a cotacao nao esta disponivel.

## Invariantes do contrato

- codigos de moeda sao normalizados para tres letras maiusculas compativeis com ISO 4217;
- valores monetarios usam unidades menores inteiras seguras no contrato atual do dominio;
- `native.currency` nunca e substituida pela moeda de referencia;
- `quote.sourceCurrency` deve coincidir com `native.currency`;
- `quote.targetCurrency` deve coincidir com `converted.currency` e com `referenceCurrency`;
- conversao entre a mesma moeda e invalida; esse caso usa `status: "native"`;
- taxa deve ser decimal positiva;
- cotacao convertida exige instante/data de referencia valido e identificador de fonte nao vazio;
- `stale` implica `estimated: true`; `converted` implica `estimated: false`;
- indisponibilidade implica `converted: null` e `quote: null`.

## Uso por APIs e UI

Dashboard, Relatorios e futuras projecoes devem tratar o contrato como dado preparado pelo dominio/backend:

1. sem moeda de referencia ou sem cotacao utilizavel, manter os valores nativos separados por moeda;
2. quando houver consolidacao futura, transportar `native`, `converted`, `status`, `estimated` e `quote` sem remover a origem;
3. UI nao calcula taxa, nao soma moedas diferentes por conta propria e nao troca moeda apenas no formatter;
4. valores `stale` precisam ser identificados como estimativa na experiencia que os exibir;
5. valores `unavailable` devem continuar indisponiveis, preservando o valor nativo quando ele for relevante para o contexto.

A introducao de um endpoint consolidado deve reutilizar esse contrato em vez de criar outro shape local.

## Fora deste recorte

A #596 nao implementa:

- provider de cotacao real;
- persistencia da preferencia de moeda de referencia;
- historico de cotacoes;
- regra produtiva de freshness/expiracao;
- politica de arredondamento/conversao;
- consolidacao de patrimonio no Dashboard ou em Relatorios.

Esses itens devem ser adicionados por issues proprias sem enfraquecer os invariantes acima.

## Referencias

- issue #596
- issue #595
- [`MULTI_CURRENCY_AGGREGATION.md`](./MULTI_CURRENCY_AGGREGATION.md)
- [`EVOLUTION_STRATEGY.md`](./EVOLUTION_STRATEGY.md)
- [`adr/0013-multi-currency-financial-aggregation.md`](./adr/0013-multi-currency-financial-aggregation.md)
- [`adr/0015-reference-currency-and-fx-conversion-contract.md`](./adr/0015-reference-currency-and-fx-conversion-contract.md)
