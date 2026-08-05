# Política de provedores de IA

**Issues:** #51, #562  
**Status:** provider real inicial disponível, substituível e desativado por padrão.

## Objetivo

O pacote `@solverfin/ai` centraliza chamadas a provedores de IA para manter o domínio financeiro desacoplado de fornecedor, modelo, endpoint, credencial e formato externo.

Nenhum fluxo pode chamar IA sem consentimento ativo, finalidade declarada, payload minimizado, limites explícitos e logs seguros. Respostas do provider não produzem efeito financeiro antes de validação estruturada e composição com dados confiáveis do produto.

A decisão arquitetural do primeiro provider real está na [ADR 0010](../adr/0010-openai-provider-inicial.md).

## Superfície pública

O pacote exporta:

- `AiProvider` e `FakeAiProvider`;
- `OpenAiProvider`, adapter HTTP inicial compatível com Chat Completions;
- `createAiProviderFromEnvironment`, `loadOpenAiProviderConfig` e `inspectAiProviderConfiguration`;
- `runAiTask`, executor comum de consentimento, sanitização, retry e validação;
- `sanitizeAiPayload`, `maskSensitiveText` e `AI_TASK_ALLOWED_FIELD_NAMES`;
- `AI_CLASSIFICATION_RESULT_CONTRACT_VERSION` e `AiClassificationResultV1`, contrato canônico do resultado de classificação enviado pelo provider;
- `defaultAiUsagePolicy`, política-base que deve ser especializada por finalidade.

Tarefas suportadas:

- `extraction`: extrair uma sugestão de lançamento;
- `classification`: propor categoria, conta, cartão ou estado para revisão;
- `summary`: resumir dados agregados;
- `assistant`: responder perguntas financeiras autorizadas.

## Configuração

O provider permanece desativado quando `AI_PROVIDER` está ausente ou definido como `disabled`. Esse é o valor obrigatório em `.env.example`, testes e ambientes sem ativação explícita.

Para habilitar o adapter inicial, configure em ambiente protegido:

| Variável | Contrato |
| --- | --- |
| `AI_PROVIDER` | `disabled` ou `openai`. |
| `AI_OPENAI_ENDPOINT` | URL HTTPS sem credenciais, query ou fragmento. |
| `AI_OPENAI_API_KEY` | Credencial secreta, nunca versionada ou logada. |
| `AI_OPENAI_MODEL` | Modelo selecionado pelo ambiente. |
| `AI_OPENAI_MAX_OUTPUT_TOKENS` | Teto de saída por chamada. |
| `AI_OPENAI_MAX_REQUEST_BYTES` | Teto do corpo JSON enviado. |
| `AI_OPENAI_REQUEST_TIMEOUT_MS` | Teto operacional do adapter. |

Configuração ausente ou inválida falha fechada e informa apenas os nomes das variáveis afetadas. O valor da credencial não aparece em erros, health check ou logs.

## Política obrigatória por chamada

Cada chamada informa uma `AiUsagePolicy`:

| Campo | Uso |
| --- | --- |
| `consent` | Snapshot inicial; `missing` ou `revoked` bloqueiam antes do preparo. |
| `purpose` | Finalidade específica e diferente de `unspecified`. |
| `maxPromptChars` | Limite do prompt já sanitizado. |
| `maxRetries` | Número máximo de novas tentativas após falha temporária. |
| `timeoutMs` | Limite da chamada; o adapter usa o menor valor entre política e ambiente. |
| `allowRawFinancialText` | Permanece `false` por padrão. |
| `allowedFieldNames` | Lista positiva obrigatória para a finalidade. |

Política inválida retorna `AI_POLICY_INVALID` antes da rede.

Todo consumidor capaz de alcançar um provider deve fornecer um resolvedor autoritativo de consentimento. O executor consulta esse resolvedor antes do preparo e imediatamente antes de cada tentativa.

- ausência do resolvedor, consentimento ausente ou revogado: `AI_CONSENT_REQUIRED`;
- exceção síncrona ou rejeição assíncrona do resolvedor: `AI_CONSENT_CHECK_FAILED`;
- falha da consulta antes de um retry impede a tentativa seguinte;
- todos esses caminhos são fail-closed e não iniciam nova chamada ao provider.

`AiUsagePolicy.consent` sozinho nunca autoriza o outbound.

## Allowlist e minimização

Um campo só chega ao provider quando pertence simultaneamente à allowlist da política e à allowlist central da tarefa.

- `extraction`: `message`, `merchant`, `amountMinor`, `currency`, `occurredOn`;
- `classification`: `merchant`, `amountMinor`, `currency`, `occurredOn`, `description`, `transactionType`;
- `summary`: `periodStart`, `periodEnd`, `currency`, `incomeMinor`, `expenseMinor`, `balanceMinor`;
- `assistant`: `question`, `intent`.

Documentos, cartões e números longos são mascarados. Campos desconhecidos são omitidos. O adapter recebe apenas `SafeAiProviderRequest`, depois da sanitização.

O adapter não recebe `organizationId`, `financialProfileId` nem entidades de domínio. `correlationId` é opcional e serve somente para correlação operacional segura.

## Contratos de resposta por tarefa

Toda resposta aceita contém `text` não vazio e `confidence` opcional entre `0` e `1`.

### Extraction

`structured` é obrigatório e validado pelo schema canônico de extração. Campo desconhecido, valor impossível ou estrutura incompleta retorna `AI_PROVIDER_INVALID_RESPONSE`.

### Classification

`structured` é obrigatório e segue `AiClassificationResultV1`:

```json
{
  "contractVersion": 1,
  "suggestionKind": "categorization",
  "payloadVersion": 1,
  "proposedCategoryId": "category-demo",
  "reasons": ["correspondência fictícia de merchant"]
}
```

Regras:

- deve existir ao menos uma proposta entre `proposedCategoryId`, `proposedAccountId`, `proposedCardId` e `proposedStatus`;
- `reasons` é uma lista não vazia;
- espécie, versão e campos são estritos;
- `targetEntityId`, `origin`, `fingerprint`, `audit` e qualquer outro campo confiável são recusados quando vierem do provider;
- alvo, origem, fingerprint e auditoria são adicionados pelo serviço de produto a partir de contexto autorizado e depois validados pelo contrato persistente da issue #561;
- `validateStructuredResult`, quando fornecido pelo consumidor, só pode restringir adicionalmente o resultado. Ele nunca substitui nem amplia o validador canônico.

Assim, um callback permissivo como `() => true` não admite payload legado, espécie divergente, versão incompatível ou campo extra.

### Summary e assistant

Aceitam texto simples ou envelope com `text` e `confidence`. Qualquer `structured` é recusado.

## Tentativas, timeout e erros controlados

`runAiTask` é o único executor de retry. Uma tentativa produz no máximo uma chamada HTTP, sem probe, diagnóstico ou recuperação oculta.

| Situação | Código público | Retry |
| --- | --- | --- |
| Política ou allowlist inválida | `AI_POLICY_INVALID` | Não chama provider |
| Consentimento ausente ou revogado | `AI_CONSENT_REQUIRED` | Não chama provider |
| Falha ao consultar consentimento | `AI_CONSENT_CHECK_FAILED` | Não inicia nova tentativa |
| Payload vazio | `AI_PAYLOAD_EMPTY` | Não chama provider |
| Prompt acima do limite | `AI_PAYLOAD_TOO_LARGE` | Não chama provider |
| Timeout HTTP ou abort | `AI_PROVIDER_TIMEOUT` | Conforme política |
| HTTP 429 | `AI_PROVIDER_RATE_LIMITED` | Conforme política |
| HTTP 5xx | `AI_PROVIDER_UNAVAILABLE` | Conforme política |
| HTTP 4xx restante | `AI_PROVIDER_ERROR` | Não |
| JSON, envelope ou schema inválido | `AI_PROVIDER_INVALID_RESPONSE` | Não |

Redirects automáticos são bloqueados. O timeout efetivo é o menor valor entre política e configuração ambiental.

## Logs e health check

Eventos seguros podem conter somente provider, modelo, tarefa, correlation id, tentativa, duração, código, resultado e código de falha controlado.

Prompt, campos, credencial, corpo bruto, resposta bruta e identificadores de tenant não fazem parte de `SafeAiLogEvent`.

O logger é best-effort. Exceção síncrona ou rejeição assíncrona do logger é contida e não altera resultado, retry ou contagem outbound.

`inspectAiProviderConfiguration` verifica apenas seleção e formato da configuração. Ele não chama o fornecedor, não envia dados financeiros e não valida credencial por rede.

## Custos e limites

Preços e capacidades variam por modelo e contrato do ambiente. Antes da ativação, revise a tabela vigente e configure modelo, teto de saída, limite de corpo, timeout e retries por finalidade.

Métricas agregadas de tokens, custo, orçamento e qualidade permanecem fora da issue #562.

## Testes e desenvolvimento local

A suíte usa providers e clientes HTTP fakes, não acessa rede externa e não depende de credenciais. A cobertura inclui:

- provider desativado e configuração inválida sem exposição de segredo;
- uma chamada outbound por tentativa;
- timeout, rate limit, indisponibilidade, erro permanente e resposta vazia;
- allowlists das quatro tarefas;
- ausência, revogação e falha síncrona/assíncrona do resolvedor de consentimento;
- falha de consentimento entre retries impedindo novo outbound;
- contrato de classificação canônico, versão divergente, campo extra e callback permissivo;
- logger falhando sem alterar o comportamento;
- `summary` e `assistant` rejeitando `structured`.

Validações esperadas:

```bash
npm run test --workspace @solverfin/ai
npm run typecheck --workspace @solverfin/ai
npm run lint --workspace @solverfin/ai
npm run env:check
npm run validate
```

Use apenas fixtures fictícias e minimizadas.

## Como adicionar ou substituir um provider

1. Implementar `AiProvider`.
2. Receber configuração exclusivamente por ambiente seguro.
3. Converter `SafeAiProviderRequest` para o contrato externo.
4. Fazer no máximo uma chamada externa por `complete`.
5. Aplicar timeout real e lançar `AiProviderError` com retry explícito.
6. Validar e normalizar a resposta antes de devolvê-la.
7. Nunca logar payload ou resposta bruta.
8. Cobrir o adapter com cliente fake e sem chamadas reais.
9. Registrar ADR quando houver dependência duradoura, custo relevante ou novo contrato operacional.

## Limitações conhecidas

- A infraestrutura existe, mas nenhum fluxo de produto é ativado automaticamente por esta entrega.
- A ativação produtiva depende de configuração protegida e revisão de modelo, custo e limites.
- Telemetria agregada de custo e orçamento ainda não foi implementada.
- Fallbacks determinísticos permanecem independentes do provider real.
