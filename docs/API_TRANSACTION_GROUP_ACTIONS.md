# Ações de agrupamento no Extrato

Os agrupamentos do Extrato são projeções de apresentação. Eles não criam um novo movimento financeiro: saldo, Dashboard, relatórios e orçamentos continuam usando os lançamentos membros.

Todas as rotas exigem autenticação e usam o perfil financeiro ativo. Recursos fora do tenant retornam `404 TENANT_RESOURCE_NOT_FOUND`.

## Editar um lançamento do grupo

```http
PATCH /api/transaction-groups/:groupId/members/:memberId
```

Campos aceitos:

```json
{
  "description": "Descrição revisada",
  "date": "2026-07-20",
  "amountMinor": 1317623,
  "categoryId": "uuid-ou-null"
}
```

Conta, tipo, moeda e situação não podem ser alterados por esta rota, pois são propriedades de compatibilidade do grupo. O total do agrupamento é recalculado a partir dos membros persistidos.

## Clonar um lançamento

```http
POST /api/transaction-groups/:groupId/members/:memberId/clone
```

Cria um lançamento independente, sem `transactionGroupId`, recorrência, parcela ou proveniência de importação. O clone recebe fonte `manual`; lançamentos efetivados ou conciliados são clonados como `posted`, e lançamentos previstos permanecem `planned`.

## Excluir um lançamento

```http
POST /api/transaction-groups/:groupId/members/:memberId/void
```

Executa exclusão lógica apenas do membro selecionado. Quando resta um único membro, o agrupamento é desfeito automaticamente e o lançamento remanescente volta a ser exibido individualmente.

## Conciliar ou desconciliar todos os membros

```http
PATCH /api/transaction-groups/:groupId/status
```

```json
{ "status": "reconciled" }
```

ou

```json
{ "status": "posted" }
```

A alteração é atômica. A conciliação exige que todos os membros estejam efetivados.

## Clonar todos os membros

```http
POST /api/transaction-groups/:groupId/clone
```

Cria clones independentes de todos os membros em uma única transação de banco. O grupo original permanece inalterado.

## Excluir o grupo e os lançamentos

```http
POST /api/transaction-groups/:groupId/void
```

Executa exclusão lógica de todos os membros e remove o agrupamento de apresentação. Esta operação é diferente de:

```http
DELETE /api/transaction-groups/:groupId
```

O `DELETE` apenas desagrupa e preserva os lançamentos.

## Auditoria e consistência

- valores são tratados em `amountMinor`;
- ações em lote usam transação de banco;
- logs registram somente metadados redigidos, sem valores ou descrições financeiras;
- clones não carregam vínculos de agrupamento ou proveniência;
- nenhuma ação cria dupla contagem financeira.
