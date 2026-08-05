# Política de provedores de IA

**Issues:** #51, #562  
**Status:** provider real inicial disponível, substituível e desativado por padrão.

## Objetivo

O pacote `@solverfin/ai` centraliza chamadas a provedores de IA para manter o domínio financeiro desacoplado de fornecedores, modelos, endpoints e prompts específicos.

Nenhum fluxo pode chamar IA sem consentimento ativo, propósito declarado, payload minimizado, limites explícitos e logs seguros. Efeitos financeiros continuam dependentes de contratos estruturados e revisão humana quando exigida pelo fluxo de origem.

A decisão arquitetural do primeiro provider real está na [ADR 0010](../adr/0010-openai-provider-inicial.md).

## Superfície pública

O pacote exporta:

- `AiProvider`: contrato substituível para providers reais ou fake;
- `FakeAiProvider`: provider determinístico para testes;
- `OpenAiProvider`: adapter HTTP inicial para um endpoint OpenAI compatível com Chat Completions;
- `createAiProviderFromEnvironment`: seleciona `disabled` ou `openai` a partir do ambiente validado;
- `loadOpenAiProviderConfig`: valida a configuração sem expor valores sensíveis;
- `inspectAiProviderConfiguration`: health check local de configuração, sem chamada remota;
- `runAiTask`: aplica consentimento, política, sanitização, retry e chamada ao provider;
- `sanitizeAiPayload`: remove campos não permitidos e mascara identificadores sensíveis;
- `maskSensitiveText`: mascara documentos, cartões e números longos;
- `AI_TASK_ALLOWED_FIELD_NAMES`: registro central de campos permitidos por tarefa;
- `defaultAiUsagePolicy`: política-base que deve ser especializada por finalidade.

Tarefas suportadas:

- `extraction`: extrair sugestões de lançamento;
- `classification`: sugerir categorias ou classificações;
- `summary`: resumir dados agregados;
- `assistant`: responder perguntas financeiras autorizadas.

## Configuração

O provider permanece desativado quando `AI_PROVIDER` está ausente ou definido como `disabled`. Esse é o valor obrigatório em `.env.example`, testes e ambientes que não tenham ativação explícita.

Para habilitar o adapter inicial, configure todas as variáveis em um ambiente protegido:

| Variável                       | Contrato                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| `AI_PROVIDER`                  | `disabled` ou `openai`.                                    |
| `AI_OPENAI_ENDPOINT`           | URL HTTPS sem credenciais, query ou fragmento.             |
| `AI_OPENAI_API_KEY`            | Credencial secreta; nunca deve ser versionada ou logada.   |
| `AI_OPENAI_MODEL`              | Modelo selecionado pelo ambiente, sem hardcode no adapter. |
| `AI_OPENAI_MAX_OUTPUT_TOKENS`  | Teto positivo de saída por chamada.                        |
| `AI_OPENAI_MAX_REQUEST_BYTES`  | Teto positivo do corpo JSON enviado.                       |
| `AI_OPENAI_REQUEST_TIMEOUT_MS` | Teto operacional do adapter.                               |

Configuração ausente ou inválida falha fechada e informa apenas os nomes das variáveis afetadas. O valor da credencial não aparece em mensagens de erro, health check ou logs.

## Política obrigatória por chamada

Cada chamada informa uma `AiUsagePolicy`:

| Campo                   | Uso                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `consent`               | Snapshot inicial; `missing` ou `revoked` bloqueiam antes do preparo.               |
| `purpose`               | Finalidade específica, não vazia e diferente de `unspecified`.                     |
| `maxPromptChars`        | Limita o prompt já sanitizado.                                                     |
| `maxRetries`            | Define novas tentativas após falhas temporárias.                                   |
| `timeoutMs`             | Define o limite da chamada; o adapter usa o menor valor entre política e ambiente. |
| `allowRawFinancialText` | Permanece `false` por padrão; `true` exige justificativa específica.               |
| `allowedFieldNames`     | Lista positiva obrigatória e não vazia para a finalidade.                          |

`allowedFieldNames` faz parte do contrato de tipo e também é validada em runtime. Política sem allowlist, allowlist vazia, propósito não especializado ou tarefa sem política registrada retorna `AI_POLICY_INVALID` antes da sanitização e produz zero chamadas externas.

Todo consumidor capaz de alcançar um provider deve receber um resolvedor autoritativo de consentimento e repassá-lo a `runAiTask`. A ausência desse resolvedor bloqueia o consumidor antes de qualquer chamada externa. O executor consulta o estado atual imediatamente antes de cada tentativa; uma revogação posterior ao preparo retorna `AI_CONSENT_REQUIRED` e produz zero chamadas ao provider. `AiUsagePolicy.consent` sozinho não autoriza o outbound.

## Allowlist central por tarefa

`AI_TASK_ALLOWED_FIELD_NAMES` registra a segunda barreira de minimização. Um campo somente pode chegar ao provider quando pertence simultaneamente:

1. à `allowedFieldNames` da política da chamada; e
2. à allowlist central da tarefa.

A interseção é aplicada imediatamente antes de construir `SafeAiProviderRequest`. Uma política local excessivamente ampla não consegue ampliar o contrato central.

| Tarefa           | Campos centrais permitidos                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| `extraction`     | `message`, `merchant`, `amountMinor`, `currency`, `occurredOn`                        |
| `classification` | `merchant`, `amountMinor`, `currency`, `occurredOn`, `description`, `transactionType` |
| `summary`        | `periodStart`, `periodEnd`, `currency`, `incomeMinor`, `expenseMinor`, `balanceMinor`  |
| `assistant`      | `question`, `intent`                                                                  |

Mudanças nesse registro são mudanças de contrato: exigem revisão de privacidade, testes negativos para string, número e booleano não autorizados e atualização desta documentação.

## Minimização e mascaramento

A chamada envia somente dados necessários para a finalidade:

- campos fora da allowlist local são omitidos;
- campos fora da allowlist central da tarefa são omitidos, mesmo que a política local os liste;
- documentos no formato CPF são substituídos por `***documento***`;
- cartões de 16 dígitos são substituídos por `**** **** **** ****`;
- números longos preservam apenas os últimos quatro dígitos;
- o adapter recebe exclusivamente `SafeAiProviderRequest`, depois da sanitização.

O adapter não conhece tenant, banco, entidade financeira, fila de revisão ou regra de negócio. Ele recebe somente tarefa, propósito, prompt sanitizado, campos permitidos, correlation id opcional e timeout.

## Tentativas, timeout e erros controlados

`runAiTask` é o único executor de retry. O adapter executa no máximo uma chamada HTTP por tentativa e não faz probe, diagnóstico ou recuperação oculta.

| Situação                                     | Código público                 | Retry                  |
| -------------------------------------------- | ------------------------------ | ---------------------- |
| Política ou allowlist inválida               | `AI_POLICY_INVALID`            | Não chama provider     |
| Consentimento ausente ou revogado            | `AI_CONSENT_REQUIRED`          | Não chama provider     |
| Payload vazio                                | `AI_PAYLOAD_EMPTY`             | Não chama provider     |
| Prompt acima do limite                       | `AI_PAYLOAD_TOO_LARGE`         | Não chama provider     |
| Timeout HTTP ou abort                        | `AI_PROVIDER_TIMEOUT`          | Sim, conforme política |
| HTTP 429                                     | `AI_PROVIDER_RATE_LIMITED`     | Sim, conforme política |
| HTTP 5xx                                     | `AI_PROVIDER_UNAVAILABLE`      | Sim, conforme política |
| HTTP 4xx restante                            | `AI_PROVIDER_ERROR`            | Não                    |
| JSON, envelope, texto ou confiança inválidos | `AI_PROVIDER_INVALID_RESPONSE` | Não                    |
| Falha genérica esgotada                      | `AI_PROVIDER_ERROR`            | Conforme política      |

Uma resposta aceita deve conter texto não vazio. Quando o conteúdo usa o envelope JSON interno, ele pode conter `text`, `structured` e `confidence`; a confiança, quando presente, deve estar entre `0` e `1`.

## Logs e health check

Eventos seguros podem conter somente:

- provider e modelo;
- tarefa;
- correlation id;
- número da tentativa;
- duração;
- código e resultado controlado.

Prompt, campos, credencial, corpo bruto, resposta bruta e identificadores de organização ou perfil financeiro não fazem parte de `SafeAiLogEvent`.

`inspectAiProviderConfiguration` verifica apenas seleção, formato das variáveis, modelo e origem do endpoint. Ele não chama o fornecedor, não envia dados financeiros e não valida a credencial por rede.

## Custos e limites

Preços e capacidades do fornecedor variam com modelo e contrato do ambiente e não são congelados no código. Antes de habilitar um ambiente, revise o preço vigente e configure modelo, teto de saída, limite de corpo, timeout e retries por finalidade.

Esses limites controlam exposição por chamada. Métricas agregadas de tokens, custo, orçamento e qualidade permanecem fora do recorte da issue #562.

## Testes e desenvolvimento local

A suíte usa `FakeAiProvider` e um cliente HTTP fake. Ela não acessa rede externa, não depende de credenciais e cobre:

- provider desativado por padrão;
- configuração válida e inválida;
- sucesso com uma chamada por tentativa;
- timeout, rate limit, indisponibilidade e erro permanente;
- resposta vazia ou inválida;
- allowlist ausente e vazia;
- tarefa sem política central registrada;
- filtragem de campos string, número e booleano não autorizados nas quatro tarefas;
- ausência de resolvedor autoritativo nos consumidores sem outbound;
- revogação de consentimento entre preparo e chamada nos consumidores reais;
- ausência de dados sensíveis em logs e erros.

Validações esperadas:

```bash
npm run test --workspace @solverfin/ai
npm run typecheck --workspace @solverfin/ai
npm run lint --workspace @solverfin/ai
npm run env:check
npm run validate
```

Use apenas fixtures fictícias e minimizadas. Não inclua mensagens bancárias, cartões, documentos, tokens, prompts ou respostas reais em testes, logs ou exemplos.

## Como adicionar ou substituir um provider

1. Criar uma classe que implemente `AiProvider`.
2. Receber configuração por ambiente seguro, sem hardcode de credenciais ou modelo.
3. Converter `SafeAiProviderRequest` para o contrato externo.
4. Fazer no máximo uma chamada externa por `complete`.
5. Aplicar timeout real e lançar `AiProviderError` com retry explícito.
6. Validar e normalizar a resposta antes de devolvê-la ao executor.
7. Nunca logar payload ou resposta bruta.
8. Cobrir o adapter com cliente fake e sem chamadas externas reais.
9. Registrar ADR quando a mudança criar dependência duradoura, custo relevante ou novo contrato operacional.

## Limitações conhecidas

- O provider real está disponível como infraestrutura, mas nenhum fluxo de produto é ativado automaticamente por esta entrega.
- A ativação produtiva depende de configuração protegida e revisão operacional de modelo, custo e limites.
- Telemetria agregada de custo e orçamento ainda não foi implementada.
- Fallbacks determinísticos dos fluxos existentes continuam independentes do provider real.
