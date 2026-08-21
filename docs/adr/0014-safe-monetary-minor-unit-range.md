# ADR 0014 — Faixa segura para valores monetários em minor units

## Status

Aceito.

## Contexto

O SolverFin representa dinheiro como um inteiro em `minor units` acompanhado pela moeda. Até a Issue #599, os nove campos monetários persistidos no PostgreSQL eram `INTEGER`/Prisma `Int`, limitando cada valor a `-2.147.483.648..2.147.483.647` minor units.

Esse limite é menor do que a faixa exata já suportada pelo runtime JavaScript e é insuficiente como contrato de longo prazo para saldos, limites, movimentos e agregações. Ao mesmo tempo, usar `bigint` nativo em objetos expostos pela API quebraria a serialização JSON padrão, e converter `BIGINT` ou agregações com `Number(...)` sem validação poderia perder precisão silenciosamente.

A decisão deve continuar compatível com o ADR 0013: valores continuam sempre associados à moeda nativa e não é permitido somar moedas diferentes.

## Decisão

### Persistência

Os seguintes campos passam de PostgreSQL `INTEGER` para `BIGINT` e de Prisma `Int` para `BigInt @db.BigInt`:

- `Account.openingBalanceMinor`;
- `Card.creditLimitMinor`;
- `CardInstrument.creditLimitMinor`;
- `Transaction.amountMinor`;
- `Recurrence.amountMinor`;
- `Installment.amountMinor`;
- `Invoice.totalAmountMinor`;
- `Budget.plannedAmountMinor`;
- `PayableReceivable.amountMinor`.

A migration usa apenas conversão exata `::bigint`. Não há mudança de escala, arredondamento, sinal ou moeda e, portanto, todos os valores `INTEGER` existentes são preservados exatamente.

### Contrato de domínio, TypeScript e JSON

O contrato público permanece `number` em minor units para preservar compatibilidade das APIs e da UI. Porém, todo valor monetário que atravesse a fronteira pública deve pertencer à faixa de inteiros exatos do JavaScript:

- mínimo suportado: `-9.007.199.254.740.991` minor units (`Number.MIN_SAFE_INTEGER`);
- máximo suportado: `9.007.199.254.740.991` minor units (`Number.MAX_SAFE_INTEGER`).

Para moedas com duas casas decimais, o teto positivo equivale a `90.071.992.547.409,91` unidades monetárias. A regra normativa continua sendo expressa em minor units, sem assumir que toda moeda possua duas casas decimais.

O PostgreSQL `BIGINT` possui uma faixa física maior (`-9.223.372.036.854.775.808..9.223.372.036.854.775.807`), mas a parte além dos inteiros seguros do JavaScript **não faz parte do contrato suportado pelo SolverFin**. A API deve falhar explicitamente se encontrar um valor fora da faixa suportada; não deve arredondar, truncar ou serializar um valor inexato.

### Fronteira `pg`

O `node-postgres` retorna `BIGINT` como texto por padrão. A conexão do SolverFin registra um parser explícito para OID `20` (`int8`) que:

1. valida o texto como inteiro exato;
2. compara com a faixa segura suportada;
3. somente então converte para `number`;
4. lança erro de faixa quando a conversão exata não é possível.

Isso mantém os tipos usados atualmente pelos repositórios sem introduzir coerção silenciosa.

### Agregações

`SUM(BIGINT)` no PostgreSQL retorna `NUMERIC`. Agregações monetárias que voltam à API devem ser materializadas como representação exata (por exemplo, `::text`) e convertidas com o mesmo guard de faixa. A soma no runtime deve verificar também o **resultado agregado**, pois vários valores individualmente seguros podem produzir um total fora da faixa JSON segura.

A regra de moeda do ADR 0013 continua obrigatória antes da soma: ampliar a faixa numérica não autoriza agregação entre moedas diferentes.

## Compatibilidade e rollout

A migration é um widening de tipo e preserva integralmente os dados existentes. Não existe backfill ou transformação de valor.

A mudança do OID retornado pelo PostgreSQL (`int4` → `int8`) significa que versões antigas da API, sem o parser seguro, podem receber strings depois da migration. Portanto, o rollout deve impedir tráfego simultâneo de versões antigas após a alteração de schema: drenar/encerrar instâncias antigas antes de liberar a nova versão para tráfego quando o ambiente permitir overlap de versões.

O comando de deploy já aplica migrations antes de iniciar a nova API (`db:deploy` no `prestart`). Em ambientes com múltiplas instâncias ou rolling deploy, a operação deve ser coordenada para evitar uma janela mixed-version.

## Alternativas consideradas

### Manter `INTEGER`

Rejeitado porque preserva o limite estrutural de 32 bits que motivou a Issue #599.

### Expor `bigint` nativo em TypeScript/JSON

Rejeitado nesta fase. `JSON.stringify` não serializa `bigint` nativamente e uma mudança para strings em todos os contratos seria uma breaking change ampla para API, web e integrações.

### Usar `Decimal`/`NUMERIC` para valores inteiros em minor units

Não escolhido. O domínio já trabalha com inteiros em minor units e não precisa de escala decimal para esses campos. `BIGINT` preserva esse modelo de forma direta; taxas de câmbio e outros decimais continuam sendo contratos distintos.

### Usar ponto flutuante

Rejeitado. Dinheiro não deve depender de ponto flutuante binário para persistência ou cálculo determinístico.

## Consequências

- valores individuais persistidos deixam de estar presos ao teto de 32 bits;
- o limite normativo passa a ser a faixa de inteiros seguros do JSON/JavaScript;
- leituras `BIGINT` e agregações devem falhar fechadas fora dessa faixa;
- interfaces TypeScript podem continuar usando `number` sem perda de precisão dentro do contrato;
- futuras necessidades acima de `Number.MAX_SAFE_INTEGER` exigirão um novo ADR e uma mudança versionada do contrato externo, provavelmente para strings inteiras ou outro envelope serializável sem perda;
- qualquer nova coluna monetária persistida deve seguir esta decisão e o ADR 0013.

## Verificação

A entrega da Issue #599 deve provar:

- todos os nove campos persistidos como `BIGINT`;
- leitura de valor acima de `2.147.483.647` sem perda;
- round-trip do limite JSON seguro;
- rejeição explícita acima/abaixo do limite seguro;
- agregação grande ainda dentro da faixa com resultado exato;
- rejeição de agregação que ultrapasse a faixa suportada.

## Referências

- Issue #599;
- Issue #589;
- ADR 0013 — agregação financeira multi-moeda;
- `prisma/schema.prisma`;
- `packages/domain/src/money.ts`;
- `apps/api/src/db-safe-integer.ts`.
