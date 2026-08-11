# Contrato de payloads de sugestões

## Objetivo

`AiSuggestion.payload` é a fonte canônica para dados usados em revisão, automação ou efeito financeiro. `explanation` continua sendo texto para o usuário e nunca pode ser interpretado para reconstruir valor, data, conta, categoria, alvo, evidência ou decisão.

O contrato comum está em `@solverfin/domain/ai-suggestion-payloads` e usa envelope discriminado com `contractVersion`, `suggestionKind`, `payloadVersion`, `origin`, `fingerprint`, `target`, `confidence`, `reasons` e `audit`.

`contractVersion` identifica o envelope comum. `payloadVersion` identifica o schema específico do tipo. Campos inesperados são recusados para impedir que respostas livres ou dados internos sejam aceitos como contrato.

## Tipos suportados

| `suggestionKind`         | Versão atual | Conteúdo canônico                                                                                                                                                                    |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transaction_extraction` | V1/V2        | linha e hash de origem, data, tipo, direção na V2, valor, moeda, descrição, contas, categoria e identificador externo opcionais                                                      |
| `categorization`         | V1           | alvo explícito e campos propostos de categoria, conta, cartão ou status                                                                                                              |
| `deduplication`          | V1           | sugestão de origem, fingerprint da origem, lançamento alvo e conflitos                                                                                                               |
| `reconciliation`         | V1           | sugestão de origem, fingerprint da origem, lançamento alvo e conflitos                                                                                                               |
| `insight`                | V1/V2        | V1 mantém tipo/título/resumo/período/métrica; V2 adiciona tipo verificável, moeda, filtros, evidências, comparação, limitações, versão de cálculo, fingerprint dos dados e navegação |

`origin`, `target`, `confidence`, `reasons`, `audit` e `fingerprint` pertencem ao envelope comum. IDs permanecem sujeitos ao isolamento por organização e perfil financeiro.

## Insight V2

`InsightSuggestionPayloadV2` é o contrato persistido dos insights financeiros verificáveis da issue #567.

Campos específicos:

- `insightType`: classe apresentacional (`anomaly`, `trend`, `summary` ou `opportunity`);
- `insightKind`: detector determinístico (`category_spending_increase`, `merchant_spending_increase`, `probable_subscription`, `negative_balance_risk`, `budget_exceeded` ou `monthly_summary`);
- `insightKey`: identidade lógica interna do detector/escopo;
- `title` e `summary`;
- `periodStartOn` e `periodEndOn`;
- `currency` e `filters`;
- `evidence[]`: valores tipados como `minor_currency`, `count` ou `percentage`;
- `comparison` opcional contra período anterior ou orçamento planejado;
- `limitations[]`;
- `calculationVersion`;
- `dataFingerprint`: identidade interna dos dados/evidências usados pelo cálculo;
- `relatedEntityIds` e `navigation` opcionais para referências escopadas.

Evidência `minor_currency` precisa carregar a mesma moeda do insight. Evidências de contagem/percentual não carregam moeda. Filtros também precisam declarar a mesma moeda. `dataFingerprint` segue `sha256-<64 hex>`.

A projeção pública não expõe `insightKey`, `dataFingerprint`, provider, model, correlation ID ou auditoria interna. `calculationVersion`, evidências e limitações podem ser retornados porque são necessários para explicar a origem do cálculo; referências de entidade só são incluídas quando `includeScopedEntityIds` é habilitado após o recorte tenant/profile.

O contrato funcional e os limiares ficam em `docs/FINANCIAL_INSIGHTS.md`.

## Fingerprint e concorrência

O domínio produz fingerprints `sha256-<64 hex>` sobre JSON canônico, excluindo `fingerprint` e metadados mutáveis de auditoria; `audit.sourceFingerprint` permanece na identidade para detectar origem obsoleta. A migração pode gerar `db-fp-v1-<64 hex>` para encapsular uma gravação legada compatível sem reinterpretar texto livre.

Uma alteração de proposta precisa gerar novo fingerprint. Toda mutação pública da fila (`approve`, `edit` e `reject`) exige `expectedFingerprint`; a ausência retorna `AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED` com HTTP `428`. Fingerprint divergente retorna `AI_SUGGESTION_PAYLOAD_CONFLICT`. Sugestões resolvidas são imutáveis; duas decisões concorrentes não podem produzir dois estados terminais válidos.

Para insights V2 há também `dataFingerprint`, que não substitui o fingerprint do envelope. Ele identifica o snapshot determinístico para idempotência de geração; o fingerprint do envelope continua protegendo concorrência e mutações da fila.

### Dependências entre sugestões

`categorization`, `deduplication` e `reconciliation` podem depender de outra sugestão. Em `deduplication` e `reconciliation`, `sourceSuggestionId` sempre representa dependência e o contrato determinístico exige `sourcePayloadFingerprint`. Em `categorization`, `sourceSuggestionId` pode ser mantido apenas para rastreabilidade; a proposta passa a ser dependente quando também registra o fingerprint observado em `audit.sourceFingerprint`.

A transição de uma sugestão dependente para `approved` ou `edited` revalida a origem no PostgreSQL antes do commit. Origem ausente, de outro contexto ou com fingerprint divergente mantém a sugestão pendente e não aplica efeito parcial. A rejeição continua permitida para descartar uma dependente obsoleta.

Insights V2 não dependem de outra `AiSuggestion`: a origem observada é o próprio snapshot financeiro resumido no `dataFingerprint`.

## Compatibilidade e migração

A migração `20260804130000_versioned_ai_suggestion_payloads` introduziu o envelope comum sem backfill amplo. As migrações complementares de 2026-08-04 e 2026-08-05 tornaram a validação do PostgreSQL estrita para objetos aninhados, dependências e valores específicos por tipo.

A migration `20260811130000_verifiable_financial_insight_payload_v2` adiciona validação estrita para `insight` V2 e mantém o validador anterior para V1 e todos os demais tipos. Ela não reinterpreta nem regrava insights históricos.

Regras gerais:

- gravações novas precisam ter payload estruturado;
- V1/V2 legados de extração e V1 determinístico podem ser encapsulados pelo trigger quando já contêm campos verificáveis;
- leitura pode projetar payload legado compatível sem persistir a projeção;
- migração explícita só é permitida para `pending_review`;
- payload ausente, livre, incompatível ou com versão desconhecida falha de forma controlada;
- sugestões resolvidas não são reinterpretadas nem regravadas;
- chaves desconhecidas são rejeitadas antes da persistência.

## API e frontend

A leitura tipada está disponível em:

```http
GET /api/ai-review-queue/:suggestionId/payload
```

A rota valida UUID antes do acesso ao banco, aplica `organizationId` e `financialProfileId` na consulta e não enumera sugestões de outro perfil. A projeção pública padrão omite provider, model, correlation ID, metadados internos e referências técnicas. O detalhe autenticado da fila pode habilitar `includeScopedEntityIds` somente depois do recorte tenant/profile e expor referências estritamente necessárias aos controles de revisão ou navegação.

A interface deve consumir somente a projeção pública tipada retornada por esse endpoint, sem reconstruir dados a partir de `explanation`. Quando uma referência escopada precisar ser apresentada, ela deve ser resolvida por uma rota tenant-scoped e nunca usada como rótulo técnico visível.

## Erros públicos

- `AI_SUGGESTION_PAYLOAD_MISSING`
- `AI_SUGGESTION_PAYLOAD_INVALID`
- `AI_SUGGESTION_PAYLOAD_KIND_MISMATCH`
- `AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED`
- `AI_SUGGESTION_PAYLOAD_OBSOLETE`
- `AI_SUGGESTION_PAYLOAD_IMMUTABLE`
- `AI_SUGGESTION_PAYLOAD_CONFLICT`
- `AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED`

Erros inesperados de persistência retornam erro público genérico com `correlationId`; mensagens SQL, fingerprints internos, chaves e valores financeiros brutos não são expostos.

## Privacidade

O payload persiste apenas dados normalizados necessários à proposta. Não deve conter prompt bruto, arquivo bruto, mensagem bancária bruta, credencial, token, cabeçalho, stack trace ou resposta integral de provider. Auditoria registra campos alterados de forma redigida.
