# Contrato de payloads de sugestões

## Objetivo

`AiSuggestion.payload` é a fonte canônica para dados usados em revisão, automação ou efeito financeiro. `explanation` continua sendo texto para o usuário e nunca pode ser interpretado para reconstruir valor, data, conta, categoria, alvo ou decisão.

O contrato comum está em `@solverfin/domain/ai-suggestion-payloads` e usa um envelope discriminado:

```json
{
  "contractVersion": 1,
  "suggestionKind": "transaction_extraction",
  "payloadVersion": 2,
  "origin": { "kind": "import", "sourceKind": "csv" },
  "fingerprint": "sha256-...",
  "target": { "entityKind": "import_suggestion", "entityId": "..." },
  "confidence": 0.93,
  "reasons": ["..."],
  "audit": { "createdAt": "2026-08-04T12:00:00.000Z" },
  "occurredOn": "2026-08-04",
  "kind": "expense",
  "direction": "outflow",
  "amountMinor": 1299,
  "currency": "BRL",
  "description": "Compra revisável"
}
```

`contractVersion` identifica o envelope comum. `payloadVersion` identifica o schema específico do tipo. Campos inesperados são recusados para impedir que respostas livres ou dados internos sejam aceitos como contrato.

## Tipos suportados

| `suggestionKind`         | Versão atual | Conteúdo canônico                                                                                                               |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `transaction_extraction` | V1/V2        | linha e hash de origem, data, tipo, direção na V2, valor, moeda, descrição, contas, categoria e identificador externo opcionais |
| `categorization`         | V1           | alvo explícito e campos propostos de categoria, conta, cartão ou status                                                         |
| `deduplication`          | V1           | sugestão de origem, fingerprint da origem, lançamento alvo e conflitos                                                          |
| `reconciliation`         | V1           | sugestão de origem, fingerprint da origem, lançamento alvo e conflitos                                                          |
| `insight`                | V1           | tipo, título, resumo, período, métrica estruturada e entidades relacionadas opcionais                                           |

`origin`, `target`, `confidence`, `reasons`, `audit` e `fingerprint` pertencem ao envelope comum. IDs permanecem sujeitos ao isolamento por organização e perfil financeiro.

## Fingerprint e concorrência

O domínio produz fingerprints `sha256-<64 hex>` sobre JSON canônico, excluindo `fingerprint` e metadados mutáveis de auditoria; `audit.sourceFingerprint` permanece na identidade para detectar origem obsoleta. A migração pode gerar `db-fp-v1-<64 hex>` para encapsular uma gravação legada compatível sem reinterpretar texto livre.

Uma alteração de proposta precisa gerar novo fingerprint. Toda mutação pública da fila (`approve`, `edit` e `reject`) exige `expectedFingerprint`; a ausência retorna `AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED` com HTTP `428`. Fingerprint divergente retorna `AI_SUGGESTION_PAYLOAD_CONFLICT`. Sugestões resolvidas são imutáveis; duas decisões concorrentes não podem produzir dois estados terminais válidos.

### Dependências entre sugestões

`categorization`, `deduplication` e `reconciliation` podem depender de outra sugestão. Em `deduplication` e `reconciliation`, `sourceSuggestionId` sempre representa dependência e o contrato determinístico exige `sourcePayloadFingerprint`. Em `categorization`, `sourceSuggestionId` pode ser mantido apenas para rastreabilidade; a proposta passa a ser dependente quando também registra o fingerprint observado em `audit.sourceFingerprint`.

A transição de uma sugestão dependente para `approved` ou `edited` revalida a origem no PostgreSQL antes do commit:

1. a origem precisa existir na mesma organização e no mesmo perfil financeiro;
2. a linha da origem é lida com lock compartilhado;
3. o fingerprint persistido da origem precisa coincidir com o observado pela dependente;
4. ausência ou divergência retorna `AI_SUGGESTION_PAYLOAD_OBSOLETE`;
5. a sugestão permanece pendente e nenhuma transação, auditoria terminal ou timestamp de revisão é persistido.

Uma categorização sem `audit.sourceFingerprint` não é tratada como candidatura dependente, mesmo quando conserva `sourceSuggestionId` apenas para rastreabilidade. Produtores que exigem proteção contra obsolescência, como regras automáticas, devem persistir ambos. A rejeição não exige origem vigente, permitindo descartar uma dependente obsoleta.

## Compatibilidade e migração

A migração `20260804130000_versioned_ai_suggestion_payloads` não executa backfill amplo e não altera registros históricos durante o deploy. A migração complementar `20260804143000_harden_ai_suggestion_payload_nested_objects` torna a validação do PostgreSQL estrita também dentro de `origin`, `target`, `audit` e `metric`, além de validar os arrays estruturados.

A migração `20260804220500_validate_ai_suggestion_dependency_freshness` protege decisões dependentes contra alterações concorrentes ou posteriores da origem. Ela não reescreve dados existentes e atua somente em transições terminais de registros pendentes.

A migração `20260805110000_validate_ai_suggestion_payload_kind_values` completa a equivalência com o parser do domínio para valores específicos de cada `kind`: tipos escalares, inteiros positivos seguros, datas, moeda, enums e campos opcionais. Ela também impede campos exclusivos da V2 em payloads V1 e exige `direction` em extrações V2.

- gravações novas precisam ter payload estruturado;
- V1/V2 legados de extração e V1 determinístico podem ser encapsulados pelo trigger, porque já contêm campos estruturados verificáveis;
- leitura pode projetar payload legado compatível sem persistir a projeção;
- migração explícita só é permitida para `pending_review`;
- payload ausente, livre, incompatível ou com versão desconhecida falha de forma controlada;
- sugestões resolvidas não são reinterpretadas nem regravadas;
- chaves aninhadas desconhecidas são rejeitadas antes da persistência.

## API e frontend

A leitura tipada está disponível em:

```http
GET /api/ai-review-queue/:suggestionId/payload
```

A rota valida UUID antes do acesso ao banco, aplica `organizationId` e `financialProfileId` na consulta e não enumera sugestões de outro perfil. A projeção pública padrão omite provider, model, correlation ID, metadados internos e referências técnicas. O detalhe autenticado da fila pode habilitar `includeScopedEntityIds` somente depois do recorte tenant/profile e expor as referências estritamente necessárias aos controles de revisão, como conta, categoria ou `targetTransactionId`. Essas referências não devem ser usadas como identificação textual visível do item.

A interface deve consumir somente a projeção pública tipada retornada por esse endpoint, sem reconstruir dados a partir de `explanation`. Quando uma referência escopada precisar ser apresentada ao usuário, ela deve ser resolvida por uma rota tenant-scoped para dados de domínio legíveis; por exemplo, deduplicação e conciliação resolvem `targetTransactionId` para descrição, data e valor do lançamento alvo, sem mostrar o UUID.

## Erros públicos

- `AI_SUGGESTION_PAYLOAD_MISSING`
- `AI_SUGGESTION_PAYLOAD_INVALID`
- `AI_SUGGESTION_PAYLOAD_KIND_MISMATCH`
- `AI_SUGGESTION_PAYLOAD_VERSION_UNSUPPORTED`
- `AI_SUGGESTION_PAYLOAD_OBSOLETE`
- `AI_SUGGESTION_PAYLOAD_IMMUTABLE`
- `AI_SUGGESTION_PAYLOAD_CONFLICT`
- `AI_REVIEW_EXPECTED_FINGERPRINT_REQUIRED`

Erros inesperados de persistência retornam erro público genérico com `correlationId`; mensagens SQL, fingerprints, chaves e valores financeiros brutos não são expostos.

## Privacidade

O payload persiste apenas dados normalizados necessários à proposta. Não deve conter prompt bruto, arquivo bruto, mensagem bancária bruta, credencial, token, cabeçalho, stack trace ou resposta integral de provider. Auditoria registra campos alterados de forma redigida.
