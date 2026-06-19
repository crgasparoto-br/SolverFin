# Contas a pagar e a receber

## Status

O backend possui contrato MVP para contas a pagar e a receber com persistencia PostgreSQL, isolamento por organizacao/perfil financeiro e auditoria de mudancas financeiras relevantes.

A interface web completa ainda nao esta implementada na `main`. A rota `/pagar-receber` aparece na navegacao autenticada e nas rotas conhecidas do servidor web, mas `apps/web/src/dev-server/pages.ts` ainda nao despacha essa rota para uma tela propria; no estado atual ela renderiza o estado de preparacao do MVP.

## Modelo

Contas a pagar e a receber usam o mesmo recurso persistente `PayableReceivable`.

Campos principais:

- `kind`: `payable` para conta a pagar ou `receivable` para conta a receber.
- `status`: `pending`, `settled` ou `cancelled`.
- `amountMinor`: valor em unidade menor da moeda.
- `currency`: moeda ISO 4217, com `BRL` como padrao.
- `dueOn`: data de vencimento.
- `description`: descricao curta e segura.
- `accountId`: conta financeira vinculada, quando aplicavel.
- `categoryId`: categoria vinculada, quando aplicavel.
- `settlementTransactionId`: lancamento criado ou associado ao concluir.
- `settledAt`: data/hora da conclusao.
- `cancelledAt`: data/hora do cancelamento.

Todos os registros carregam `organizationId` e `financialProfileId`.

## Endpoints

Todos os endpoints exigem sessao autenticada e respeitam `profileId` quando informado na query string.

### Listar

```http
GET /api/payables-receivables
```

Filtros opcionais:

- `kind=payable|receivable`
- `status=pending|settled|cancelled|all`
- `accountId=<uuid>`
- `categoryId=<uuid>`
- `dueFrom=YYYY-MM-DD`
- `dueTo=YYYY-MM-DD`

Resposta:

```json
{
  "payablesReceivables": []
}
```

### Criar

```http
POST /api/payables-receivables
```

Payload:

```json
{
  "kind": "payable",
  "amountMinor": 12500,
  "dueOn": "2026-06-25",
  "description": "Fornecedor ficticio",
  "accountId": "uuid-opcional",
  "categoryId": "uuid-opcional",
  "currency": "BRL"
}
```

Resposta `201`:

```json
{
  "payableReceivable": {
    "status": "pending"
  }
}
```

### Obter detalhe

```http
GET /api/payables-receivables/:payableReceivableId
```

### Atualizar

```http
PATCH /api/payables-receivables/:payableReceivableId
```

Campos aceitos:

- `kind`
- `status`
- `amountMinor`
- `dueOn`
- `description`
- `currency`
- `accountId`
- `categoryId`

### Concluir pagamento ou recebimento

```http
POST /api/payables-receivables/:payableReceivableId/settle
```

Payload:

```json
{
  "settledOn": "2026-06-26",
  "accountId": "uuid-da-conta",
  "categoryId": "uuid-opcional",
  "description": "Pagamento ficticio",
  "existingTransactionId": "uuid-opcional"
}
```

Quando `existingTransactionId` nao e informado, a API cria um lancamento final:

- `expense` para `payable`;
- `income` para `receivable`.

Pagamentos parciais ainda nao sao suportados no MVP.

### Cancelar

```http
POST /api/payables-receivables/:payableReceivableId/cancel
```

Cancelamento e a exclusao logica do MVP para este dominio. Nao ha exclusao fisica, arquivamento separado ou restauracao/reativacao neste contrato inicial.

## Web

No estado atual da `main`, a web ainda nao oferece manutencao operacional para contas a pagar/receber.

Estado verificado:

- `/pagar-receber` existe na navegacao autenticada;
- `/pagar-receber` esta listado em `implementedRoutes`;
- a renderizacao de paginas privadas ainda nao chama uma pagina propria para `/pagar-receber`;
- a rota exibe o estado generico de preparacao do MVP;
- nenhuma lista, formulario ou acao de concluir/cancelar esta disponivel na web atual.

A tela web pendente deve consumir os endpoints acima para oferecer:

- resumo de pendentes, a pagar, a receber e concluidas;
- listagem por status `pending`, `settled` e `cancelled`;
- cadastro de conta a pagar ou receber;
- edicao apenas de itens pendentes;
- conclusao com confirmacao simples, gerando ou associando lancamento conforme o backend;
- cancelamento com confirmacao simples;
- mensagens de estado vazio, sucesso e erro sem detalhes tecnicos.

Itens concluidos e cancelados devem permanecer em modo consulta para preservar o contrato atual. A UI nao deve mostrar archive, restore nem exclusao fisica enquanto essas operacoes nao existirem neste contrato.

## Regras de tenant e auditoria

- Toda consulta filtra por `organizationId` e `financialProfileId`.
- Tentativas de acesso cruzado retornam erro controlado.
- Criacao, edicao, conclusao e cancelamento registram auditoria com mudancas redigidas.
- Dados financeiros nao devem aparecer completos em logs, fixtures ou mensagens de erro.
