# API de consulta e manutencao de parcelas

## Objetivo

Este contrato adiciona uma leitura historica, atual e futura de parcelas para as telas existentes do SolverFin. Ele nao cria uma rota web dedicada de Parcelas; a web deve consumir esses dados dentro de `/lancamentos`, `/cartoes` e `/relatorios`.

A manutencao direta continua controlada pelo backend e limitada a campos seguros da transacao vinculada. O cliente nao pode alterar fatura, cartao agrupador, instrumento, valor, vencimento, tenant ou perfil financeiro por esta rota.

## Endpoints

```http
GET /api/installments
PATCH /api/installments/:installmentId
```

As rotas usam a sessao autenticada e resolvem `organizationId` e `financialProfileId` no servidor. O cliente nao deve enviar esses campos como autoridade de escopo. Quando houver mais de um perfil ativo, o filtro `profileId` segue o contrato atual de tenant.

## Filtros de consulta

Todos os filtros sao opcionais:

```text
installmentId
transactionId
accountId
recurrenceId
cardId
cardInstrumentId
invoiceId
categoryId
dueFrom
dueTo
operationalFrom
operationalTo
status
profileId
```

`dueFrom`, `dueTo`, `operationalFrom` e `operationalTo` usam `YYYY-MM-DD` e precisam representar uma data real do calendario. `status` aceita `planned`, `posted`, `reconciled`, `cancelled` ou `all`.

`accountId` filtra parcelas pela transacao vinculada a uma conta. No Extrato, `operationalFrom` e `operationalTo` acompanham a mesma precedencia de data exibida pela linha (`effectiveOn`, `plannedOn`, `occurredOn` e `dueOn` como fallback), inclusive quando a efetivacao ocorreu em mes diferente do vencimento.

Periodo invertido, data inexistente como `2026-02-31`, formato invalido ou status desconhecido retornam erro controlado `400 INSTALLMENTS_FILTER_INVALID`.

## Resposta de consulta

```json
{
  "installments": [
    {
      "id": "installment-demo",
      "financialProfileId": "profile-demo",
      "status": "planned",
      "sequenceNumber": 2,
      "totalInstallments": 6,
      "dueOn": "2026-08-05",
      "amountMinor": 12345,
      "currency": "BRL",
      "transaction": {
        "id": "transaction-demo",
        "status": "planned",
        "accountId": "account-demo",
        "categoryId": "category-demo",
        "plannedOn": "2026-08-05",
        "description": "Assinatura ficticia"
      },
      "recurrence": {
        "id": "recurrence-demo",
        "status": "active",
        "frequency": "monthly",
        "interval": 1,
        "description": "Assinatura ficticia"
      },
      "category": {
        "id": "category-demo",
        "name": "Categoria ficticia",
        "kind": "expense",
        "status": "active"
      },
      "editable": true
    }
  ]
}
```

Vinculos opcionais ausentes sao omitidos. Isso permite renderizar historico parcial sem quebrar as telas quando uma parcela antiga nao tiver categoria, fatura, cartao, instrumento ou transacao carregavel.

## Elegibilidade de manutencao

Cada item informa `editable` e, quando bloqueado, `editBlockedReason`.

Razoes iniciais:

```text
linked_transaction_missing
installment_status_locked
transaction_status_locked
invoice_linked
```

Parcelas ligadas a fatura, transacao postada/conciliada/cancelada, parcela nao planejada ou sem transacao vinculada nao devem exibir acao de edicao direta. Quando existe `invoiceId`, `invoice_linked` prevalece sobre os bloqueios genericos de situacao porque a manutencao deve ser explicada pelo contrato operacional da compra da fatura. O backend revalida a mesma elegibilidade durante o `PATCH` para cobrir mudancas de estado entre consulta e salvamento.

## PATCH /api/installments/:installmentId

Payload permitido:

```json
{
  "description": "Assinatura ficticia ajustada",
  "note": "Observacao ficticia opcional",
  "categoryId": "category-demo"
}
```

Todos os campos sao opcionais, mas o payload deve trazer pelo menos um deles. `note` pode ser `null` para limpar a observacao. Campos fora da allowlist retornam `400 INSTALLMENT_PAYLOAD_INVALID`.

A mutacao atualiza a transacao vinculada de forma atomica pelo fluxo existente de transacao, sincroniza a parcela quando necessario e grava auditoria minimizada/redigida da mutacao financeira. A resposta retorna a parcela recarregada:

```json
{
  "installment": {
    "id": "installment-demo",
    "status": "planned",
    "transaction": {
      "id": "transaction-demo",
      "description": "Assinatura ficticia ajustada",
      "categoryId": "category-demo"
    },
    "editable": true
  }
}
```

Bloqueios de elegibilidade retornam `409 INSTALLMENT_EDIT_BLOCKED`. A leitura de elegibilidade, o bloqueio das linhas de `Transaction`/`Installment`, a atualizacao e a auditoria ocorrem na mesma transacao de banco para impedir alteracao depois de uma mudanca concorrente de estado. Recurso inexistente ou fora do tenant/profile ativo retorna o comportamento padrao de recurso nao encontrado.

A conciliacao e a desconciliacao continuam disponiveis pelo payload exclusivo de situacao do endpoint operacional de transacoes. Uma protecao de persistencia preserva `description`, `note` e `categoryId` da versao mais recente quando uma conciliacao que leu um snapshot anterior retoma depois de um `PATCH` de parcela. Assim, as duas operacoes podem concluir sem que a conciliacao restaure silenciosamente os valores antigos da parcela.

## Exclusao logica e historico

A exclusao fisica de parcelas continua proibida. A exclusao logica da transacao vinculada permanece uma transicao operacional permitida pelos contratos existentes:

```http
POST /api/transactions/:transactionId/void
POST /api/transactions/bulk-actions
```

Na acao em massa, o contrato usa `action: "void"`. O resultado esperado e:

- a `Transaction` passa para `voided`;
- a `Installment` permanece persistida para rastreabilidade historica;
- a consulta da parcela continua retornando o vinculo com a transacao anulada;
- `editable` passa a `false` e `editBlockedReason` retorna `transaction_status_locked`;
- nenhuma rota permite exclusao fisica ou reutiliza o `PATCH` de parcela para alterar a situacao.

Essa decisao preserva a acao de exclusao logica ja existente no Extrato sem transformar o contrato conservador de manutencao em uma rota generica de mudanca de estado.

## Tenant e privacidade

- Listagens e mutacoes filtram apenas dados do contexto ativo.
- Acesso por `profileId` fora do escopo do usuario segue o comportamento atual de tenant.
- A resposta evita payload financeiro completo de auditoria e retorna apenas os vinculos necessarios para exibicao operacional.
- Exemplos usam dados ficticios.

## Telas consumidoras

- `/lancamentos`: listar parcelas por `accountId`, periodo e vinculo com a transacao original de conta, exibindo manutencao apenas quando `editable` for verdadeiro.
- `/cartoes`: listar historico por cartao agrupador, instrumento, fatura, periodo e compra/recorrencia quando os vinculos existirem.
- `/relatorios`: usar a mesma leitura como base para visao consolidada somente leitura.

## Consumo nas listas operacionais

- `/lancamentos` executa no maximo uma consulta complementar por renderizacao, usando `accountId`, `operationalFrom`, `operationalTo`, `status=all` e o `profileId` ativo quando existir. Na visao mensal, o periodo cobre o mes selecionado; quando o filtro `day` estiver ativo, os dois limites usam exatamente o dia exibido. A associacao acontece por `installment.transaction.id` com a linha ja renderizada. Falha nessa consulta nao impede o carregamento do extrato.
- `/cartoes` executa no maximo uma consulta complementar usando o `invoiceId` selecionado e associa a parcela pela transacao da compra. Nao usar `cardId` isolado nesse fluxo, pois ele omite parcelas ja vinculadas a fatura.
- A interface mostra `Parcela X de Y` dentro da propria linha. Nao existe painel, rota ou linha paralela de parcelas.
- Uma parcela canonica nao e elegivel para novo agrupamento no Extrato. Seu marcador permanece disponivel para as acoes operacionais em massa de conciliar, desconciliar e excluir logicamente; quando uma parcela esta selecionada, somente **Unificar lancamentos** fica desabilitado e explica que a parcela precisa ser desmarcada. A API continua retornando `409 TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE` antes de qualquer mutacao de agrupamento. Agrupamentos legados preservam o indicador, ficam somente desagrupaveis e nao podem usar acoes do grupo como caminho alternativo para alterar valor, vencimento, situacao ou exclusao da parcela.
- `categoryId` aceita uma string valida ou `null`; `null` remove a categoria da transacao vinculada. String vazia continua invalida.
- A edicao direta de parcela de conta envia apenas os campos efetivamente alterados entre `description`, `note` e `categoryId`. Sem alteracao, o cliente nao envia `PATCH`. Categoria arquivada vinculada ao historico e preservada no formulario e so e removida quando o usuario escolhe explicitamente **Sem categoria**.
- Para `409 INSTALLMENT_EDIT_BLOCKED`, o modal permanece aberto, conserva os valores digitados e permite recarregar o estado atual. O endpoint generico `PATCH /api/transactions/:transactionId` retorna `409 INSTALLMENT_DIRECT_UPDATE_REQUIRED` para mutacoes de dados de uma transacao com `installmentId`; a unica excecao e o payload exclusivo de situacao usado pela acao operacional existente de conciliar ou desconciliar. A excecao valida o estado atual: `planned|posted -> reconciled` e `reconciled -> posted` sao permitidos; `planned -> posted`, payload combinado e qualquer outro status continuam bloqueados. Assim, indisponibilidade ou atraso da consulta complementar nao libera alteracao de valor, datas, conta, descricao, categoria ou outros campos fora do contrato da parcela.
- Parcelas com `invoice_linked` sao mantidas em leitura no contrato de parcelas; a edicao operacional continua exclusivamente no endpoint da compra da fatura.

## POST /api/installments - parcelamento manual canônico (#553)

O Extrato cria o conjunto com uma única requisição autenticada. O payload usa a allowlist `accountId`, `destinationAccountId`, `categoryId`, `kind`, `status`, `description`, `note`, `plannedOn`, `effectiveOn`, `amountMinor`, `amountMode`, `totalInstallments`, `initialSequenceNumber` e `idempotencyKey`.

A API deriva a moeda da conta de origem, valida tenant/perfil e cria todas as `Installment` e `Transaction` vinculadas na mesma transação PostgreSQL. `amountMode=per_installment` repete o valor; `amountMode=total` divide pelo total original e distribui o resto nas últimas sequências. A data mensal preserva o dia original ou o último dia válido do mês, voltando ao dia original quando possível.

Criação nova retorna `201`; replay da mesma chave e payload retorna `200`, os mesmos IDs e `idempotentReplay: true`. Reutilização da chave com outro payload retorna `409 INSTALLMENT_IDEMPOTENCY_CONFLICT`. Chave ausente ou inválida retorna `400 INSTALLMENT_IDEMPOTENCY_REQUIRED`; payload inválido retorna `400 INSTALLMENT_PAYLOAD_INVALID`. Rollback não deixa parcelas parciais nem consome a chave.
