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

- `reconcile`: converte lançamentos `posted` em `reconciled` e preserva os que já estavam conciliados;
- `unreconcile`: converte lançamentos `reconciled` em `posted` e preserva os já efetivados;
- `void`: executa exclusão lógica dos lançamentos e remove os agrupamentos selecionados.

O servidor expande os grupos para seus membros dentro da mesma transação de banco, deduplica IDs e bloqueia a tentativa de alterar diretamente apenas um membro de grupo sem selecionar a linha agrupada.

## Regras de consistência

- conciliação e desconciliação aceitam somente lançamentos efetivados ou conciliados;
- lançamento previsto, sugerido ou excluído bloqueia a alteração de conciliação;
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
