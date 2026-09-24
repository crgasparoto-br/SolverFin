# API de projeção de fluxo de caixa

`GET /api/cash-flow-projection` é a fonte canônica da projeção determinística de caixa do SolverFin para os horizontes de 30, 60 e 90 dias.

## Parâmetros

- `referenceDate=YYYY-MM-DD`: data civil de referência. Quando omitida, o servidor resolve a data UTC corrente uma única vez no boundary da requisição e devolve o valor resolvido no payload.
- `horizonDays=30|60|90`: horizonte da série; o padrão é 30.
- `currency=BRL`: opcional. Sem filtro, a resposta permanece particionada por moeda.

O saldo inicial de cada moeda é a posição financeira ao fim de `referenceDate`, reutilizando o mesmo contrato de `GET /api/financial-summary`. A agenda futura é consultada somente de `referenceDate + 1` até `referenceDate + horizonDays` por `GET /api/future-commitments`.

## Resposta

A resposta contém `referenceDate`, `horizonDays`, `from`, `to` e `currencyBlocks[]`. Cada bloco possui:

- `currency`;
- `openingBalanceMinor`: saldo ao fim da data de referência;
- `closingBalanceMinor`: saldo ao fim do horizonte;
- `points[]`: exatamente um ponto por dia civil do horizonte.

Cada ponto possui `date`, `netMovementMinor`, `closingBalanceMinor` e `movements[]`. Dias sem eventos continuam presentes, com movimento líquido zero e saldo repetido.

`movements[]` expõe evidência suficiente para drilldown: `commitmentId`, `effectId`, descrição, origem canônica, papel do efeito, valor, moeda e vínculos de conta/cartão/categoria quando existirem. O frontend não soma compromissos, não reconstrói dias ausentes e não recalcula saldos.

## Multi-moedas e transferências

Moedas diferentes nunca são somadas. Uma transferência planejada de 538,32 BRL para 100,00 USD continua sendo um único compromisso lógico da agenda da #616:

- a série BRL recebe o efeito `-53832`;
- a série USD recebe o efeito `+10000`;
- ambos os movimentos preservam o mesmo `commitmentId`;
- não existe conversão implícita, cotação inventada nem reclassificação como receita/despesa econômica.

## Lifecycle e consistência temporal

O cálculo não mantém cache canônico. Cada consulta relê o saldo e a agenda vigentes; editar, materializar, reconciliar ou anular um compromisso altera a consulta seguinte conforme os contratos de origem.

Movimentos já efetivos em `referenceDate` pertencem ao saldo inicial e não voltam como evento futuro. O primeiro ponto é sempre o dia civil seguinte; os horizontes 30, 60 e 90 possuem respectivamente 30, 60 e 90 pontos contínuos.

## Consumidores

Dashboard e Relatórios consomem este mesmo endpoint. As duas superfícies apresentam valores retornados pelo backend; nenhuma delas executa aritmética financeira, conversão cambial ou reconstrução de série.


## Valor livre para gastar (#618)

Quando `horizonDays=30`, a resposta inclui também `freeToSpend`, derivado **exclusivamente** de `referenceDate`, `openingBalanceMinor` e dos 30 `closingBalanceMinor` já produzidos pela projeção. A API não consulta novamente transações, faturas, recorrências, orçamento, limite de crédito ou qualquer agenda paralela para calcular o indicador.

Para cada moeda disponível:

```text
minimumProjectedBalanceMinor = min(openingBalanceMinor, todos os 30 closingBalanceMinor)
freeToSpendMinor = max(0, minimumProjectedBalanceMinor)
projectedDeficitMinor = max(0, -minimumProjectedBalanceMinor)
```

`minimumBalanceOn` identifica a primeira ocorrência temporal do mínimo. A posição inicial participa como posição zero; portanto, em empate entre o saldo da `referenceDate` e um dia futuro, a data-base vence.

O bloco por moeda usa `status=available|unavailable`:

- `available`: publica `minimumProjectedBalanceMinor`, `minimumBalanceOn`, `freeToSpendMinor`, `projectedDeficitMinor` e `limitingPoint`;
- `unavailable`: informa `reason=projection-unavailable|projection-incomplete` e **não** publica números sintéticos.

`limitingPoint` reutiliza o próprio ponto/evidência da série de #617. Quando o mínimo é o saldo inicial, sua posição é `opening` e não há movimentos associados; quando ocorre em um dia futuro, a evidência é exatamente `movements[]` daquele ponto.

O indicador não desconta orçamento não materializado, não adiciona limite de cartão/cheque especial, não cria reserva implícita e não converte moedas. Transferências cross-currency afetam cada moeda somente pelos efeitos já presentes em sua própria série.

Para `horizonDays=60|90`, `freeToSpend` não é publicado: o contrato da #618 permanece fixo em 30 dias.
