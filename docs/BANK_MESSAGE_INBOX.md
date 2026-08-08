# Inbox de mensagens bancárias

## Objetivo

A Inbox recebe textos de mensagens bancárias fictícias ou autorizadas e cria uma sugestão financeira revisável. O fluxo tenta regras determinísticas primeiro e só consulta o provider de IA quando nenhuma regra produz uma extração suficiente. Regra parcial não encerra o fluxo se ainda faltar estrutura financeira necessária.

Nenhuma mensagem recebida cria lançamento final. Toda sugestão permanece em `PENDING_REVIEW` até decisão explícita na fila de revisão.

## Contrato de entrada

`POST /api/bank-message-inbox`

Campos aceitos:

- `text`: texto colado ou compartilhado;
- `origin`: `pasted` ou `shared`, com padrão `pasted`;
- `consentAccepted`: deve ser `true` antes de qualquer processamento;
- `accountId`: conta proposta opcional;
- `categoryId`: categoria proposta opcional.

A API exige sessão, organização e perfil financeiro resolvidos. Conta e categoria são validadas por formato, tenant, perfil e estado ativo antes de chamada ao provider ou persistência. Recurso inválido ou de outro contexto retorna erro controlado sem enumeração.

## Consentimento autoritativo

O aceite registra transições tenant-scoped para `bank_message_processing` e `ai_processing` na trilha append-only `SecurityAuditEvent`. O estado atual é derivado do evento mais recente por usuário, organização e perfil.

Imediatamente antes de cada tentativa externa, o backend revalida sessão, usuário, organização, perfil e o estado persistido das duas finalidades. Estado ausente, revogado ou não revalidável bloqueia a chamada de forma fail-closed. Revogação entre tentativas impede o retry antes de alcançar o provider.

## Ordem de extração

1. Normalizar o texto apenas em memória e gerar referência mascarada local.
2. Executar regras determinísticas para compras com cartão e Pix.
3. Encerrar sem IA somente quando a regra produzir sugestão estruturada suficiente.
4. Selecionar o provider configurado quando necessário.
5. Revalidar autenticação, tenant, perfil e consentimento imediatamente antes de cada tentativa.
6. Produzir representação outbound minimizada apenas com sinais financeiros necessários.
7. Enviar somente o campo allowlisted `message`; o prompt é constante e não repete a mensagem.
8. Validar a resposta pelo schema canônico.
9. Compor o payload persistente apenas com dados confiáveis do produto.

Uma tentativa do executor produz no máximo uma chamada outbound. Retry, timeout e classificação de falhas pertencem ao executor comum de `@solverfin/ai`.

## Payload e proveniência

A saída válida é convertida para `AiSuggestion.payload` V2 com valor minoritário, moeda, data, tipo, direção, descrição segura, conta/categoria opcionais já validadas, confiança, motivos, origem, `sourceHash`, fingerprint e auditoria.

A descrição vem somente do `merchant` estruturado; quando ausente, usa `Mensagem bancária mascarada`. O texto bruto ou mascarado da mensagem nunca é reutilizado como descrição. Receitas usam `inflow`, despesas `outflow`; transferência só produz payload financeiro quando a direção é segura.

Pistas textuais de conta, cartão e categoria aparecem apenas como motivos mascarados para revisão e nunca viram IDs internos. `maskedText` e `diagnosticMessage` continuam campos separados.

## Categorização após a extração

Uma `transaction_extraction` sem categoria pode seguir pelo pipeline comum: regra explícita, correção confirmada, histórico, IA autorizada e revisão manual. O resultado é uma `categorization` V1 vinculada por `sourceSuggestionId` e fingerprint.

A origem é apresentada como **regra**, **correção anterior**, **histórico**, **IA** ou **revisão manual**. Categoria arquivada, conflito de aprendizado, provider indisponível ou evidência insuficiente nunca escolhem categoria silenciosamente. Consulte `docs/ai/category-learning.md`.

## Revisão na fila unificada

Extrações de mensagens e suas categorizações participam da mesma fila documentada em `docs/AI_REVIEW_QUEUE.md`, junto com importações, duplicidades, conciliações e insights.

A Inbox oferece filtros por tipo, estado e confiança, preservados na URL junto do `profileId`. O detalhe mostra origem, confiança, motivos e proposta sem usar IDs técnicos como rótulo. `transaction_extraction` permite corrigir somente os campos financeiros autorizados; `categorization` permite alterar apenas a categoria proposta.

Antes de aprovar, rejeitar ou editar, a interface lê o payload atual e envia `expectedFingerprint`. O backend bloqueia a sugestão e revalida tenant, perfil, versão e elegibilidade. Conflito entre abas/sessões, origem obsoleta ou item já resolvido retorna erro controlado sem efeito parcial.

Aprovar uma extração usa o contrato existente de criação/vinculação de lançamento. Aprovar categorização aplica a categoria à extração ainda pendente ou ao lançamento elegível. A mesma decisão repetida retorna o estado persistido quando idempotente. Auditoria recebe ator, data, ação, mudanças redigidas e o `correlationId` da requisição.

## Estados exibidos

A listagem da Inbox continua expondo:

- `extractionSource`: `deterministic`, `ai` ou `none`;
- `extractionState`: `processing`, `ready_for_review`, `low_confidence`, `incomplete` ou `temporarily_unavailable`;
- `retryable`;
- `reviewReasons` seguros.

`processing` representa lote já reivindicado por outra requisição e nunca é apresentado como pronto sem sugestão. A UI diferencia regra determinística, IA, baixa confiança, extração incompleta e indisponibilidade temporária.

Quando `retryable=true`, **Tentar novamente** reabre o formulário. Como o texto bruto não é armazenado, ele precisa ser colado novamente e autorizado.

## Fallbacks

- provider desativado: diagnóstico/revisão sem sugestão inventada;
- regra parcial sem provider: diagnóstico incompleto, sem pronto para revisão;
- consentimento ausente/revogado: zero chamadas outbound;
- timeout/rate limit/indisponibilidade: lote `FAILED` e retry permitido;
- resposta inválida/incompleta: sem efeito financeiro;
- baixa confiança com estrutura válida: sugestão `PENDING_REVIEW` com aviso;
- `unknown` ou transferência sem direção: sem payload financeiro;
- transferência com direção segura: V2 revisável;
- ausência de `merchant`: descrição genérica fixa;
- categorização sem evidência: revisão manual sem categoria inventada.

## Idempotência e concorrência

`sourceHash` inclui organização, perfil e texto normalizado. A unicidade de `ImportBatch` garante no máximo um lote por hash contextual. A criação usa `INSERT ... ON CONFLICT DO NOTHING`; só a requisição que cria ou reivindica um lote `FAILED` consulta provider.

Concorrência não cria sugestões duplicadas nem multiplica chamadas outbound. Consentimento usa lock transacional por usuário/contexto. Categorização usa fingerprint da origem e versão da decisão; mudanças relevantes podem gerar nova candidatura e expirar somente a anterior ainda pendente.

A fila de revisão acrescenta lock da própria sugestão e decisão versionada, fazendo chamadas concorrentes convergirem para o estado já persistido ou para conflito controlado.

## Retenção, logs e auditoria

O texto bruto existe somente durante a requisição. Não é persistido em `ImportBatch`, `AiSuggestion`, auditoria ou logs. Também não são persistidos prompt, resposta bruta do provider, credenciais ou segredos.

Persistem apenas hash contextual, referência mascarada não reversível, diagnóstico seguro, payload estruturado validado, transições de consentimento sem dados financeiros e auditoria redigida. Aprendizado de categoria guarda somente padrão normalizado necessário, categoria, confiança, contagem e timestamps; seu evento de auditoria não contém descrição financeira.

## Endpoints

- `GET /api/bank-message-inbox?status=all`;
- `POST /api/bank-message-inbox`;
- `POST /api/bank-message-inbox/:messageId/discard`;
- revisão compartilhada em `/api/ai-review-queue`.

## Configuração e rollout

O provider permanece desativado por padrão. Para ativar IA, use as variáveis protegidas de `docs/ai/providers.md`. Sem provider, regras determinísticas, aprendizado local, histórico e revisão manual continuam operacionais.

## Validação

Cobertura esperada:

```bash
npm run test --workspace @solverfin/ai
npm run test --workspace @solverfin/api
npm run test:integration --workspace @solverfin/api
npm run test --workspace @solverfin/web
npm run typecheck --workspace @solverfin/api
npm run typecheck --workspace @solverfin/web
npm run lint --workspace @solverfin/api
npm run lint --workspace @solverfin/web
npm run validate
```

As suítes usam providers fake e fixtures fictícias. Os controles existentes continuam cobrindo minimização outbound, concorrência do provider, revogação entre tentativas, transferências dirigidas/ambíguas e privacidade. A fila unificada acrescenta contrato web para filtros/diálogo/foco e integração de versão, edição e decisão tipada.
