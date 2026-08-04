# Fila de revisão de sugestões

## Objetivo

A fila mantém sugestões de importação, regras, automações ou IA sob revisão humana. Nenhuma sugestão incerta produz efeito financeiro sem decisão explícita.

## Payload estruturado

`AiSuggestion.payload` segue o contrato comum descrito em `docs/AI_SUGGESTION_PAYLOADS.md`. O envelope discrimina `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`, registra versões, origem, alvo, confiança, motivos, auditoria e fingerprint.

A explicação é somente texto para o usuário. A fila não extrai data, valor, descrição, conta ou categoria de `explanation`. Sugestão de lançamento sem payload estruturado compatível retorna `AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED` antes de criar efeito financeiro.

Extrações novas usam `TransactionExtractionSuggestionPayloadV2`; V1 permanece legível. Quando uma sugestão V1 pendente recebe edição de tipo, ela migra para V2 preservando a direção derivada do payload anterior. Deduplicação e conciliação mantêm vínculo explícito com a sugestão e fingerprint de origem.

## API

```http
GET /api/ai-review-queue
GET /api/ai-review-queue/:suggestionId/payload
POST /api/ai-review-queue/:suggestionId/approve
POST /api/ai-review-queue/:suggestionId/edit
POST /api/ai-review-queue/:suggestionId/reject
```

Filtros de listagem: `kind`, `status`, `includeLowConfidence` e `profileId`.

A rota de payload retorna a projeção pública tipada. Provider, model, correlação interna, identificadores de entidades e dados brutos não são expostos. UUID é validado antes do primeiro acesso ao banco e a consulta usa organização e perfil financeiro.

Para sugestões de importação, `proposedTransaction` expõe `direction` e `otherAccountId` quando presentes. `destinationAccountId` permanece alias de compatibilidade da API geral. Campos fora do contrato editável não são aplicados silenciosamente.

## Transições

- `pending_review` → `pending_review` após correção de importação;
- `pending_review` → `edited` no fluxo geral sem efeito automático;
- `pending_review` → `approved` após decisão válida;
- `pending_review` → `rejected` após rejeição ou duplicidade;
- candidaturas determinísticas irmãs → `expired` quando outra decisão resolve a origem.

A decisão e a persistência são protegidas por transação e pelo contrato do banco. Uma segunda decisão concorrente recebe conflito determinístico. Payload de sugestão resolvida é imutável.

Sugestões dependentes de outra sugestão armazenam `sourceSuggestionId` e o fingerprint observado em `audit.sourceFingerprint`. Antes de concluir uma aprovação ou edição, o PostgreSQL consulta a origem sob lock compartilhado no mesmo `organizationId` e `financialProfileId`. Origem ausente ou fingerprint divergente retorna `AI_SUGGESTION_PAYLOAD_OBSOLETE`, preserva a sugestão como pendente e não produz efeito parcial. A rejeição permanece permitida para descartar a candidatura obsoleta.

Contas e categorias são carregadas novamente dentro da transação de aprovação. Referência ausente, de outro perfil ou arquivada retorna erro controlado e mantém a sugestão pendente.

## Legado

Payload estruturado legado compatível pode ser projetado para leitura ou encapsulado de forma conservadora quando ainda está pendente. O deploy não faz backfill amplo. Registro sem payload, texto livre ou versão incompatível permanece sem efeito automático e retorna erro controlado.

A suíte de diagnóstico de consistência pode fabricar estados históricos impossíveis por meio de um bypass restrito ao teste. Esse bypass desativa somente o trigger de imutabilidade durante a corrupção e a restauração da fixture; os caminhos produtivos nunca o utilizam.

## Segurança

Todas as consultas e mutações exigem o mesmo `organizationId` e `financialProfileId`. Auditoria registra revisor, data, ação, entidade e mudanças redigidas. CSV bruto, mensagens bancárias brutas, prompts, credenciais e respostas integrais de provider não são armazenados no payload.
