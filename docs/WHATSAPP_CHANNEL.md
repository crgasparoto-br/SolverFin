# Canal WhatsApp Meta Cloud API — issue #694

**Escopo:** integração de consulta somente leitura, captura revisável (#694) e confirmação explícita de propostas simples (#695). O canal não executa pagamentos, transferências, baixas, conciliações, edição, exclusão ou outras mutações. Confirmação e rejeição delegam à fila canônica de revisão; nenhum fluxo financeiro paralelo é permitido.

## Configuração operacional

Em um aplicativo Meta **dedicado** do produto, configure o produto WhatsApp Business Platform Cloud API, o WABA, o número comercial verificado e a assinatura do campo `messages`. Registre o callback HTTPS:

```text
GET/POST https://<API_HOST>/api/webhooks/whatsapp
```

Configure exclusivamente no gerenciador de segredos do ambiente, nunca no cliente/browser, `.env` commitado ou logs:

| Variável                        | Finalidade                                                     |
| ------------------------------- | -------------------------------------------------------------- |
| `WHATSAPP_META_APP_SECRET`      | App Secret para validar `X-Hub-Signature-256` dos bytes exatos |
| `WHATSAPP_META_VERIFY_TOKEN`    | Token da verificação GET `hub.mode=subscribe`                  |
| `WHATSAPP_META_PHONE_NUMBER_ID` | ID numérico do número remetente oficial                        |
| `WHATSAPP_META_ACCESS_TOKEN`    | Access token de sistema com escopo mínimo para Cloud API       |
| `WHATSAPP_META_GRAPH_VERSION`   | Versão Graph explícita, como `v25.0`, conforme suporte Meta    |

A verificação GET devolve o `hub.challenge` em texto puro somente após comparação segura com o token. A entrega POST exige assinatura HMAC-SHA256 constante no tempo sobre o corpo **bruto**; payload malformado/sem assinatura é rejeitado antes de qualquer leitura financeira ou escrita. Não usa cookie, bearer do app nem CORS para autenticar a Meta. Somente `phone_number_id` configurado é aceito. As APIs administrativas exigem sessão SolverFin e seguem a proteção de origem das mutações.

O provider HTTP é restrito a `https://graph.facebook.com/{versao}/{phone_number_id}/messages`, token bearer de ambiente e mensagem `text` sem URLs arbitrárias. Para destinatário telefônico utiliza `to`; para destinatário BSUID utiliza exclusivamente `recipient`, conforme o contrato da Meta. IDs `wamid` preservam seus caracteres originais, inclusive `+`, `/` e `=` de base64, com limites e validação de caracteres de controle. Sem configurações a entrada é fail-closed e não inicia processamento.

## Vínculo autenticado e consentimento

1. No **SolverFin autenticado**, selecionando explicitamente um perfil ativo, faça `POST /api/channels/whatsapp/pairings` com `{"profileId":"<UUID>"}`. A resposta retorna `pairing.id`, `pairing.code` (única exibição) e `pairing.expiresAt` (10 minutos).
2. Pelo WhatsApp do titular, envie **`VINCULAR <code>`** ao número comercial oficial. A mensagem precisa vir em webhook assinado. O código tem 192 bits aleatórios; o banco armazena somente seu SHA-256. O remetente fica associado **provisoriamente**, sem acesso a dados.
3. Volte ao SolverFin autenticado, com **o mesmo perfil explicitamente selecionado**, e faça `POST /api/channels/whatsapp/pairings/{id}/confirm?profileId=<UUID>`. Apenas então o vínculo se torna ativo e único por número oficial/remetente.
4. Consulte `GET /api/channels/whatsapp/links?profileId=<UUID>` (somente identificadores mascarados). Cancele o pareamento com `POST /api/channels/whatsapp/pairings/{id}/cancel?profileId=<UUID>` ou revogue imediatamente o vínculo com `POST /api/channels/whatsapp/links/{id}/revoke?profileId=<UUID>`.

A Meta também identifica usuários por **BSUID**, no formato `CC.<identificador>` (ou `CC.ENT.<identificador>` quando aplicável), com até 128 caracteres alfanuméricos após o prefixo. O webhook pode omitir `messages[].from` (telefone) ou enviá-lo como `""` ou `null` quando o número estiver oculto, informando somente o BSUID válido em `messages[].from_user_id`. Um `from` não vazio e malformado ou um BSUID conflitante continuam sendo recusados; sem BSUID válido, campos vazios ou nulos não identificam remetente. O canal utiliza o BSUID exato como identidade persistida **preferencialmente** quando presente; não substitui nem transforma BSUID em telefone, não confia em username e nunca infere vínculo entre identidades. Se o usuário tiver um vínculo histórico associado apenas ao número, precisará confirmar novo pareamento no aplicativo quando passar a usar exclusivamente BSUID. Os campos `senderId` do vínculo e do evento suportam até 160 caracteres.

O número de WhatsApp por si só **nunca** autentica um usuário. A verificação do vínculo ativo, do usuário ativo, da titularidade, do perfil ativo e da organização ocorre a cada entrada, antes de finalizar o resultado e novamente antes do outbound. Sem vínculo válido, perfil explicitamente confirmado ou em caso de revogação, o canal envia apenas orientação genérica. Dois perfis não são agregados ou selecionados por conveniência. A seleção explícita do perfil também é validada nas rotas de administração: perfis repetidos na URL ou valores divergentes entre URL e corpo são recusados antes de qualquer criação, listagem ou revogação de vínculo.

O consentimento de extração de mensagem bancária é exclusivo do SolverFin: `resolveBankMessageAiConsentForContext` deve retornar `granted`, obtido por ação autenticada na Inbox. O comando WhatsApp **não concede** consentimento. Revogação/ausência bloqueia a captura; o assistente determinístico continua independente de provedor IA e respeita as permissões de processamento atuais.

## Comandos do canal

- Perguntas financeiras em linguagem natural, ou `CONSULTAR <pergunta>`: delegadas ao `FinancialAssistantService` existente, com dados determinísticos por perfil/período/moeda. O resultado fora de escopo não executa comandos financeiros.
- `CAPTURAR <texto de notificação bancária>`: delega à **mesma** `createBankMessageInboxWithAiForContext` e seu parser determinístico/IA opcional; persiste `ImportBatch` do tipo `BANK_MESSAGE` (origem `whatsapp`) e, quando a extração é válida, uma `AiSuggestion` de `TRANSACTION_EXTRACTION` em `PENDING_REVIEW`. A aprovação/edição ocorre **exclusivamente** na Inbox/fila de revisão autenticada.
- `CANCELAR`: registra o desfecho `cancelled` do pedido recebido pelo canal, sem cancelar a conversa do Assistente compartilhada com a interface web nem alterar lançamentos. O encerramento da conversa canônica permanece no aplicativo autenticado.
- Outros formatos, mensagens sem texto e conta não vinculada: apenas resposta operacional segura. A mensagem nunca vira instrução SQL ou mutação automática.

A linguagem `CAPTURAR` é um comando de roteamento, **não um parser financeiro**; toda interpretação, deduplicação e sugestão permanece na fundação existente. Não há nova tabela de transações, cálculo de saldo ou aprovação automática.

## Persistência, concorrência e retentativas

A migração `20261113160000_whatsapp_channel_foundation` cria as tabelas, e `20261115100000_whatsapp_bsuid_sender_capacity` amplia `senderId` sem perder vínculos ou eventos existentes:

- `WhatsappChannelLink`: vínculo em duas etapas, tenant/perfil/usuário, ID do remetente verificado pelo provider, status/versão/validade, token somente em hash, revogação auditável.
- `WhatsappChannelEvent`: chave única `(provider,accountId,providerMessageId)`; resultado lógico, contexto exato, ID de conversa/sugestão/Inbox, estado de claim com lease e tentativa, resposta segura temporária antes do outbound.

Uma entrega `POST` em duplicidade ou uma segunda instância compete pelo mesmo claim: no máximo uma executa a consulta/captura; a chave de idempotência do Assistente deriva do ID do evento. Antes de enviar, a resposta segura é persistida como `response_ready`. Se o processo cair, a **mesma entrega POST assinada**, reentregue pela Meta, pode enviar o resultado sem refazer a operação lógica. Falha **antes** do resultado persistente devolve 503 para replay do webhook original, nunca dispara processamento por GET/health.

Em consultas, se o Assistente recuperar um turno interrompido como `FAILED` sem resposta, o mesmo POST assinado termina com uma única orientação genérica (`query_incomplete`), sem recalcular sob a mesma chave nem entrar em um loop de HTTP 503. Uma nova consulta exige uma nova mensagem. Perguntas acima do limite do Assistente recebem aviso seguro sem disparar novas chamadas ao serviço.

A captura também possui uma claim persistida na própria Inbox: um intake `REVIEWING` com extração incompleta só pode ser retomado após a expiração de um lease de 2 minutos. A retomada exige novo `POST` assinado da Meta, revalida o consentimento e preserva o mesmo `sourceHash` e `ImportBatch`. Apenas o detentor do token de processamento atual pode persistir uma sugestão; outro worker que terminou tarde não pode substituir a extração mais recente. Enquanto o primeiro processamento ainda está ativo, o WhatsApp devolve 503 para solicitar replay, sem responder que a captura foi concluída. O estado interno não contém o texto bancário bruto.

O expurgo de dados históricos é iniciado em toda inicialização da API e repetido a cada hora, mesmo quando a integração Meta está sem credenciais ou desativada. Uma falha de banco temporária não desliga as tentativas seguintes. Depois da expiração de 24 horas, o agendador remove o remetente dos eventos. Um replay assinado de um ID Meta já concluído e redigido continua sendo reconhecido pela chave única e tratado como operação idempotente sem novo envio; uma tentativa de reutilizar a identidade com remetente divergente **antes** da redação continua recusada.

Uma resposta enviada é marcada como `sent` e seu texto transitório é imediatamente eliminado. Se a Meta rejeita comprovadamente com **HTTP 429**, o mesmo evento pode repetir apenas o outbound (sem recalcular o resultado). Quando a requisição de envio teve resultado **ambíguo** — timeout, queda de conexão, falha após aceitação —, o evento fica `send_unknown` e **não é reenviado automaticamente**, evitando mensagem duplicada; exige avaliação operacional explícita. Um `sending` com lease expirado também passa a `send_unknown`.

O corpo bruto do webhook, a mensagem bancária e credenciais nunca são persistidos nas tabelas do canal ou registrados em logs. `replyText` e `senderId` de eventos têm prazo máximo de 24h e devem ser redigidos pelo agendador `redactExpiredWhatsappState`; o histórico de evento e as correlações ficam para idempotência/rastreabilidade sem conteúdo financeiro. Pareamentos não confirmados expiram em 10 minutos. O sistema mantém rastreabilidade do resultado, não uma cópia adicional de mensagens ou de evidência financeira.

## Validação e segurança operacional

Testar com números sandbox Meta e perfis isolados, incluindo remetente BSUID sem telefone, prioridade de BSUID sobre telefone, `wamid` com padding `=`, identificadores malformados, envio com `recipient` versus `to`, replay e revogação: assinatura válida/inválida, perfil exigido, código expirado/reutilizado, vínculo recusado de outro usuário, duas mensagens simultâneas, múltiplas moedas, revogação durante a consulta e antes do envio, webhook repetido após restart, status-only webhook, captura com/sem consentimento e comandos de pagamento. O pipeline local usa testes `whatsapp-channel-provider.test.ts` e `whatsapp-channel-service.test.ts`; CI, testes de integração PostgreSQL e homologação ponta a ponta com WABA real são verificações adicionais, não substituídas por testes de fake.

**Nota de ativação:** app Meta, WABA, número validado, assinatura do webhook, segredos protegidos e verificação de permissões em produção são pré-requisitos externos. A migração e as rotas podem ser entregues sem ativar o canal; não declarar envio real sem configurar e testar o ambiente Meta.

## Referências

- [Meta Webhooks — validating payloads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
- [Meta WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Meta Business-scoped user IDs (BSUID)](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)
- [Assistente financeiro](FINANCIAL_ASSISTANT.md)
- [Inbox de mensagens bancárias](BANK_MESSAGE_INBOX.md)
- [Fila de revisão](AI_REVIEW_QUEUE.md)
- [ADR 0011 — somente leitura](adr/0011-read-only-financial-assistant.md)

## Confirmação explícita — issue #695

O **WhatsApp não é uma sessão financeira nem um motor de lançamentos**. Quando o canal recebe `CAPTURAR <mensagem>`, a Inbox cria uma `transaction_extraction` pendente pelo pipeline da issue #694. Apenas se os campos essenciais estiverem completos, a sugestão pertencer ao mesmo perfil e houver uma conta explicitamente resolvida, o canal devolve um resumo estruturado com **tipo, valor, moeda, data e descrição mascarada**, acompanhado de três ações exatas:

- `CONFIRMAR <codigo>`: revalida a proposta e chama `approveAiReviewDecisionForContext`, que é a mesma decisão da fila unificada; somente este serviço pode criar `Transaction`.
- `REJEITAR <codigo>`: chama `rejectAiReviewDecisionForContext`; não cria lançamento.
- `CANCELAR <codigo>`: cancela **a confirmação do canal**, preservando a sugestão para revisão autenticada; não cria lançamento.

Um simples `sim`, uma mensagem sem código ou um código inválido **não confirma** nada. O código de 12 caracteres é derivado por HMAC do evento e da sugestão com segredo de servidor, e somente o hash contextual do código é persistido. Ele não concede autorização por si só. Nunca é usada a mensagem livre para reconstituir ou recalcular valores durante uma decisão.

**Elegibilidade do primeiro corte:** apenas receita/despesa em conta (sem cartão, transferência ou parcelamento) com data, descrição, valor positivo, moeda e conta estruturados. Propostas incompletas continuam pendentes na Inbox e **não recebem confirmação pelo canal**; a revisão autenticada permanece disponível e necessária. A ausência/ambiguidade de conta nunca deve ser suprida por um palpite da IA.

**Persistência:** a tabela `WhatsappChannelConfirmation` relaciona `sourceEventId`, `suggestionId`, versão do payload (fingerprint), vínculo, usuário, organização, perfil, token hash, estado, expiração, `decisionEventId` e `transactionId`. O prazo de decisão é **15 minutos**, sem extensão implícita por replay. A confirmação grava o resultado e o efeito canônico **na mesma transação PostgreSQL**; indisponibilidade/erro de efeito impede declaração de sucesso. Duas confirmações simultâneas competem pelo lock da proposta, de modo que só uma pode criar a transação. Reenvios do mesmo evento Meta não geram nova decisão ou saída lógica; nova mensagem com o mesmo código recebe desfecho idempotente.

**Autorização:** todo evento usa o vínculo explicitamente ativado no SolverFin. Antes de qualquer confirmação, rejeição ou cancelamento, um lock transacional compartilhado revalida usuário ativo, perfil ativo e titular, organização, número oficial, remetente, ID e versão do vínculo. O repositório de sugestões valida organização/perfil e a origem `BANK_MESSAGE` do WhatsApp; toda decisão exige o fingerprint ainda vigente, em estado `PENDING_REVIEW`. A fila canônica continua responsável por validar os recursos financeiros. Um vínculo revogado, perfil alheio, sugestão alterada/resolvida ou token expirado não permite efeito. O outbound também é revalidado pela infraestrutura #694 para não divulgar resultado privado depois da revogação.

**Estados da confirmação:** `pending_confirmation` → `confirmed | rejected | cancelled | expired`. Os estados terminais não podem voltar a ser pendentes. Expiração e cancelamento não alteram o fato financeiro; rejeição muda somente a sugestão via serviço da fila. O serviço de expurgo #694 também expira confirmações pendentes. Eventos de decisão mantêm correlação e versão; corpo do webhook, texto bancário bruto, código em claro e credenciais nunca são armazenados na tabela de confirmação, em logs nem em métricas.

**Falhas:** falha antes do commit de aprovação reverte confirmação e efeito para retry do POST assinado original; falha depois do commit mantém confirmação/efeito durável. Se o envio ao provedor tiver resultado ambíguo, o outbound permanece `send_unknown` (não se reenvia cegamente); HTTP 429 comprovadamente não aceito usa retry seguro. Nenhuma nova infraestrutura de pagamento é ativada.

A habilitação em produção continua dependente do app Meta dedicado, WABA/número, credenciais, webhook HTTPS e autorização operacional explicitada na issue #694. A presença do código não prova homologação em conta real.
