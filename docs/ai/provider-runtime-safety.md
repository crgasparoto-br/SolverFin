# Controles de segurança do executor de IA

**Issue:** #562

Este documento complementa a política geral em `providers.md` com os controles aplicados pelo
executor comum e pelo adapter OpenAI após a auditoria da integração inicial.

## Limite de tentativas

`AiUsagePolicy.maxRetries` aceita somente inteiros entre `0` e `5`.

Valores negativos, fracionários ou acima do limite retornam `AI_POLICY_INVALID` antes da
sanitização e sem chamada ao provider. O total máximo é de seis tentativas por operação.

## Revalidacao obrigatoria de consentimento

A autorizacao do outbound usa dois gates cumulativos e fail-closed:

1. o snapshot em `AiUsagePolicy.consent` precisa estar como `granted` antes de sanitizar ou
   preparar o payload;
2. todo consumidor capaz de alcancar um provider deve receber um resolvedor autoritativo de
   consentimento, repassa-lo a `runAiTask` e obter `granted` imediatamente antes de cada
   tentativa externa.

Um snapshot estatico nao e suficiente para autorizar o outbound, mas estados `missing` ou
`revoked` continuam bloqueantes. Nesses estados, `runAiTask` retorna `AI_CONSENT_REQUIRED`
antes de consultar o resolvedor, sanitizar o payload ou chamar o provider.

A ausencia do resolvedor tambem bloqueia o consumidor antes da chamada. Quando o consentimento
e revogado entre o preparo e a tentativa, `runAiTask` observa o estado atual imediatamente
antes do provider e retorna `AI_CONSENT_REQUIRED`, com zero chamadas externas. Os testes do
executor e dos consumidores reais de extracao bancaria e assistente comprovam os gates do
snapshot, a ausencia do resolvedor e a revogacao tardia.

## Contratos estruturados

Toda resposta precisa conter texto não vazio e confiança entre `0` e `1`, quando informada.

- `extraction` exige `structured` compatível com `validateTransactionExtraction`.
- `classification` exige `structured` e um `validateStructuredResult` do fluxo consumidor.
- `summary` e `assistant` aceitam texto simples ou envelope com `text` e `confidence`, mas
  rejeitam qualquer campo `structured`.
- Qualquer tarefa que devolva `structured` precisa de um validador aplicável.
- Payload estruturado ausente, inválido ou sem validador retorna
  `AI_PROVIDER_INVALID_RESPONSE`.

O validador de classificação deve apontar para o contrato discriminado e versionado apropriado
entregue pela issue #561. O adapter faz o parsing do envelope externo, mas não substitui a
validação do contrato de produto.

## Uma chamada por tentativa

O adapter não possui retry interno. Cada chamada a `complete` executa no máximo uma requisição
HTTP e usa `redirect: "error"` para impedir que um redirecionamento automático crie uma segunda
requisição na mesma tentativa.

Timeout, `429` e indisponibilidade continuam sendo classificados como falhas temporárias. O
executor comum decide se haverá nova tentativa conforme a política validada.

## Configuração fechada

O valor `solverfin-ai-disabled-placeholder` existe apenas para o exemplo local desativado.
Quando `AI_PROVIDER=openai`, esse valor torna `AI_OPENAI_API_KEY` inválida e o health check
retorna `invalid`, sem realizar chamada externa e sem expor a credencial.

## Logs compatíveis e seguros

Falhas mantêm o evento estável `AI_PROVIDER_CALL_FAILED`. O motivo controlado fica em
`failureCode`, como `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_RATE_LIMITED` ou
`AI_PROVIDER_UNAVAILABLE`.

O evento não inclui prompt, campos, resposta, credencial nem identificadores de organização ou
perfil financeiro.

O logger é observabilidade best-effort. Exceções síncronas e rejeições assíncronas do logger são
contidas e não podem mudar o resultado funcional, iniciar retry, aumentar a contagem de chamadas
outbound ou escapar para o consumidor.

## Cobertura obrigatória

A suíte do pacote deve permanecer hermética e cobrir:

- política de retry inválida sem chamada ao provider;
- snapshots `revoked` e `missing` bloqueando mesmo quando o resolvedor retorna `granted`;
- ausência de resolvedor autoritativo nos consumidores sem chamada ao provider;
- revogacao entre preparo e outbound nos consumidores reais sem chamada ao provider;
- texto livre rejeitado em tarefas estruturadas;
- payload de extração validado pelo schema;
- categorização aceita somente com validador explícito;
- `summary` e `assistant` rejeitando `structured` e solicitando somente texto com confiança
  opcional;
- falha do logger em `started`, `completed`, `invalid_response` e `failed` sem alterar resultado,
  retry ou contagem outbound;
- rejeição assíncrona do logger sem `unhandled rejection` nem mudança funcional;
- redirect automático bloqueado;
- placeholder recusado quando o provider está habilitado;
- compatibilidade do evento de falha e ausência de dados sensíveis;
- fixtures sem números completos de cartão, credenciais ou dados reais.
