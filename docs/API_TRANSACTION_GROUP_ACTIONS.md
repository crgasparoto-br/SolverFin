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

O formulário padrão de lançamentos também pode enviar `plannedOn` e `effectiveOn`; a API usa a data aplicável ao membro. Conta, tipo, moeda e situação não podem ser alterados por esta rota, pois são propriedades de compatibilidade do grupo. O total do agrupamento é recalculado a partir dos membros persistidos. Quando o membro está associado a uma parcela, vencimento e valor da `Installment` são sincronizados na mesma transação de banco.

Após uma edição persistida, o modal, a linha consolidada e os saldos posteriores do Extrato são atualizados imediatamente com o delta do novo valor, sem manter a projeção anterior até um recarregamento da página.

## Clonar um lançamento

```http
POST /api/transaction-groups/:groupId/members/:memberId/clone
```

Cria um lançamento independente, sem `transactionGroupId`, recorrência, parcela ou proveniência de importação. O clone recebe fonte `manual`; lançamentos efetivados ou conciliados são clonados como `posted`, e lançamentos previstos permanecem `planned`.

Na interface, a ação por linha reutiliza o formulário padrão de novo lançamento, preenchido com os dados do membro, para permitir revisão antes de salvar. A descrição sugerida, incluindo o prefixo `Cópia de`, é limitada a 240 caracteres.

## Excluir um lançamento

```http
POST /api/transaction-groups/:groupId/members/:memberId/void
```

Executa exclusão lógica apenas do membro selecionado. Quando resta um único membro, o agrupamento é desfeito automaticamente e o lançamento remanescente volta a ser exibido individualmente.

Quando o grupo permanece com dois ou mais membros, a quantidade, o valor consolidado e os saldos posteriores do Extrato são atualizados imediatamente a partir do grupo retornado pela API.

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

A alteração é atômica. A conciliação exige que todos os membros estejam efetivados. Para grupos previstos, a interface mantém a ação desabilitada e informa que os lançamentos precisam ser efetivados antes da conciliação. Após a operação, a situação da linha consolidada é atualizada junto com o modal.

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
- edição de membro mantém a parcela associada consistente;
- nenhuma ação cria dupla contagem financeira;
- ações por teclado preservam o foco entre o Extrato, o modal do grupo e o formulário reutilizado.
