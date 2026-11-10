# Ações em massa no Extrato

A barra de seleção do Extrato aceita lançamentos simples e linhas agrupadas. Selecionar um agrupamento representa todos os seus membros; o grupo continua sendo apenas uma projeção de apresentação e não cria uma movimentação financeira adicional.

Todas as rotas exigem autenticação, usam o perfil financeiro ativo e retornam `404 TENANT_RESOURCE_NOT_FOUND` para recursos fora do tenant ou perfil.

## Executar ação em massa

```http
POST /api/transactions/bulk-actions
```

```json
{
  "action": "reconcile",
  "transactionIds": ["uuid-do-lancamento-simples"],
  "groupIds": ["uuid-do-agrupamento"]
}
```

A ação aceita:

- `reconcile`: converte lançamentos `planned` ou `posted` em `reconciled` e preserva os que já estavam conciliados;
- `unreconcile`: converte lançamentos `reconciled` em `posted` e preserva os `planned` e `posted` da seleção;
- `void`: executa exclusão lógica dos lançamentos e remove os agrupamentos selecionados.

O servidor expande os grupos para seus membros dentro da mesma transação de banco, deduplica IDs e bloqueia a tentativa de alterar diretamente apenas um membro de grupo sem selecionar a linha agrupada.

## Regras de consistência

- transferências simples em extrato de conta individual podem ser selecionadas para conciliar ou
  desconciliar, inclusive quando há câmbio: o registro canônico é atualizado uma única vez para
  origem e destino, sem modificar os valores ou as moedas das duas pernas;
- unificação de transferências continua proibida mesmo com a seleção habilitada;
- conciliação aceita lançamentos previstos, efetivados ou conciliados; desconciliação altera somente os conciliados e preserva os demais elegíveis;
- conciliar um previsto define `effectiveOn` como a data civil UTC da transição, como no domínio individual; um efetivado legado sem data efetiva usa `occurredOn`; `occurredOn` e `plannedOn` nunca são sobrescritos;
- sugestões pendentes e lançamentos excluídos bloqueiam a alteração de conciliação; compras de cartão/fatura e remuneração automática exigem seus fluxos próprios;
- a consulta de agrupamentos entrega `reconcileProtected` para o grupo e seus membros, calculado
  pelo vínculo de remuneração automática no perfil financeiro; a barra bloqueia
  conciliação/desconciliação quando qualquer membro é protegido, inclusive em grupos mistos; o
  servidor continua sendo a barreira obrigatória;
- seleção mista é idempotente: apenas os alvos aplicáveis são alterados, e os demais são retornados em `unchangedTransactionIds`;
- agrupamentos são temporariamente desanexados durante a mudança de situação e restaurados antes do commit;
- na exclusão, os membros são desanexados, marcados como `voided` e o agrupamento é removido;
- qualquer falha produz rollback completo;
- auditoria registra somente ação e quantidades redigidas, sem valores ou descrições financeiras;
- saldo, Dashboard, relatórios e orçamentos continuam usando os lançamentos canônicos sem dupla contagem.

## Resposta

```json
{
  "action": "reconcile",
  "affectedTransactionIds": ["uuid-alterado"],
  "unchangedTransactionIds": ["uuid-que-já-estava-conciliado"],
  "removedGroupIds": []
}
```
