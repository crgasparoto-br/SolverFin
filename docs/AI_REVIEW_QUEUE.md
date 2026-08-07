# Fila de revisão de sugestões

## Objetivo

A fila mantém sugestões de importação, regras, automações, aprendizado, histórico ou IA sob revisão humana. Nenhuma sugestão incerta produz efeito financeiro sem decisão explícita.

## Payload estruturado

`AiSuggestion.payload` segue o contrato comum descrito em `docs/AI_SUGGESTION_PAYLOADS.md`. O envelope discrimina `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` e `insight`, registra versões, origem, alvo, confiança, motivos, auditoria e fingerprint.

A explicação é somente texto para o usuário. A fila não extrai data, valor, descrição, conta ou categoria de `explanation`. Sugestão de lançamento sem payload estruturado compatível retorna `AI_REVIEW_SUGGESTION_PAYLOAD_UNSUPPORTED` antes de criar efeito financeiro.

Extrações novas usam `TransactionExtractionSuggestionPayloadV2`; V1 permanece legível. Quando uma sugestão V1 pendente recebe edição de tipo, ela migra para V2 preservando a direção derivada do payload anterior. Deduplicação e conciliação mantêm vínculo explícito com a sugestão e fingerprint de origem.

## Categorização inteligente

Sugestões `transaction_extraction` pendentes podem receber uma candidatura `categorization` V1 pela ordem:

1. regra explícita/configurada;
2. correção confirmada do mesmo perfil;
3. histórico categorizado do mesmo perfil;
4. provider de IA autorizado;
5. revisão manual quando a evidência é insuficiente ou inválida.

A candidatura mantém `sourceSuggestionId`, `audit.sourceFingerprint`, origem, confiança, motivos e fingerprint canônico. Uma categoria arquivada/incompatível, correções conflitantes, baixa confiança, provider desativado ou consentimento indisponível não inventam categoria: a sugestão permanece para revisão.

A Inbox apresenta a origem como **regra**, **correção anterior**, **histórico**, **IA** ou **revisão manual** conforme o produtor. Para extrações de mensagens bancárias, **Corrigir e aprovar** permite escolher uma categoria válida e grava o aprendizado na mesma transação da aprovação.

O comportamento completo está em `docs/ai/category-learning.md`.

## Mensagens bancárias

A Inbox de mensagens bancárias produz sugestões `transaction_extraction` V2 com origem explícita:

- `rule`, quando uma regra determinística reconhece a mensagem;
- `provider`, quando o provider configurado completa a extração.

Conta e categoria opcionais são validadas por organização, perfil financeiro e estado ativo antes da persistência. Pistas textuais de conta, cartão ou categoria vindas do parser aparecem apenas como motivos mascarados para revisão e nunca são convertidas em IDs internos.

Sugestões válidas, inclusive as de baixa confiança, permanecem em `PENDING_REVIEW`. Resposta inválida, extração incompleta, provider desativado ou falha temporária não criam lançamento. O texto bruto, o prompt e a resposta bruta do provider não são armazenados na fila.

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
- candidaturas determinísticas ou de categorização anteriores → `expired` quando outra decisão vigente substitui a origem.

A decisão e a persistência são protegidas por transação e pelo contrato do banco. Uma segunda decisão concorrente recebe conflito determinístico. Payload de sugestão resolvida é imutável.

Sugestões dependentes de outra sugestão armazenam `sourceSuggestionId` e o fingerprint observado em `audit.sourceFingerprint`. Em categorização, um `sourceSuggestionId` sem fingerprint é apenas rastreabilidade e não ativa a validação de vigência. Antes de concluir uma aprovação ou edição dependente, o PostgreSQL consulta a origem sob lock compartilhado no mesmo `organizationId` e `financialProfileId`. Origem ausente ou fingerprint divergente retorna `AI_SUGGESTION_PAYLOAD_OBSOLETE`, preserva a sugestão como pendente e não produz efeito parcial. A rejeição permanece permitida para descartar a candidatura obsoleta.

Contas e categorias são carregadas novamente dentro da transação de aprovação. Referência ausente, de outro perfil ou arquivada retorna erro controlado e mantém a sugestão pendente.

## Legado

Payload estruturado legado compatível pode ser projetado para leitura ou encapsulado de forma conservadora quando ainda está pendente. O deploy não faz backfill amplo. Registro sem payload, texto livre ou versão incompatível permanece sem efeito automático e retorna erro controlado.

A suíte de diagnóstico de consistência pode fabricar estados históricos impossíveis por meio de um bypass restrito ao teste. Esse bypass desativa somente o trigger de imutabilidade durante a corrupção e a restauração da fixture; os caminhos produtivos nunca o utilizam.

## Segurança

Todas as consultas e mutações exigem o mesmo `organizationId` e `financialProfileId`. Auditoria registra revisor, data, ação, entidade e mudanças redigidas. Aprendizado registra apenas contexto, identificador e ação; não grava descrição financeira no evento. CSV bruto, mensagens bancárias brutas, prompts, credenciais e respostas integrais de provider não são armazenados no payload.
