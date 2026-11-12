# Ações de agrupamento no Extrato

Os agrupamentos do Extrato são projeções de apresentação. Eles não criam um novo movimento financeiro: saldo, Dashboard, relatórios e orçamentos continuam usando os lançamentos membros.

Todas as rotas exigem autenticação e usam o perfil financeiro ativo. Recursos fora do tenant retornam `404 TENANT_RESOURCE_NOT_FOUND`.

## Parcelas canônicas e agrupamento

Lançamentos vinculados a `Installment` por `Transaction.installmentId` não são elegíveis para novos agrupamentos. O marcador da linha permanece disponível para as ações operacionais em massa; quando uma parcela canônica está selecionada, somente **Unificar lançamentos** fica desabilitado e orienta o usuário a desmarcá-la. Uma tentativa direta pela API retorna `409 TRANSACTION_GROUP_INSTALLMENT_MEMBER_INELIGIBLE` sem alterar o lançamento, a parcela, o grupo ou a auditoria.

Agrupamentos legados que já contenham uma parcela preservam o indicador **Parcela X de Y** na linha consolidada e mostram orientação para desagrupar. Enquanto o vínculo existir, ações de edição, clonagem, conciliação, desconciliação ou exclusão do grupo e de seus membros retornam o mesmo erro controlado. O contrato `DELETE /api/transaction-groups/:groupId` permanece disponível para desagrupar sem alterar os lançamentos; depois disso, a parcela volta ao fluxo conservador de manutenção documentado em [`API_INSTALLMENTS.md`](./API_INSTALLMENTS.md).

Essa restrição impede que valor, vencimento, situação ou exclusão de uma parcela canônica sejam alterados por um contrato de agrupamento mais amplo que o contrato direto da parcela.

## Editar um lançamento do grupo

```http
PATCH /api/transaction-groups/:groupId/members/:memberId
```

Campos aceitos:

```json
{
  "description": "Descrição revisada",
  "date": "2026-07-20",
  "plannedOn": "2026-07-25",
  "effectiveOn": "2026-07-28",
  "amountMinor": 1317623,
  "categoryId": "uuid-ou-null"
}
```

`plannedOn` e `effectiveOn` preservam as semânticas independentes definidas em [`TRANSACTION_DATES.md`](./TRANSACTION_DATES.md): alterar apenas `plannedOn` não modifica `occurredOn` nem `effectiveOn`, e alterar apenas `effectiveOn` não modifica `occurredOn` nem `plannedOn`. `occurredOn` não é editável por esta rota, pois a manutenção de agrupamento não pode mover silenciosamente o período econômico de um lançamento realizado.

O campo legado `date` continua aceito para o formulário de agrupamento, mas é **status-aware**, não um alias universal: em membro `planned` ele altera somente `plannedOn`; em membro `posted`/`reconciled` ele altera somente `effectiveOn`. Quando o cliente envia os campos explícitos, eles têm precedência sobre esse fallback. Conta, tipo, moeda e situação não podem ser alterados por esta rota, pois são propriedades de compatibilidade do grupo. O total do agrupamento é recalculado a partir dos membros persistidos. Essa manutenção se aplica somente a lançamentos sem vínculo canônico de parcela.

Após uma edição persistida, o modal, a linha consolidada e os saldos posteriores do Extrato são atualizados imediatamente com o delta do novo valor, sem manter a projeção anterior até um recarregamento da página.

## Clonar um lançamento

```http
POST /api/transaction-groups/:groupId/members/:memberId/clone
```

Cria um lançamento independente, sem `transactionGroupId`, recorrência, parcela ou proveniência de importação. O clone recebe fonte `manual`; lançamentos efetivados ou conciliados são clonados como `posted`, e lançamentos previstos permanecem `planned`.

Na interface, a ação por linha reutiliza o formulário padrão de novo lançamento, preenchido com os dados do membro, para permitir revisão antes de salvar. A descrição sugerida, incluindo o prefixo `Cópia de`, é limitada a 240 caracteres. Sem uma nova data informada, a clonagem preserva separadamente `occurredOn`, `plannedOn` e `effectiveOn` do membro de origem; quando o formulário legado envia `date`, essa data representa explicitamente os fatos temporais do novo clone e não reescreve o membro original.

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
- parcelas canônicas são recusadas antes de qualquer mutação de agrupamento;
- agrupamentos legados com parcelas permanecem somente desagrupáveis;
- nenhuma ação cria dupla contagem financeira;
- ações por teclado preservam o foco entre o Extrato, o modal do grupo e o formulário reutilizado.
