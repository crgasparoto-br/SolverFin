# Inbox de mensagens bancárias

## Objetivo

A Inbox recebe textos de mensagens bancárias fictícias ou autorizadas e cria uma sugestão financeira revisável. O fluxo tenta regras determinísticas primeiro e só consulta o provider de IA quando nenhuma regra produz uma extração suficiente. Uma regra que reconhece apenas parte da mensagem, mas não produz sugestão estruturada, não encerra o fluxo: a IA ainda pode completar os campos quando estiver autorizada e configurada.

Nenhuma mensagem recebida cria lançamento final. Toda sugestão permanece em `PENDING_REVIEW` até aprovação explícita na fila de revisão.

Depois que uma `transaction_extraction` estruturada é criada, sua origem deixa de importar para o detector de duplicidade/conciliação: regra local e provider usam exatamente o mesmo motor determinístico generalizado da Inbox.

## Contrato de entrada

`POST /api/bank-message-inbox`

Campos aceitos:

- `text`: texto colado ou compartilhado;
- `origin`: `pasted` ou `shared`; quando omitido, usa `pasted`;
- `consentAccepted`: deve ser `true` antes de qualquer processamento;
- `accountId`: conta proposta opcional;
- `categoryId`: categoria proposta opcional.

A API exige sessão, organização e perfil financeiro resolvidos. `accountId` e `categoryId` são validados por formato, organização, perfil e estado ativo antes de qualquer chamada ao provider ou persistência da sugestão. IDs inválidos ou de outro tenant retornam erro controlado sem enumerar recursos.

## Consentimento autoritativo

O checkbox do formulário é a decisão explícita que inicia o fluxo, mas não é usado como snapshot permanente para autorizar retries. Ao receber o aceite, o backend registra transições tenant-scoped para as finalidades `bank_message_processing` e `ai_processing` na trilha append-only `SecurityAuditEvent`.

O estado atual é derivado do evento mais recente de cada finalidade para o mesmo usuário, organização e perfil. Gravações usam lock transacional por contexto e não repetem uma transição já efetiva.

Imediatamente antes de cada tentativa externa, o resolvedor produtivo revalida:

1. sessão e usuário atuais;
2. organização e perfil financeiro esperados;
3. estado persistido mais recente das duas finalidades.

Estado ausente, revogado ou falha de revalidação bloqueia a chamada de forma fail-closed. Se a revogação ocorrer depois da primeira tentativa e antes de um retry, a próxima tentativa é bloqueada e não alcança o provider.

## Ordem de extração

1. Normalizar o texto apenas em memória e gerar a referência mascarada local.
2. Executar regras determinísticas para compras com cartão e Pix.
3. Encerrar sem IA somente quando a regra produzir uma sugestão estruturada; regra parcial continua para o provider.
4. Quando a regra não for suficiente, selecionar o provider configurado.
5. Revalidar autenticação, organização, perfil e consentimento persistido imediatamente antes de cada tentativa.
6. Produzir uma representação outbound minimizada que preserve apenas sinais financeiros necessários, como operação, valor e data. Nomes, contrapartes, finalidades, e-mails, links e palavras livres são substituídos por marcadores redigidos.
7. Enviar a representação minimizada somente no campo allowlisted `message`. O prompt é constante e não contém nem repete o texto da mensagem.
8. Validar a resposta pelo schema canônico de extração.
9. Compor o payload persistente com dados confiáveis do produto.

Uma tentativa do executor produz no máximo uma chamada outbound. Retry, timeout e classificação de falhas pertencem ao executor comum de `@solverfin/ai`.

## Payload e proveniência

A saída válida é convertida para `AiSuggestion.payload` canônico V2:

- valor em unidade minoritária, moeda, data, tipo e direção;
- descrição derivada exclusivamente do estabelecimento estruturado; quando o provider não informa `merchant`, usa-se o texto fixo `Mensagem bancária mascarada`;
- conta e categoria opcionais já validadas no tenant;
- confiança e motivos seguros;
- origem `rule` com `ruleId`, ou `provider` com provider e modelo;
- `sourceHash`, fingerprint e auditoria.

Receitas recebem direção `inflow` e despesas recebem `outflow` quando o provider não a informa. Transferências precisam declarar `direction=inflow|outflow`. Uma transferência dirigida pode gerar sugestão V2 revisável; uma transferência ambígua não gera payload financeiro.

O texto mascarado da mensagem nunca é usado como fallback para `payload.description`. Essa separação impede que nomes, contrapartes, finalidades ou trechos não reconhecidos da mensagem sejam retidos quando o provider devolve uma estrutura válida sem estabelecimento.

Pistas de conta, cartão e categoria produzidas pelo parser são preservadas apenas como motivos mascarados para revisão. Elas nunca são tratadas como IDs internos.

`origin=pasted|shared` continua registrado no lote da Inbox e é devolvido pela API.

A resposta mantém campos distintos:

- `maskedText`: referência mascarada estável do lote, sem conteúdo bruto da mensagem e nunca substituída pelo diagnóstico;
- `diagnosticMessage`: texto seguro que explica o estado da extração.

## Categorização após a extração

Uma `transaction_extraction` sem categoria pode ser processada pela categorização inteligente comum a todas as origens. A ordem é regra explícita, correção confirmada, histórico do perfil, IA e, por último, revisão manual. O resultado é outra sugestão `categorization` V1 vinculada à extração por `sourceSuggestionId` e fingerprint.

A Inbox mostra a origem da candidatura como **regra**, **correção anterior**, **histórico**, **IA** ou **revisão manual**. Em extrações de mensagem, a ação **Corrigir e aprovar** permite selecionar outra categoria ativa e compatível. A aprovação e o registro do aprendizado acontecem na mesma transação; se a aprovação falhar, o aprendizado não fica órfão.

Aprendizados conflitantes, categoria arquivada, provider indisponível ou evidência insuficiente nunca escolhem silenciosamente uma categoria. O usuário continua com uma revisão explícita. Detalhes estão em `docs/ai/category-learning.md`.

## Deduplicação e conciliação depois da extração

Toda extração estruturada pendente da mensagem participa da mesma varredura executada pela fila unificada. O detector usa somente o payload canônico e a versão observada da sugestão.

A comparação considera valor, moeda, data, conta, identificador externo quando houver e descrição como evidência complementar. Para transferências, o par de contas é obrigatório; a mesma descrição com outra conta de destino não gera candidato.

As candidaturas `deduplication` e `reconciliation` registram vínculo explícito com `sourceSuggestionId`, `sourcePayloadFingerprint` e `targetTransactionId`. Varreduras repetidas ou concorrentes não multiplicam candidatos equivalentes.

Se a extração for editada, o lote/mensagem deixar de estar em revisão ou o lançamento comparado mudar, a candidatura antiga fica obsoleta e não pode ser aprovada. A varredura seguinte expira o item antigo e pode criar uma candidatura correspondente à nova versão se a evidência continuar válida.

Aprovar duplicidade rejeita a extração como duplicada sem criar nem alterar lançamento. Aprovar conciliação revalida e concilia o alvo, aprova/vincula a extração, expira candidaturas irmãs e atualiza o lote na mesma transação.

## Revisão na fila unificada

Extrações de mensagens, suas categorizações e candidaturas determinísticas participam da fila unificada documentada em `docs/AI_REVIEW_QUEUE.md`, junto com importações e insights.

A Inbox oferece filtros por tipo, estado e confiança e preserva esses filtros na URL junto de `profileId`. O resumo da fila não devolve referências internas desnecessárias; o detalhe autenticado recebe somente os identificadores tenant-scoped necessários para preencher controles e os apresenta como nomes/rótulos.

Antes de aprovar, rejeitar ou editar, a interface lê o payload atual e envia `expectedFingerprint`. O backend bloqueia a sugestão e revalida tenant, perfil, versão, origem e elegibilidade do alvo.

Aprovação, rejeição e edição usam a fachada transacional comum da fila. Repetições convergem para o estado persistido quando idempotentes, decisões concorrentes opostas terminam em uma decisão e um conflito controlado, e origem descartada ou versão obsoleta não deixa efeito parcial.

## Estados exibidos

A resposta e a listagem da Inbox incluem:

- `extractionSource`: `deterministic`, `ai` ou `none`;
- `extractionState`: `processing`, `ready_for_review`, `low_confidence`, `incomplete` ou `temporarily_unavailable`;
- `retryable`: informa se o mesmo texto pode ser reenviado para nova tentativa;
- `reviewReasons`: motivos seguros para orientar a revisão.

`processing` representa um lote já reivindicado por outra requisição que ainda não concluiu a extração. Esse estado nunca é apresentado como pronto para revisão sem sugestão.

A tela diferencia processamento, regra determinística, extração assistida por IA, baixa confiança, extração incompleta e indisponibilidade temporária. Os motivos seguros ficam disponíveis em um controle expansível.

Quando `retryable=true`, a ação **Tentar novamente** reabre o formulário de mensagem. Como o texto bruto não é armazenado, a interface nunca tenta recuperá-lo ou preencher o campo automaticamente: o usuário deve colar novamente a mesma mensagem e confirmar a autorização. O mesmo hash contextual reivindica novamente o lote `FAILED` existente.

## Fallbacks

- **Provider desativado ou sem configuração:** lote em revisão, sem chamada externa e sem sugestão inventada.
- **Regra parcial sem provider disponível:** diagnóstico determinístico incompleto, sem marcar o lote como pronto.
- **Consentimento ausente, revogado ou não revalidável:** IA bloqueada, diagnóstico controlado e zero chamadas outbound.
- **Revogação entre tentativas:** o retry é interrompido antes do provider.
- **Timeout, rate limit ou indisponibilidade:** lote `FAILED`, `retryable=true` e ação para reenviar a mesma mensagem.
- **Resposta inválida ou incompleta:** lote em revisão, sem efeito financeiro.
- **Baixa confiança com estrutura válida:** sugestão em `PENDING_REVIEW` e aviso para revisar todos os campos.
- **Tipo `unknown` ou transferência sem direção:** diagnóstico controlado, sem payload financeiro persistido.
- **Transferência com direção segura:** sugestão V2 em revisão, sem lançamento automático.
- **Estrutura válida sem `merchant`:** sugestão revisável com descrição genérica fixa, sem reutilizar qualquer trecho da mensagem.
- **Categorização sem evidência/provider:** candidatura de revisão manual, sem categoria inventada e sem efeito financeiro.
- **Detector determinístico sem evidência suficiente:** nenhuma candidatura é inventada; a extração permanece na revisão normal.

## Idempotência e concorrência

`sourceHash` inclui organização, perfil financeiro e texto normalizado. A constraint única de `ImportBatch` garante no máximo um lote por hash contextual.

A criação usa `INSERT ... ON CONFLICT DO NOTHING`. Somente a requisição que cria ou reivindica um lote `FAILED` consulta o provider. Uma requisição concorrente que encontra o lote ainda em `REVIEWING` retorna o mesmo identificador com `extractionState=processing`; depois da conclusão, novas leituras devolvem o diagnóstico e a sugestão persistidos.

Requisições concorrentes não criam sugestões de extração duplicadas e não multiplicam chamadas ao provider. A varredura determinística posterior possui sua própria identidade tenant-scoped e também converge sob chamadas simultâneas da fila.

O registro de consentimento usa lock transacional separado por usuário e contexto. Aceites concorrentes convergem para o mesmo estado efetivo sem regravar proveniência quando as duas finalidades já estão concedidas.

A categorização usa fingerprint da origem e versão da decisão. A mesma sugestão, com a mesma base de regras/aprendizado/histórico, não cria uma segunda candidatura; mudanças relevantes podem gerar nova candidatura e expirar apenas a anterior ainda pendente.

## Retenção, logs e auditoria

O texto bruto existe apenas durante a requisição. Não é persistido em `ImportBatch`, `AiSuggestion`, auditoria ou logs.

Uma referência mascarada derivada apenas do `sourceHash` pode ser persistida junto ao diagnóstico seguro para manter o contrato visual e associar a linha da Inbox. Ela não contém o texto original, estabelecimento, valor, documento ou outra parte da mensagem. O diagnóstico permanece em campo separado.

A descrição da sugestão usa somente o `merchant` estruturado e sanitizado ou o fallback genérico fixo. Não existe fallback derivado do texto bruto ou mascarado da mensagem.

Também não são persistidos:

- prompt enviado ao provider;
- resposta bruta do provider;
- credencial ou configuração secreta;
- identificadores de tenant nos eventos seguros do provider.

Persistimos apenas hash contextual, referência mascarada não reversível, diagnóstico seguro, payload estruturado validado, transições de consentimento sem dados financeiros e auditoria redigida. A deduplicação/conciliação usa somente essa estrutura já autorizada e não reabre o conteúdo bruto.

## Endpoints

- `GET /api/bank-message-inbox?status=all`: lista mensagens do perfil ativo com estado da extração;
- `POST /api/bank-message-inbox`: registra consentimento atual e processa uma mensagem autorizada;
- `POST /api/bank-message-inbox/:messageId/discard`: descarta o lote e torna candidaturas dependentes obsoletas;
- revisão compartilhada em `/api/ai-review-queue`.

## Configuração e rollout

O provider permanece desativado por padrão. Para ativar IA, configure as variáveis protegidas descritas em `docs/ai/providers.md`. A ativação deve ocorrer por ambiente, com modelo, timeout, limite de saída e orçamento revisados.

Sem provider configurado, o fluxo determinístico, o aprendizado local, o histórico, a deduplicação/conciliação estruturada e a revisão manual continuam operacionais.

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

As suítes usam providers fake e fixtures fictícias; não acessam IA real nem dependem de segredo. Os controles existentes continuam cobrindo minimização outbound, concorrência do provider, revogação tardia, transferência dirigida e privacidade.

A issue #566 acrescenta cobertura do mesmo scanner determinístico para mensagem bancária por regra/provider, CSV, OFX e IA, além de idempotência concorrente, isolamento, obsolescência, regra de transferência e rollback.
