# API de índices financeiros e remuneração de contas

Este documento descreve os contratos HTTP e operacionais implementados para a remuneração prevista de contas indexada ao CDI.

A regra funcional e as decisões de domínio permanecem em [`ACCOUNT_REMUNERATION_CDI.md`](./ACCOUNT_REMUNERATION_CDI.md) e no ADR [`0005-financial-indexes-shared-domain.md`](./adr/0005-financial-indexes-shared-domain.md).

## Fonte do CDI

- provider padrão: Banco Central do Brasil;
- série SGS: `12`;
- código interno: `CDI`;
- origem persistida: `BCB_SGS_12`;
- período enviado à fonte: `dataInicial` e `dataFinal`;
- formato esperado: lista JSON com `data` em `DD/MM/YYYY` e `valor` decimal;
- importação idempotente por `kind + referenceOn`.

O endpoint do provider pode ser sobrescrito por `BCB_SGS_CDI_URL` apenas para testes controlados ou migração de provider.

Quando já existe taxa CDI confirmada, qualquer importação normal começa obrigatoriamente no dia seguinte à maior `referenceOn` armazenada. O campo `startsOn` é utilizado apenas no primeiro carregamento, quando a base ainda está vazia. Assim, uma execução manual ou automática não pode pular lacunas por receber uma data inicial mais recente.

## Configuração por conta

A configuração de remuneração fica integrada à área **Contas e Cartões** (`/contas-cartoes`). Cada conta elegível possui uma ação secundária que abre um modal separado do formulário cadastral da conta. A antiga rota autenticada `/remuneracao-contas` redireciona para `/contas-cartoes` e não aparece mais na navegação.

A interface carrega configurações e categorias de receita independentemente da listagem de contas e cartões. Se esse carregamento falhar, somente as ações de CDI ficam indisponíveis e a página oferece nova tentativa; o restante da tela continua utilizável.

### `GET /api/account-remuneration/configurations`

Lista todas as contas ativas do perfil financeiro corrente e a configuração de remuneração associada.

Resposta resumida:

```json
{
  "configurations": [
    {
      "accountId": "uuid",
      "accountName": "Conta principal",
      "accountCurrency": "BRL",
      "enabled": true,
      "indexKind": "cdi",
      "remunerationPercent": 100,
      "startsOn": "2026-07-01",
      "categoryId": "uuid"
    }
  ]
}
```

### `PUT /api/account-remuneration/configurations/:accountId`

Cria ou atualiza a configuração da conta no perfil corrente. O modal envia apenas o contrato abaixo; campos cadastrais da conta não fazem parte desta requisição.

```json
{
  "enabled": true,
  "remunerationPercent": 100,
  "startsOn": "2026-07-01",
  "categoryId": "uuid opcional"
}
```

Regras:

- somente contas ativas e em `BRL` podem ser habilitadas;
- contas arquivadas não exibem ação que permita ativar ou editar CDI;
- contas fora de `BRL` informam que o recurso está disponível somente em reais;
- o indexador disponível nesta versão é o CDI;
- o percentual deve ser maior que zero e menor ou igual a `1000`;
- a data inicial e o percentual são obrigatórios quando `enabled=true`;
- a categoria, quando informada, deve ser uma categoria ativa de receita do mesmo tenant;
- alteração de percentual ou data inicial afeta apenas competências ainda não processadas;
- ao desativar com `enabled=false`, percentual, data inicial e categoria omitidos são preservados pelo banco; o modal também reenvia os valores carregados, permitindo futura reativação sem perda de configuração;
- contas existentes permanecem desativadas até configuração explícita;
- uma conta com CDI ativo não pode mudar de `BRL` para outra moeda nem ser arquivada antes da desativação da remuneração;
- ativação do CDI e mudança de moeda/status são serializadas por bloqueio da conta no banco, impedindo estado concorrente com CDI ativo em conta inelegível;
- erros de gravação mantêm o modal aberto, preservam os valores digitados e apresentam a mensagem localizada da API.

Quando não existe configuração persistida, o modal inicia desativado, com `100%`, data atual e categoria vazia. O texto de apoio informa que o cálculo usa o saldo final do dia anterior.

## Administração global

Os endpoints abaixo exigem usuário master configurado em `SOLVERFIN_MASTER_EMAILS`.

A área administrativa de índices financeiros permanece separada da configuração por conta.

### `GET /api/admin/financial-indexes/status`

Retorna:

- última taxa CDI confirmada;
- última importação;
- último processamento;
- quantidade de configurações ativas;
- quantidade de competências com taxa disponível ainda não processadas;
- quantidade de configurações já iniciadas sem qualquer taxa disponível;
- `pendingConfigurations`, mantido por compatibilidade, como soma das duas pendências anteriores.

Configurações cuja data inicial ainda está no futuro não são contabilizadas como pendência.
Na interface, competências pendentes e contas sem taxa são apresentadas separadamente para não
misturar unidades operacionais diferentes.

### `POST /api/admin/financial-indexes/cdi/import`

```json
{
  "startsOn": "2026-07-01",
  "endsOn": "2026-07-14"
}
```

Na primeira importação, `startsOn` define o início do carregamento. Depois disso, a API sempre consulta a partir do dia seguinte à última taxa armazenada até `endsOn`, ou até a data atual quando `endsOn` não for informado. Taxas já persistidas não são atualizadas nem duplicadas.

### `POST /api/admin/account-remunerations/process`

```json
{
  "processedOn": "2026-07-14"
}
```

O processamento:

1. adquire lock transacional para impedir duas execuções concorrentes;
2. seleciona configurações ativas e taxas confirmadas anteriores à data de processamento;
3. ignora competências que já possuem qualquer resultado registrado;
4. calcula o saldo final efetivo da conta até a competência;
5. aplica a taxa diária do CDI e o percentual configurado;
6. cria uma receita `PLANNED` com origem `ACCOUNT_REMUNERATION` quando o valor é positivo;
7. persiste saldo-base, taxa, percentual, valor original e resultado da competência em `AccountRemuneration`.

Resultados possíveis:

- `CREATED`: lançamento previsto criado;
- `SKIPPED_NON_POSITIVE_BALANCE`: saldo-base nulo ou negativo;
- `SKIPPED_ZERO_AMOUNT`: saldo positivo, mas rendimento arredondado para zero centavo.

Os resultados sem lançamento também são persistidos. Portanto, um lançamento retroativo incluído depois não recalcula nem transforma automaticamente uma competência antiga em rendimento.

## Execução automática

A API pode executar o ciclo diário quando:

```dotenv
ACCOUNT_REMUNERATION_DAILY_ENABLED=true
ACCOUNT_REMUNERATION_DAILY_HOUR_UTC=10
```

O ciclo automático:

- consulta a série CDI desde o dia seguinte à última taxa confirmada;
- importa apenas datas ausentes;
- processa competências pendentes;
- executa no máximo uma vez por data UTC em cada instância;
- usa idempotência de banco e lock transacional para proteger ambientes com mais de uma instância.

Em produção, prefira habilitar o scheduler em apenas uma instância da API.

## Ajuste manual e conciliação

O rendimento é um lançamento previsto conciliável pelo fluxo do extrato:

- o valor atual pode ser substituído pelo crédito efetivo do banco;
- categoria, situação de efetivação/conciliação e data efetiva podem ser ajustadas;
- conta, tipo, origem, moeda, data prevista e descrição técnica permanecem protegidos;
- o valor originalmente calculado permanece em `AccountRemuneration.originalAmountMinor`;
- alterações de `Transaction.amountMinor` marcam automaticamente `manuallyAdjusted`, `adjustedAt` e `adjustedByUserId` por trigger de banco;
- reprocessamentos não sobrescrevem o lançamento nem o ajuste manual;
- a ação de clonar é removida para lançamentos de remuneração no extrato.

As respostas de `GET /api/transactions` e `GET /api/transactions/:transactionId` incluem
`accountRemuneration` somente nos lançamentos dessa origem:

```json
{
  "accountRemuneration": {
    "indexKind": "cdi",
    "competenceOn": "2026-07-14",
    "processedOn": "2026-07-15",
    "balanceBaseMinor": 1000000,
    "dailyRatePercent": 0.055131,
    "remunerationPercent": 100,
    "appliedDailyRatePercent": 0.055131,
    "originalAmountMinor": 551,
    "manuallyAdjusted": true,
    "adjustedAt": "2026-07-15T12:00:00.000Z"
  }
}
```

O extrato usa esse contrato para apresentar competência, saldo-base, taxa diária, percentual,
valor original e o indicador `Ajustado manualmente`. A descrição textual continua preservada por
compatibilidade, mas não é mais a única fonte visual da memória do cálculo.

## Prisma

O schema utiliza o formato multifile. Os modelos de índices e remuneração ficam em `prisma/account-remuneration.prisma`, enquanto o schema principal permanece em `prisma/schema.prisma`. Os comandos Prisma do repositório usam `--schema ./prisma` para validar, gerar o client e aplicar migrations considerando todos os arquivos.

## Erros operacionais relevantes

- `ACCOUNT_REMUNERATION_ALREADY_RUNNING`: já existe processamento concorrente;
- `ACCOUNT_REMUNERATION_CONFIGURATION_INCOMPLETE`: percentual ou data inicial ausentes;
- `ACCOUNT_REMUNERATION_CURRENCY_UNSUPPORTED`: conta fora de BRL;
- `ACCOUNT_REMUNERATION_CATEGORY_INVALID`: categoria fora do tenant ou não classificada como receita;
- `ACCOUNT_REMUNERATION_MUST_BE_DISABLED`: tentativa de alterar moeda ou arquivar uma conta com CDI ativo;
- `FINANCIAL_INDEX_PROVIDER_UNAVAILABLE`: indisponibilidade ou resposta inválida da fonte oficial;
- `FINANCIAL_INDEX_PERIOD_INVALID`: período de importação inválido;
- proteção de banco rejeita alteração da identidade de um lançamento de remuneração.

Todas as importações e processamentos geram registro em `FinancialIndexOperation`, incluindo contagens, estado, mensagem e falhas.
