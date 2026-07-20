# Visibilidade de lançamentos importados no Extrato

## Contrato

A aprovação de uma linha CSV cria ou vincula uma única `Transaction` canônica. O Extrato, o Dashboard e os relatórios continuam lendo essa mesma tabela; não existe projeção financeira paralela para importações.

Para um novo lançamento importado:

- `source` é `IMPORT`;
- `status` é `POSTED`;
- `Transaction.aiSuggestionId` identifica a linha aprovada;
- `Transaction.importBatchId` identifica o lote;
- `AiSuggestion.targetEntityId` aponta para a transação criada;
- `occurredOn`, `plannedOn` e `effectiveOn` recebem a data final revisada da linha;
- conta, perfil financeiro e organização permanecem no mesmo escopo do lote.

A consulta usada por `/lancamentos` solicita `/api/transactions` com `status=all`, `accountId` e `occurredTo`. A data visual é `effectiveOn ?? plannedOn ?? occurredOn`.

## Causa raiz da falha observada

A falha não estava na criação da `Transaction`. A migration da funcionalidade de agrupamento adicionou `Transaction.transactionGroupId`, e a consulta canônica do Extrato passou a selecionar essa coluna. Em ambientes de desenvolvimento com banco já existente, os comandos de inicialização não aplicavam migrations pendentes antes de iniciar API e web.

Nesse estado, a aprovação CSV concluía e persistia o lançamento, mas a leitura posterior de `/api/transactions` falhava ao consultar `transactionGroupId`. Como o Extrato não recebia nenhuma coleção de transações, o lançamento importado parecia ausente.

A correção de inicialização, incorporada nesta branch a partir da PR #512, executa `prisma migrate deploy` antes dos servidores de desenvolvimento. O contrato de startup protege essa ordem.

## Proteção de consistência

Além da correção ambiental, um serviço de aplicação valida criação ou reabertura do lote, aprovação individual, aprovação em lote e releitura. A API rejeita como inconsistente uma sugestão `APPROVED` quando:

- nenhuma transação do mesmo tenant e perfil está vinculada; ou
- `targetEntityId` não corresponde à transação retornada.

O erro controlado é `IMPORT_APPROVED_TRANSACTION_MISSING` com HTTP 409. A API não cria automaticamente outra movimentação nesse cenário, preservando idempotência e permitindo investigação segura.

A aprovação continua atômica. Se falhar a inserção da transação, o registro de auditoria ou a atualização da sugestão, a transação inteira é revertida: não permanecem movimentação, aprovação nem auditoria parcial.

## Cobertura de regressão

Os testes automatizados cobrem:

- aprovação individual e em lote;
- `source=import`, `status=posted` e vínculos por lote e sugestão;
- consulta de `/api/transactions` pela conta e fim do mês;
- presença exata de uma linha por aprovação;
- coerência entre as três datas e a data visual do Extrato;
- saldo anterior, movimentos, saldo final e resumo;
- projeção de grupos sem ocultar importações não agrupadas;
- repetição sequencial, chamadas concorrentes já cobertas pelo ciclo de importação e releitura após possível timeout;
- isolamento por perfil financeiro;
- estado aprovado sem transação como erro controlado;
- rollback forçado nos pontos de inserção da transação, auditoria e atualização da sugestão.

## Diagnóstico histórico seguro

A consulta abaixo é somente leitura e identifica sugestões de importação aprovadas sem transação correspondente no mesmo tenant e perfil:

```sql
select
  s."organizationId",
  s."financialProfileId",
  s."sourceEntityId" as "importBatchId",
  s."id" as "suggestionId",
  s."targetEntityId",
  s."reviewedAt"
from "AiSuggestion" s
left join "Transaction" t
  on t."organizationId" = s."organizationId"
 and t."financialProfileId" = s."financialProfileId"
 and (t."id" = s."targetEntityId" or t."aiSuggestionId" = s."id")
where s."kind" = 'TRANSACTION_EXTRACTION'
  and s."status" = 'APPROVED'
  and t."id" is null
order by s."reviewedAt" asc;
```

A base de integração cria uma inconsistência controlada, confirma que a consulta a detecta e remove a fixture ao final. Não houve acesso à base de produção durante esta implementação; portanto, a quantidade histórica de produção deve ser obtida executando a consulta acima no ambiente autorizado.

Caso existam registros, não executar inserção ou backfill manual. A recuperação deve ser tratada separadamente, após conferir logs de auditoria, payload final, idempotência por `aiSuggestionId` e possível transação já existente.
