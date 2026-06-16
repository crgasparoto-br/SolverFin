# Politica de provedores de IA

**Issue:** #51
**Status:** base tecnica inicial para providers substituiveis, testes com fake provider e
politicas de uso seguro.

## Objetivo

O pacote `@solverfin/ai` centraliza a chamada a provedores de IA para manter o
dominio financeiro desacoplado de fornecedores, modelos e prompts especificos.

A regra inicial e simples: nenhum fluxo deve chamar IA sem consentimento ativo,
proposito declarado, payload minimizado e logs seguros.

## Superficie publica inicial

O pacote exporta:

- `AiProvider`: contrato substituivel para providers reais ou fake.
- `FakeAiProvider`: provider deterministico para testes.
- `runAiTask`: orquestra consentimento, sanitizacao, retry e chamada ao provider.
- `sanitizeAiPayload`: remove campos nao permitidos e mascara identificadores
  sensiveis.
- `maskSensitiveText`: mascara documentos, cartoes e numeros longos.
- `defaultAiUsagePolicy`: politica-base que deve ser especializada por
  finalidade.

Tarefas suportadas no contrato inicial:

- `extraction`: extrair sugestoes de lancamento.
- `classification`: sugerir categorias ou classificacoes.
- `summary`: resumir dados agregados.
- `assistant`: responder perguntas financeiras autorizadas.

## Politica obrigatoria por chamada

Cada chamada deve informar:

| Campo                      | Uso                                                                            |
| -------------------------- | ------------------------------------------------------------------------------ |
| `consent`                  | Deve estar como `granted`; valores `missing` ou `revoked` bloqueiam a chamada. |
| `purpose`                  | Explica a finalidade, como `transaction extraction review`.                    |
| `maxPromptChars`           | Limita tamanho do prompt sanitizado.                                           |
| `maxRetries`               | Define novas tentativas apos falha controlada do provider.                     |
| `timeoutMs`                | Informa o limite operacional esperado para o provider concreto.                |
| `allowRawFinancialText`    | Deve ficar `false` por padrao; `true` exige justificativa especifica.          |
| `allowedFieldNames`        | Lista positiva recomendada para cada finalidade.                               |
| `blockedFieldNamePatterns` | Lista de padroes bloqueados quando nao houver lista positiva.                  |

## Minimizacao e mascaramento

A chamada deve enviar apenas dados necessarios para a finalidade.

Regras iniciais:

- campos fora de `allowedFieldNames` sao omitidos;
- campos com nomes de conta, cartao, documento, payload bruto, mensagem bruta,
  token ou segredo sao bloqueados pela politica padrao;
- documentos ficticios no formato CPF sao substituidos por `***documento***`;
- cartoes de 16 digitos sao substituidos por `**** **** **** ****`;
- numeros longos preservam apenas os ultimos 4 digitos;
- logs recebem apenas metadados seguros, como provider, modelo, task, tenant e
  correlation id.

## Timeouts, retries e erros

`runAiTask` trata:

- falta de consentimento: retorna `AI_CONSENT_REQUIRED` sem chamar provider;
- payload vazio: retorna `AI_PAYLOAD_EMPTY`;
- payload maior que o limite: retorna `AI_PAYLOAD_TOO_LARGE`;
- erro temporario do provider: tenta novamente conforme `maxRetries`;
- resposta sem texto utilizavel: retorna `AI_PROVIDER_INVALID_RESPONSE`;
- falha final do provider: retorna `AI_PROVIDER_ERROR`.

O timeout real deve ser aplicado pelo provider concreto. A abstracao ja propaga
`timeoutMs` em `SafeAiProviderRequest` para manter o contrato testavel sem
acoplar o pacote a runtime, HTTP client ou SDK especifico.

## Como adicionar um provider real

1. Criar uma classe que implemente `AiProvider`.
2. Receber configuracao por ambiente seguro, sem hardcode de tokens.
3. Converter `SafeAiProviderRequest` para o formato do SDK/API externo.
4. Respeitar `timeoutMs` e retornar erro controlado quando o limite estourar.
5. Nunca logar `prompt`, `fields` ou resposta bruta do provider.
6. Cobrir o provider com testes usando payload ficticio e sem chamadas externas
   reais.
7. Registrar ADR se o provider criar dependencia duradoura, custo relevante ou
   mudanca arquitetural.

## Exemplo de uso em teste

```ts
const provider = new FakeAiProvider([{ text: "Sugestao criada", confidence: 0.9 }]);
const result = await runAiTask({
  provider,
  task: "classification",
  context,
  policy: {
    ...defaultAiUsagePolicy,
    consent: "granted",
    purpose: "category suggestion review",
    allowedFieldNames: ["merchant", "amountMinor", "currency"],
  },
  payload: {
    prompt: "Classifique a compra ficticia.",
    fields: { merchant: "Mercado Demo", amountMinor: 1500, currency: "BRL" },
  },
});
```

## Limitacoes conhecidas

- O pacote ainda nao escolhe provider real.
- Schemas finais de extracao ficam para a issue #52.
- Parser de mensagens e fallback por regras ficam para a issue #53.
- Modelo completo de consentimento fica para a issue #61; ate la, o fluxo recebe
  o estado de consentimento como entrada.
- Mascaramento amplo entre backend e frontend fica para a issue #62.

## Validacao

Validacoes esperadas para mudancas neste pacote:

```bash
npm run test --workspace @solverfin/ai
npm run typecheck --workspace @solverfin/ai
npm run lint --workspace @solverfin/ai
npm run validate
```

Use apenas fixtures ficticias. Nao inclua mensagens bancarias, cartoes,
documentos, tokens ou payloads reais em testes, logs ou exemplos.
