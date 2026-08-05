# Inbox de mensagens bancárias

## Objetivo

A Inbox recebe textos de mensagens bancárias fictícias ou autorizadas e cria uma sugestão financeira revisável. O fluxo tenta regras determinísticas primeiro e só consulta o provider de IA quando nenhuma regra produz uma extração suficiente.

Nenhuma mensagem recebida cria lançamento final. Toda sugestão permanece em `PENDING_REVIEW` até aprovação explícita na fila de revisão.

## Contrato de entrada

`POST /api/bank-message-inbox`

Campos aceitos:

- `text`: texto colado ou compartilhado;
- `origin`: `pasted` ou `shared`; quando omitido, usa `pasted`;
- `consentAccepted`: deve ser `true` antes de qualquer processamento;
- `accountId`: conta proposta opcional;
- `categoryId`: categoria proposta opcional.

A API exige sessão, organização e perfil financeiro resolvidos. `accountId` e `categoryId` são validados por formato, organização, perfil e estado ativo antes de qualquer chamada ao provider ou persistência da sugestão. IDs inválidos ou de outro tenant retornam erro controlado sem enumerar recursos.

## Ordem de extração

1. Normalizar e mascarar o texto apenas em memória.
2. Executar regras determinísticas para compras com cartão e Pix.
3. Quando nenhuma regra for suficiente, selecionar o provider configurado.
4. Revalidar o consentimento imediatamente antes de cada tentativa.
5. Enviar somente o campo `message`, com mascaramento e allowlist da tarefa `extraction`.
6. Validar a resposta pelo schema canônico de extração.
7. Compor o payload persistente com dados confiáveis do produto.

Uma tentativa do executor produz no máximo uma chamada outbound. Retry, timeout e classificação de falhas pertencem ao executor comum de `@solverfin/ai`.

## Payload e proveniência

A saída válida é convertida para `AiSuggestion.payload` canônico V2:

- valor em unidade minoritária, moeda, data, tipo e direção;
- descrição derivada do estabelecimento ou do texto mascarado;
- conta e categoria opcionais já validadas no tenant;
- confiança e motivos seguros;
- origem `rule` com `ruleId`, ou `provider` com provider e modelo;
- `sourceHash`, fingerprint e auditoria.

Pistas de conta, cartão e categoria produzidas pelo parser são preservadas apenas como motivos mascarados para revisão. Elas nunca são tratadas como IDs internos.

`origin=pasted|shared` continua registrado no lote da Inbox e é devolvido pela API.

## Estados exibidos

A resposta e a listagem da Inbox incluem:

- `extractionSource`: `deterministic`, `ai` ou `none`;
- `extractionState`: `ready_for_review`, `low_confidence`, `incomplete` ou `temporarily_unavailable`;
- `retryable`: informa se o mesmo texto pode ser reenviado para nova tentativa;
- `reviewReasons`: motivos seguros para orientar a revisão.

A tela existente exibe a mensagem contextual em `maskedText`, diferenciando extração determinística, extração assistida por IA, baixa confiança e indisponibilidade temporária.

## Fallbacks

| Situação | Resultado |
| --- | --- |
| Provider desativado ou sem configuração | lote em revisão, sem chamada externa e sem sugestão inventada |
| Consentimento ausente ou revogado | IA bloqueada, diagnóstico controlado e zero chamadas outbound |
| Timeout, rate limit ou indisponibilidade | lote `FAILED`, `retryable=true` e orientação para reenviar a mesma mensagem |
| Resposta inválida ou incompleta | lote em revisão, sem efeito financeiro |
| Baixa confiança com estrutura válida | sugestão persistida em `PENDING_REVIEW` e aviso para revisar todos os campos |
| Tipo `unknown` ou transferência sem direção confiável | diagnóstico controlado, sem payload financeiro persistido |

Ao reenviar exatamente a mesma mensagem após falha temporária, o serviço reutiliza o mesmo `ImportBatch` e tenta processá-lo novamente.

## Idempotência e concorrência

`sourceHash` inclui organização, perfil financeiro e texto normalizado. A constraint única de `ImportBatch` garante no máximo um lote por hash contextual.

A criação usa `INSERT ... ON CONFLICT DO NOTHING`. Somente a requisição que cria ou reivindica um lote `FAILED` consulta o provider. Requisições concorrentes retornam o lote já existente e não criam sugestões duplicadas.

## Retenção, logs e auditoria

O texto bruto existe apenas durante a requisição. Não é persistido em `ImportBatch`, `AiSuggestion`, auditoria ou logs.

Também não são persistidos:

- prompt enviado ao provider;
- resposta bruta do provider;
- credencial ou configuração secreta;
- identificadores de tenant nos eventos seguros do provider.

Persistimos apenas hash contextual, diagnóstico seguro, payload estruturado validado e auditoria redigida.

## Endpoints

- `GET /api/bank-message-inbox?status=all`: lista mensagens do perfil ativo com estado da extração;
- `POST /api/bank-message-inbox`: registra e processa uma mensagem autorizada;
- `POST /api/bank-message-inbox/:messageId/discard`: descarta o lote e expira sugestão pendente quando aplicável.

## Configuração e rollout

O provider permanece desativado por padrão. Para ativar IA, configure as variáveis protegidas descritas em `docs/ai/providers.md`. A ativação deve ocorrer por ambiente, com modelo, timeout, limite de saída e orçamento revisados.

Sem provider configurado, o fluxo determinístico e a revisão manual continuam operacionais.

## Validação

Cobertura esperada:

```bash
npm run test --workspace @solverfin/api
npm run test:integration --workspace @solverfin/api
npm run typecheck --workspace @solverfin/api
npm run lint --workspace @solverfin/api
npm run validate
```

As suítes usam providers fake e fixtures fictícias; não acessam IA real nem dependem de segredo.
