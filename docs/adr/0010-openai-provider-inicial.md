# ADR 0010 - Provider OpenAI inicial e substituivel

- **Status:** Aceito
- **Data:** 2026-08-05
- **Issue:** #562

## Contexto

O pacote `@solverfin/ai` ja define `AiProvider`, sanitizacao, consentimento, timeout e
retry, mas ainda nao possuia um adapter real. A integracao precisa permitir uso
controlado de IA sem acoplar o dominio financeiro a SDK, modelo, endpoint ou
credencial de um fornecedor.

## Decisao

Adotar OpenAI como primeiro provider real, acessado pelo endpoint HTTPS de Chat
Completions por HTTP nativo do Node. O adapter implementa `AiProvider` e nao usa SDK
de fornecedor.

A configuracao e exclusivamente ambiental:

- `AI_PROVIDER=disabled|openai`;
- `AI_OPENAI_ENDPOINT`;
- `AI_OPENAI_API_KEY`;
- `AI_OPENAI_MODEL`;
- `AI_OPENAI_MAX_OUTPUT_TOKENS`;
- `AI_OPENAI_MAX_REQUEST_BYTES`;
- `AI_OPENAI_REQUEST_TIMEOUT_MS`.

O exemplo versionado permanece com `AI_PROVIDER=disabled`. `gpt-5-mini` e apenas o
baseline inicial do exemplo por priorizar tarefas bem definidas, latencia e custo;
o modelo efetivo deve ser revisado e configurado por ambiente antes da ativacao.
Nenhum identificador de modelo fica embutido no adapter.

## Contrato operacional

- `runAiTask` continua sendo o unico executor de retry.
- Uma tentativa do executor produz no maximo uma chamada HTTP ao provider.
- Consentimento e revalidado imediatamente antes de cada tentativa.
- O provider recebe somente `SafeAiProviderRequest`, ja minimizado por finalidade e
  lista positiva de campos.
- O timeout efetivo e o menor valor entre a politica da chamada e o limite ambiental.
- `408`, `429` e `5xx` sao falhas temporarias; `4xx` restantes sao permanentes.
- Corpo vazio, JSON invalido, envelope invalido ou confianca fora de `0..1` sao
  respostas invalidas e nao geram retry.
- Logs podem conter somente provider, modelo, tarefa, correlation id, tentativa,
  duracao, codigo e resultado seguro. Prompt, campos, credencial e resposta bruta nao
  podem ser registrados.
- O health check e somente de configuracao. Ele nao envia dados financeiros nem faz
  chamada remota.

## Custos e limites

O provider cobra por uso de tokens e o custo varia conforme modelo e contrato do
ambiente. Por isso, valores monetarios do fornecedor nao sao congelados no codigo.
Antes de habilitar um ambiente, o responsavel deve revisar a tabela vigente e definir:

- modelo permitido;
- teto de saida em `AI_OPENAI_MAX_OUTPUT_TOKENS`;
- teto do corpo em `AI_OPENAI_MAX_REQUEST_BYTES`;
- timeout em `AI_OPENAI_REQUEST_TIMEOUT_MS`;
- `maxRetries` por finalidade na `AiUsagePolicy`.

Esses limites reduzem custo e exposicao por chamada, mas nao substituem metricas e
orcamentos agregados previstos para uma fase posterior.

## Alternativas consideradas

### SDK oficial do fornecedor

Rejeitado neste momento para evitar dependencia duradoura e permitir testes
hermeticos com um cliente HTTP minimo.

### Endpoint Responses API

Adiado. O contrato interno permanece independente e pode receber outro adapter sem
alterar o dominio. Chat Completions foi escolhido para o primeiro recorte por possuir
um envelope HTTP simples e suficiente para texto e payload estruturado inicial.

### Provider habilitado por padrao

Rejeitado. Local, testes e ambientes sem credencial devem continuar deterministas e
sem rede externa.

## Consequencias

- OpenAI pode ser habilitado sem alterar regras financeiras.
- Troca de endpoint/modelo e segura por ambiente, desde que o contrato do adapter seja
  preservado.
- Testes usam fake HTTP e `FakeAiProvider`; CI nao recebe segredo nem faz chamada real.
- Ativacao produtiva exige configuracao protegida, revisao de custo e validacao do
  modelo escolhido.
- Telemetria agregada de custo, budget e qualidade continua fora deste recorte.
