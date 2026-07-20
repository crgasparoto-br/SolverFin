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

Na aprovação em lote, uma inconsistência é reportada no item afetado sem ocultar nem reverter aprovações válidas concluídas anteriormente no mesmo pedido.

A aprovação continua atômica. Se falhar a inserção da transação, o registro de auditoria ou a atualização da sugestão, a transação inteira é revertida: não permanecem movimentação, aprovação nem auditoria parcial.

## Cobertura de regressão

Os testes automatizados cobrem:

- aprovação individual e em lote;
- `source=import`, `status=posted` e vínculos por lote e sugestão;
- correção manual de conta, data, categoria, tipo, valor e descrição antes da aprovação;
- consulta de `/api/transactions` pela conta e fim do mês;
- presença exata de uma linha por aprovação;
- coerência entre as três datas e a data visual do Extrato;
- saldo anterior, movimentos, saldo final e resumo;
- projeção de grupos sem ocultar importações não agrupadas;
- repetição sequencial, chamadas concorrentes já cobertas pelo ciclo de importação e releitura após possível timeout;
- isolamento por perfil financeiro;
- estado aprovado sem transação como erro controlado;
- `targetEntityId` nulo, inexistente ou conflitante com a transação ligada por `aiSuggestionId`;
- sucesso parcial no lote quando outro item está inconsistente;
- rollback forçado nos pontos de inserção da transação, auditoria e atualização da sugestão.

## Diagnóstico histórico seguro

A consulta abaixo é somente leitura e identifica sugestões de importação aprovadas cujo vínculo canônico está incompleto ou conflitante. Uma conciliação válida continua aceita quando `targetEntityId` aponta para a transação existente, mesmo que essa transação não tenha `aiSuggestionId` da sugestão de origem.

```sql
select
  s."organizationId",
  s."financialProfileId",
  s."sourceEntityId" as "importBatchId",
  s."id" as "suggestionId",
  s."targetEntityId",
  target."id" as "targetTransactionId",
  linked."id" as "suggestionLinkedTransactionId",
  s."reviewedAt"
from "AiSuggestion" s
left join "Transaction" target
  on target."organizationId" = s."organizationId"
 and target."financialProfileId" = s."financialProfileId"
 and target."id" = s."targetEntityId"
left join "Transaction" linked
  on linked."organizationId" = s."organizationId"
 and linked."financialProfileId" = s."financialProfileId"
 and linked."aiSuggestionId" = s."id"
where s."kind" = 'TRANSACTION_EXTRACTION'
  and s."status" = 'APPROVED'
  and (
    s."targetEntityId" is null
    or target."id" is null
    or (linked."id" is not null and linked."id" <> target."id")
  )
order by s."reviewedAt" asc;
```

A base de integração cria vínculos nulo e conflitante, confirma que o diagnóstico detecta ambos e restaura integralmente as fixtures. Não houve acesso à base de produção durante esta implementação; portanto, a quantidade histórica de produção deve ser obtida executando o comando abaixo no ambiente autorizado.

Caso existam registros, não executar inserção ou backfill manual. A recuperação deve ser tratada separadamente, após conferir logs de auditoria, payload final, idempotência por `aiSuggestionId` e possível transação já existente.

## Regressão discriminante de schema pendente

A suíte de integração contém um cenário destrutivo restrito ao banco protegido de testes. O cenário aprova uma linha CSV, remove de forma controlada a migration de agrupamento, comprova que `/api/transactions` falha ao selecionar `transactionGroupId`, executa `npm run db:prepare` e confirma que a mesma transação volta a aparecer exatamente uma vez no Extrato. Esse teste falha na versão anterior, que não possuía o contrato `db:prepare` no startup.

## Navegação e timeout após commit

A Inbox usa uma única função para montar os links individuais e do lote. Conta e datas da `Transaction` persistida têm precedência sobre o payload revisado. O mês segue exatamente `effectiveOn ?? plannedOn ?? occurredOn`, igual ao `statementDate` do Extrato.

A recuperação após timeout é testada descartando deliberadamente uma resposta de aprovação já confirmada pelo servidor. A releitura do lote recupera a transação persistida; o retry retorna a mesma transação como idempotente e a consulta do Extrato mantém uma única ocorrência.

## Diagnóstico operacional somente leitura

Execute no ambiente autorizado:

```bash
npm run diagnose:import-statement-consistency -- --json
```

O comando retorna somente a quantidade de sugestões de importação aprovadas com vínculo canônico inconsistente. Ele não lista dados financeiros e não executa correção ou backfill. No CI, `--expect-zero` bloqueia a entrega quando a base efêmera termina com inconsistências.
