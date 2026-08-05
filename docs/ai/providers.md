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
- `runAiTask`: aplica consentimento, sanitização, limite de retry, validação de resposta e chamada ao provider;
- `AiStructuredResultValidator`: contrato de validação injetável para tarefas que devolvem payload estruturado específico do fluxo;
- `sanitizeAiPayload` e `maskSensitiveText`: minimização e mascaramento;
- `defaultAiUsagePolicy`: política-base que deve ser especializada por finalidade.

Tarefas suportadas:

- `extraction`: extrair sugestões de lançamento;
- `classification`: sugerir categorias ou classificações;
- `summary`: resumir dados agregados;
- `assistant`: responder perguntas financeiras autorizadas.

## Configuração

O provider permanece desativado quando `AI_PROVIDER` está ausente ou definido como `disabled`. Esse é o valor obrigatório em `.env.example`, testes e ambientes sem ativação explícita.

| Variável                       | Contrato                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| `AI_PROVIDER`                  | `disabled` ou `openai`.                                    |
| `AI_OPENAI_ENDPOINT`           | URL HTTPS sem credenciais, query ou fragmento.             |
| `AI_OPENAI_API_KEY`            | Credencial secreta; nunca deve ser versionada ou logada.   |
| `AI_OPENAI_MODEL`              | Modelo selecionado pelo ambiente, sem hardcode no adapter. |
| `AI_OPENAI_MAX_OUTPUT_TOKENS`  | Teto positivo de saída por chamada.                        |
| `AI_OPENAI_MAX_REQUEST_BYTES`  | Teto positivo do corpo JSON enviado.                       |
| `AI_OPENAI_REQUEST_TIMEOUT_MS` | Teto operacional do adapter.                               |

Configuração ausente ou inválida falha fechada e informa apenas os nomes das variáveis afetadas. O placeholder versionado `solverfin-ai-disabled-placeholder` é aceito somente enquanto o provider está desativado; com `AI_PROVIDER=openai`, ele torna a configuração inválida.

## Política obrigatória por chamada

Cada chamada informa uma `AiUsagePolicy`:

| Campo                      | Uso                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `consent`                  | Deve ser `granted`; `missing` ou `revoked` bloqueiam a chamada.                    |
| `purpose`                  | Declara a finalidade específica da operação.                                       |
| `maxPromptChars`           | Limita o prompt já sanitizado.                                                     |
| `maxRetries`               | Inteiro de `0` a `5`; valores fora da faixa falham antes da rede.                  |
| `timeoutMs`                | O adapter usa o menor valor entre política e limite ambiental.                     |
| `allowRawFinancialText`    | Permanece `false` por padrão; `true` exige justificativa específica.               |
| `allowedFieldNames`        | Lista positiva recomendada para cada finalidade.                                   |
| `blockedFieldNamePatterns` | Padrões bloqueados quando não houver lista positiva.                               |

Quando `resolveConsent` é fornecido, o consentimento é consultado novamente imediatamente antes de cada tentativa. Uma revogação impede a chamada seguinte ao provider.

## Minimização e mascaramento

A chamada envia somente dados necessários para a finalidade:

- campos fora de `allowedFieldNames` são omitidos;
- campos com nomes de conta, cartão, documento, payload bruto, mensagem bruta, token ou segredo são bloqueados pela política padrão;
- documentos no formato CPF são substituídos por `***documento***`;
- cartões de 16 dígitos são substituídos por `**** **** **** ****`;
- números longos preservam apenas os últimos quatro dígitos;
- o adapter recebe exclusivamente `SafeAiProviderRequest`, depois da sanitização.

O adapter não conhece tenant, banco, entidade financeira, fila de revisão ou regra de negócio. Ele recebe somente tarefa, propósito, prompt sanitizado, campos permitidos, correlation id opcional e timeout.

## Validação de resposta por tarefa

Toda resposta precisa conter texto não vazio e confiança válida quando esse campo estiver presente.

`extraction` e `classification` são tarefas estruturadas e falham com `AI_PROVIDER_INVALID_RESPONSE` quando recebem somente texto livre:

- `extraction` exige `structured` compatível com `validateTransactionExtraction`;
- `classification` exige `structured` e um `validateStructuredResult` fornecido pelo fluxo consumidor, normalmente ligado ao contrato discriminado e versionado de categorização entregue pela issue #561;
- `summary` e `assistant` podem devolver texto livre;
- quando `summary` ou `assistant` devolverem `structured`, o fluxo também deve fornecer um validador. Payload estruturado sem validador falha fechado.

O adapter faz parsing do envelope externo, mas a decisão de aceitar o payload pertence ao executor comum e ao validador da tarefa. Resposta bruta não é persistida nem registrada em log.

## Tentativas, timeout e erros controlados

`runAiTask` é o único executor de retry. O adapter executa no máximo uma chamada HTTP por tentativa e não faz probe, diagnóstico ou recuperação oculta. Redirecionamentos automáticos são bloqueados no limite HTTP com `redirect: "error"`; um redirect não pode produzir uma segunda requisição dentro da mesma tentativa.

| Situação                                    | Código público                 | Retry                  |
| ------------------------------------------- | ------------------------------ | ---------------------- |
| Consentimento ausente ou revogado           | `AI_CONSENT_REQUIRED`          | Não chama provider     |
| Política de retry inválida                   | `AI_POLICY_INVALID`            | Não chama provider     |
| Payload vazio                               | `AI_PAYLOAD_EMPTY`             | Não chama provider     |
| Prompt acima do limite                      | `AI_PAYLOAD_TOO_LARGE`         | Não chama provider     |
| Timeout HTTP ou abort                       | `AI_PROVIDER_TIMEOUT`          | Sim, conforme política |
| HTTP 429                                    | `AI_PROVIDER_RATE_LIMITED`     | Sim, conforme política |
| HTTP 5xx                                    | `AI_PROVIDER_UNAVAILABLE`      | Sim, conforme política |
| HTTP 4xx restante                           | `AI_PROVIDER_ERROR`            | Não                    |
| JSON, envelope ou schema da tarefa inválido | `AI_PROVIDER_INVALID_RESPONSE` | Não                    |
| Falha genérica esgotada                     | `AI_PROVIDER_ERROR`            | Conforme política      |

## Logs e health check

Eventos seguros mantêm o código estável `AI_PROVIDER_CALL_FAILED` para compatibilidade com consumidores existentes. O motivo tipado fica em `failureCode`, por exemplo `AI_PROVIDER_TIMEOUT` ou `AI_PROVIDER_RATE_LIMITED`.

Eventos seguros podem conter somente provider, modelo, tarefa, correlation id, tentativa, duração, código, `failureCode` e resultado controlado. Prompt, campos, credencial, corpo bruto, resposta bruta e identificadores de organização ou perfil financeiro não fazem parte de `SafeAiLogEvent`.

`inspectAiProviderConfiguration` verifica apenas seleção, formato das variáveis, modelo e origem do endpoint. Ele não chama o fornecedor, não envia dados financeiros e não valida a credencial por rede.

## Custos e limites

Preços e capacidades do fornecedor variam com modelo e contrato do ambiente e não são congelados no código. Antes de habilitar um ambiente, revise o preço vigente e configure modelo, teto de saída, limite de corpo, timeout e retries por finalidade.

O executor limita `maxRetries` a cinco, produzindo no máximo seis tentativas por operação. Cada fluxo deve usar o menor número compatível com sua finalidade. Métricas agregadas de tokens, custo, orçamento e qualidade permanecem fora do recorte da issue #562.

## Testes e desenvolvimento local

A suíte usa `FakeAiProvider` e um cliente HTTP fake. Ela não acessa rede externa, não depende de credenciais e cobre:

- provider desativado por padrão;
- configuração válida, inválida e placeholder não executável;
- sucesso com uma chamada por tentativa e redirect automático bloqueado;
- timeout, rate limit, indisponibilidade e erro permanente;
- limite de retries antes da rede;
- resposta vazia, texto livre indevido ou schema inválido;
- validação estruturada de extração e categorização;
- revogação de consentimento antes da chamada;
- ausência de dados sensíveis em logs, erros e fixtures.

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
4. Fazer no máximo uma chamada externa por `complete` e bloquear redirects automáticos.
5. Aplicar timeout real e lançar `AiProviderError` com retry explícito.
6. Validar e normalizar a resposta antes de devolvê-la ao executor.
7. Vincular tarefas estruturadas ao validador discriminado e versionado do fluxo.
8. Nunca logar payload ou resposta bruta.
9. Cobrir o adapter com cliente fake e sem chamadas externas reais.
10. Registrar ADR quando a mudança criar dependência duradoura, custo relevante ou novo contrato operacional.

## Limitações conhecidas

- O provider real está disponível como infraestrutura, mas nenhum fluxo de produto é ativado automaticamente por esta entrega.
- A ativação produtiva depende de configuração protegida e revisão operacional de modelo, custo e limites.
- Telemetria agregada de custo e orçamento ainda não foi implementada.
- Fallbacks determinísticos dos fluxos existentes continuam independentes do provider real.
