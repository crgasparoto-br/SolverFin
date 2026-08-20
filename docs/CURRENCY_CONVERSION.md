# Contrato de moeda de referencia e conversao cambial

Este documento define o contrato transversal da issue #596 para futuras consolidacoes em moeda de referencia. Ele complementa a ADR 0013 e o contrato de agregacao de `MULTI_CURRENCY_AGGREGATION.md` sem ativar provider, cotacao externa, conversao produtiva ou persistencia nova.

## Principios

- O valor nativo continua sendo a fonte financeira primaria e nunca e reescrito por uma conversao.
- A moeda de referencia e uma preferencia opcional de apresentacao/consolidacao do perfil financeiro, nao a moeda nativa dos registros.
- Ausencia de preferencia nao implica BRL nem qualquer outra moeda: o consumidor continua usando os blocos nativos por moeda.
- Valores de moedas diferentes so podem formar um consolidado depois de uma conversao explicita e auditavel de cada parcela que precise ser convertida.
- Falta, expiracao ou indisponibilidade de cotacao torna a conversao indisponivel. Nunca se usa taxa `1`, total `0` ou outra aproximacao silenciosa como fallback.
- Dashboard, Relatorios e futuras projecoes devem compartilhar este contrato em vez de inventar representacoes locais.

## Moeda de referencia do perfil

`ReferenceCurrencyPreference` representa a preferencia quando ela existir:

```ts
interface ReferenceCurrencyPreference {
  currency: string;
  updatedAt: ISODateTime;
}
```

Ciclo de vida:

1. **Ausente**: nao ha moeda de referencia implicita e nenhum consolidado convertido deve ser produzido.
2. **Definida**: o codigo deve ser normalizado para tres letras maiusculas compativeis com ISO 4217.
3. **Alterada**: a nova preferencia vale para solicitacoes futuras de apresentacao/consolidacao. Registros nativos e evidencias de conversoes ja produzidas nao sao reescritos.
4. **Removida**: consumidores voltam ao contrato nativo particionado por moeda.

Esta issue nao adiciona campo a `FinancialProfile`, migration, endpoint de preferencia nem UI de configuracao. Uma issue futura que persista a preferencia deve preservar escopo por perfil financeiro, validacao de moeda e rastreabilidade da alteracao. Tambem permanece sem decisao um eventual valor inicial sugerido para novos perfis; ele nunca pode ser inferido como BRL pelo backend generico.

## Cotacao auditavel

Uma cotacao disponivel usa o shape compartilhado `ExchangeRateQuote`:

```ts
interface ExchangeRateQuote {
  sourceCurrency: string;
  targetCurrency: string;
  rate: string;
  referenceAt: ISODateTime;
  expiresAt: ISODateTime;
  source: string;
}
```

Semantica dos campos:

- `sourceCurrency`: moeda nativa do valor que sera convertido;
- `targetCurrency`: moeda de referencia desejada;
- `rate`: decimal positivo serializado como string, preservando a representacao recebida/selecionada para auditoria;
- `referenceAt`: instante ao qual a cotacao se refere;
- `expiresAt`: instante limite de uso da cotacao para uma nova conversao;
- `source`: identificador nao vazio e auditavel da origem da cotacao.

Todos os campos `ISODateTime` deste contrato (`updatedAt`, `referenceAt`, `expiresAt` e `evaluatedAt`) representam instantes inequivocos. A serializacao deve incluir `Z` ou offset numerico explicito no formato `+/-HH:MM`; strings sem timezone e datas civis impossiveis sao invalidas. Assim, a disponibilidade de uma mesma cotacao nao pode mudar conforme o timezone configurado no processo que executa o dominio.

A taxa deve representar unidades da moeda de destino por unidade da moeda de origem. A camada que futuramente calcular `convertedAmountMinor` deve declarar sua politica de casas decimais e arredondamento antes de uso produtivo; esta issue nao escolhe algoritmo de conversao ou arredondamento porque nenhuma conversao e executada agora.

`expiresAt` torna o comportamento de expiracao verificavel sem escolher nesta issue uma politica global diaria, intraday ou por provider. A futura fonte de cotacao sera responsavel por fornecer o prazo de validade conforme a politica que vier a ser aprovada.

## Resultado de consulta de cotacao

A fronteira entre uma futura fonte de cotacao e o dominio usa estados fechados:

```ts
type ExchangeRateLookupResult =
  | { status: "available"; quote: ExchangeRateQuote }
  | { status: "missing" }
  | { status: "unavailable" };
```

- `missing`: nenhuma cotacao foi encontrada para o par/instante solicitado;
- `unavailable`: a fonte existe conceitualmente, mas nao conseguiu fornecer uma cotacao utilizavel;
- `available`: a cotacao foi obtida e ainda precisa passar pelas validacoes de par, taxa, instante, origem e expiracao.

Uma cotacao `available` so e utilizavel quando `referenceAt <= evaluatedAt <= expiresAt`. Antes de `referenceAt`, o contrato rejeita o uso porque a evidencia ainda nao e valida; depois de `expiresAt`, a disponibilidade passa a `quote_expired`.

O mesmo intervalo temporal e obrigatorio na criacao direta de um valor `converted`: `createConvertedReferenceCurrencyAmount` exige `evaluatedAt` e rejeita cotacao futura ou expirada. Assim, chamar o factory diretamente nao permite contornar a verificacao feita por `resolveReferenceCurrencyAvailability`.

## Valor nativo, convertido ou indisponivel

APIs e view-models devem distinguir os tres estados pelo discriminador `kind`.

### Nativo

Quando a moeda nativa ja e a moeda de referencia, nao existe conversao e nenhuma cotacao 1:1 e fabricada:

```json
{
  "kind": "native",
  "native": { "amountMinor": 125000, "currency": "USD" },
  "referenceCurrency": "USD"
}
```

### Convertido

Quando houve conversao valida, o valor nativo permanece presente ao lado do valor convertido e da evidencia usada:

```json
{
  "kind": "converted",
  "native": { "amountMinor": 2000, "currency": "USD" },
  "referenceCurrency": "EUR",
  "converted": { "amountMinor": 1840, "currency": "EUR" },
  "exchangeRate": {
    "sourceCurrency": "USD",
    "targetCurrency": "EUR",
    "rate": "0.9200",
    "referenceAt": "2035-07-12T12:00:00.000Z",
    "expiresAt": "2035-07-12T18:00:00.000Z",
    "source": "example:approved-rate-source"
  }
}
```

O contrato exige coerencia relacional:

- `native.currency === exchangeRate.sourceCurrency`;
- `referenceCurrency === converted.currency`;
- `referenceCurrency === exchangeRate.targetCurrency`;
- `native.currency !== referenceCurrency` para um valor com `kind = converted`;
- `exchangeRate.referenceAt <= evaluatedAt <= exchangeRate.expiresAt` no instante em que o valor convertido e criado.

O helper de dominio valida essa representacao, inclusive a janela temporal da cotacao, mas deliberadamente nao calcula a conversao.

### Indisponivel

Quando uma conversao seria necessaria mas nao pode ser comprovada, o valor nativo continua disponivel e o campo convertido nao existe:

```json
{
  "kind": "unavailable",
  "native": { "amountMinor": 2000, "currency": "USD" },
  "referenceCurrency": "EUR",
  "reason": "quote_missing"
}
```

Razoes permitidas:

- `quote_missing`;
- `quote_expired`;
- `quote_unavailable`.

Nenhum desses estados pode ser serializado como `converted.amountMinor = 0`, como paridade 1:1 ou como um valor rotulado na moeda de referencia sem evidencia.

## Integracao com agregados multi-moedas

`currencyBlocks` permanece a forma canonica sem conversao. Um consumidor futuro que ofereca consolidacao deve partir desses blocos nativos e projetar cada bloco para a moeda de referencia.

Exemplo conceitual para um perfil com USD e EUR e referencia EUR:

- bloco EUR -> `kind: native`;
- bloco USD com cotacao valida USD/EUR -> `kind: converted`;
- bloco USD sem cotacao utilizavel -> `kind: unavailable`.

Um total consolidado em EUR so pode ser produzido quando todos os blocos que exigem conversao possuem representacao `converted` valida. Se qualquer bloco estiver `unavailable`, o consolidado deve ficar indisponivel e os blocos nativos permanecem exibiveis separadamente.

A presenca da preferencia de moeda de referencia nao muda a resposta nativa atual dos endpoints nem autoriza o cliente a somar `currencyBlocks` por conta propria.

## Uso por Dashboard, Relatorios e projecoes

### Dashboard

O resumo financeiro atual continua exibindo `currencyBlocks`. Quando uma issue futura ativar consolidacao, a API deve fornecer as representacoes `native`/`converted`/`unavailable`; o frontend apenas apresenta os dados e metadados recebidos, sem buscar cotacao ou recalcular cambio.

### Relatorios

Series e totais nativos continuam particionados por moeda. Uma visao convertida futura deve preservar a serie nativa e associar evidencia cambial suficiente ao recorte convertido. Falha de cotacao nao pode ocultar a serie nativa nem transformar ausencia em zero.

### Projecoes

Cada periodo projetado deve usar uma referencia cambial explicitamente adequada ao proprio horizonte/instante. Uma cotacao valida para um periodo nao deve ser reutilizada silenciosamente em outro apenas para completar o consolidado. A politica temporal concreta sera definida junto da capacidade produtiva de cotacao/projecao.

## Fronteiras e responsabilidades

- **Dominio compartilhado**: tipos, discriminadores, validacao de moeda, metadados e coerencia entre moeda nativa, destino e cotacao.
- **Fonte de cotacao futura**: localizar cotacao e informar `available`, `missing` ou `unavailable`, incluindo `expiresAt` conforme politica aprovada.
- **Calculador futuro**: calcular `convertedAmountMinor` com politica explicita de precisao/arredondamento e devolver a evidencia usada.
- **API**: transportar valor nativo e eventual valor convertido sem substituir um pelo outro.
- **UI**: distinguir visualmente valor nativo, valor convertido e indisponibilidade; nunca inventar taxa ou consolidado.

## Fora de escopo desta issue

- escolher ou integrar provider de cambio;
- persistir historico de cotacoes;
- persistir a preferencia no schema do perfil;
- definir endpoint/UI de configuracao da preferencia;
- definir algoritmo produtivo de conversao, minor units ou arredondamento;
- consolidar patrimonio ou alterar telas atuais;
- substituir `currencyBlocks` nos contratos existentes.

## Validacao minima do contrato

A implementacao compartilhada deve provar:

- a moeda de referencia e sempre explicita e nao possui fallback BRL;
- mesma moeda retorna representacao nativa, sem cotacao 1:1 fabricada;
- `missing`, `expired` e `unavailable` nao geram valor convertido;
- uma cotacao nao pode ser usada antes de `referenceAt` nem depois de `expiresAt`;
- as bordas `referenceAt` e `expiresAt` sao inclusivas;
- `updatedAt`, `referenceAt`, `expiresAt` e `evaluatedAt` sem timezone explicito sao rejeitados;
- datas civis impossiveis sao rejeitadas em vez de normalizadas silenciosamente;
- a mesma entrada com `Z`/offset explicito produz o mesmo estado sob diferentes timezones do processo;
- o factory de valor `converted` aplica a mesma janela temporal da etapa de disponibilidade;
- taxa zero/invalida e rejeitada;
- cotacao com moeda de origem diferente da moeda nativa e rejeitada;
- cotacao com moeda de destino diferente da moeda de referencia e rejeitada;
- valor convertido preserva simultaneamente valor nativo, destino, taxa, instante de referencia, validade e fonte.

## Referencias

- issue #596;
- issue #595;
- [`adr/0013-multi-currency-financial-aggregation.md`](./adr/0013-multi-currency-financial-aggregation.md);
- [`MULTI_CURRENCY_AGGREGATION.md`](./MULTI_CURRENCY_AGGREGATION.md);
- [`API_FINANCIAL_SUMMARY.md`](./API_FINANCIAL_SUMMARY.md);
- [`API_REPORTS.md`](./API_REPORTS.md);
- [`EVOLUTION_STRATEGY.md`](./EVOLUTION_STRATEGY.md).
