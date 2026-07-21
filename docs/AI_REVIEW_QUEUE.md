# Fila de revisão de sugestões

## Objetivo

A fila mantém sugestões de importação, regras, automações ou IA sob revisão humana. Nenhuma sugestão incerta produz efeito financeiro sem uma decisão explícita.

## Payload estruturado

`AiSuggestion.payload` armazena somente dados normalizados e versionados. Para importação CSV, novas sugestões `transaction_extraction` usam `TransactionExtractionPayloadV2`, com linha de origem, hash, data, tipo revisado, direção original `inflow|outflow`, valor, moeda, descrição, conta de referência, outra conta para transferências, categoria e ID externo opcionais. V1 permanece legível. Quando uma sugestão V1 pendente recebe uma edição de tipo, ela migra para V2 preservando a direção derivada do payload anterior à edição; alterações posteriores não reinterpretam essa direção.

Deduplicação e conciliação usam `DeterministicReviewPayloadV1`, que referencia explicitamente:

- a sugestão de origem;
- o fingerprint do payload de origem;
- o lançamento candidato;
- motivos e conflitos.

A explicação é apenas texto para o usuário e nunca é usada para reconstruir valores financeiros.

## API geral

```http
GET /api/ai-review-queue
POST /api/ai-review-queue/:suggestionId/approve
POST /api/ai-review-queue/:suggestionId/edit
POST /api/ai-review-queue/:suggestionId/reject
```

Filtros de listagem: `kind`, `status`, `includeLowConfidence` e `profileId`.

Para sugestões de importação, `proposedTransaction` expõe `direction` e `otherAccountId` quando o payload V2 contiver esses campos. Na edição, `otherAccountId` é o nome canônico da contraparte da transferência; `destinationAccountId` permanece aceito como alias de compatibilidade da API geral. Os dois nomes não representam necessariamente a conta de destino contábil: a origem e o destino efetivos são calculados com `direction` e a conta de referência. Campos que não pertencem ao contrato editável da importação não são aplicados silenciosamente: uma requisição sem qualquer alteração suportada retorna erro controlado.

Sugestões de importação continuam compatíveis com a fila geral, mas suas mutações são delegadas ao ciclo transacional do lote:

- editar mantém `pending_review`;
- aprovar cria no máximo um lançamento ou concilia a linha com uma transferência existente e finaliza a sugestão atomicamente;
- rejeitar é idempotente;
- lote descartado bloqueia novas decisões.

Sugestões não associadas ao fluxo CSV preservam o contrato anterior da fila.

## Transições da importação

- `pending_review` → `pending_review` após correção;
- `pending_review` → `approved` após criação de lançamento ou conciliação;
- `pending_review` → `rejected` após rejeição ou decisão de duplicidade;
- candidaturas determinísticas irmãs → `expired` quando outra decisão resolve a origem.

Uma tentativa incompatível retorna erro controlado. Repetir a mesma decisão final retorna o resultado já persistido quando a operação é idempotente.

## Segurança

Todas as consultas e mutações exigem o mesmo `organizationId` e `financialProfileId`. Auditoria registra revisor, data, ação, entidade e mudanças redigidas. CSV bruto, mensagens bancárias brutas e prompts não são armazenados no payload.
