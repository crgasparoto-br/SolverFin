# Canal WhatsApp Meta Cloud API — issue #694

**Escopo:** primeira integração de consulta somente leitura e captura revisável. O canal **não realiza** criação, edição, baixa, conciliação, exclusão, aprovação de sugestão, pagamento ou qualquer mutação financeira.

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

O provider HTTP é restrito a `https://graph.facebook.com/{versao}/{phone_number_id}/messages`, token bearer de ambiente e mensagem `text` sem URLs arbitrárias. Sem configurações a entrada é fail-closed e não inicia processamento.

## Vínculo autenticado e consentimento

1. No **SolverFin autenticado**, selecionando explicitamente um perfil ativo, faça `POST /api/channels/whatsapp/pairings` com `{"profileId":"<UUID>"}`. A resposta retorna `pairing.id`, `pairing.code` (única exibição) e `pairing.expiresAt` (10 minutos).
2. Pelo WhatsApp do titular, envie **`VINCULAR <code>`** ao número comercial oficial. A mensagem precisa vir em webhook assinado. O código tem 192 bits aleatórios; o banco armazena somente seu SHA-256. O remetente fica associado **provisoriamente**, sem acesso a dados.
3. Volte ao SolverFin autenticado, com **o mesmo perfil explicitamente selecionado**, e faça `POST /api/channels/whatsapp/pairings/{id}/confirm?profileId=<UUID>`. Apenas então o vínculo se torna ativo e único por número oficial/remetente.
4. Consulte `GET /api/channels/whatsapp/links?profileId=<UUID>` (somente identificadores mascarados). Cancele o pareamento com `POST /api/channels/whatsapp/pairings/{id}/cancel?profileId=<UUID>` ou revogue imediatamente o vínculo com `POST /api/channels/whatsapp/links/{id}/revoke?profileId=<UUID>`.

O número de WhatsApp por si só **nunca** autentica um usuário. A verificação do vínculo ativo, do usuário ativo, da titularidade, do perfil ativo e da organização ocorre a cada entrada, antes de finalizar o resultado e novamente antes do outbound. Sem vínculo válido, perfil explicitamente confirmado ou em caso de revogação, o canal envia apenas orientação genérica. Dois perfis não são agregados ou selecionados por conveniência.

O consentimento de extração de mensagem bancária é exclusivo do SolverFin: `resolveBankMessageAiConsentForContext` deve retornar `granted`, obtido por ação autenticada na Inbox. O comando WhatsApp **não concede** consentimento. Revogação/ausência bloqueia a captura; o assistente determinístico continua independente de provedor IA e respeita as permissões de processamento atuais.

## Comandos do canal

- Perguntas financeiras em linguagem natural, ou `CONSULTAR <pergunta>`: delegadas ao `FinancialAssistantService` existente, com dados determinísticos por perfil/período/moeda. O resultado fora de escopo não executa comandos financeiros.
- `CAPTURAR <texto de notificação bancária>`: delega à **mesma** `createBankMessageInboxWithAiForContext` e seu parser determinístico/IA opcional; persiste `ImportBatch` do tipo `BANK_MESSAGE` (origem `whatsapp`) e, quando a extração é válida, uma `AiSuggestion` de `TRANSACTION_EXTRACTION` em `PENDING_REVIEW`. A aprovação/edição ocorre **exclusivamente** na Inbox/fila de revisão autenticada.
- `CANCELAR`: registra o desfecho `cancelled` do pedido recebido pelo canal, sem cancelar a conversa do Assistente compartilhada com a interface web nem alterar lançamentos. O encerramento da conversa canônica permanece no aplicativo autenticado.
- Outros formatos, mensagens sem texto e conta não vinculada: apenas resposta operacional segura. A mensagem nunca vira instrução SQL ou mutação automática.

A linguagem `CAPTURAR` é um comando de roteamento, **não um parser financeiro**; toda interpretação, deduplicação e sugestão permanece na fundação existente. Não há nova tabela de transações, cálculo de saldo ou aprovação automática.

## Persistência, concorrência e retentativas

A migração `20261113160000_whatsapp_channel_foundation` cria:

- `WhatsappChannelLink`: vínculo em duas etapas, tenant/perfil/usuário, ID do remetente verificado pelo provider, status/versão/validade, token somente em hash, revogação auditável.
- `WhatsappChannelEvent`: chave única `(provider,accountId,providerMessageId)`; resultado lógico, contexto exato, ID de conversa/sugestão/Inbox, estado de claim com lease e tentativa, resposta segura temporária antes do outbound.

Uma entrega `POST` em duplicidade ou uma segunda instância compete pelo mesmo claim: no máximo uma executa a consulta/captura; a chave de idempotência do Assistente deriva do ID do evento. Antes de enviar, a resposta segura é persistida como `response_ready`. Se o processo cair, a **mesma entrega POST assinada**, reentregue pela Meta, pode enviar o resultado sem refazer a operação lógica. Falha **antes** do resultado persistente devolve 503 para replay do webhook original, nunca dispara processamento por GET/health.

Em consultas, se o Assistente recuperar um turno interrompido como `FAILED` sem resposta, o mesmo POST assinado termina com uma única orientação genérica (`query_incomplete`), sem recalcular sob a mesma chave nem entrar em um loop de HTTP 503. Uma nova consulta exige uma nova mensagem. Perguntas acima do limite do Assistente recebem aviso seguro sem disparar novas chamadas ao serviço.

A captura também possui uma claim persistida na própria Inbox: um intake `REVIEWING` com extração incompleta só pode ser retomado após a expiração de um lease de 2 minutos. A retomada exige novo `POST` assinado da Meta, revalida o consentimento e preserva o mesmo `sourceHash` e `ImportBatch`. Apenas o detentor do token de processamento atual pode persistir uma sugestão; outro worker que terminou tarde não pode substituir a extração mais recente. Enquanto o primeiro processamento ainda está ativo, o WhatsApp devolve 503 para solicitar replay, sem responder que a captura foi concluída. O estado interno não contém o texto bancário bruto.

Depois da expiração de 24 horas, o agendador remove o remetente dos eventos. Um replay assinado de um ID Meta já concluído e redigido continua sendo reconhecido pela chave única e tratado como operação idempotente sem novo envio; uma tentativa de reutilizar a identidade com remetente divergente **antes** da redação continua recusada.

Uma resposta enviada é marcada como `sent` e seu texto transitório é imediatamente eliminado. Se a Meta rejeita comprovadamente com **HTTP 429**, o mesmo evento pode repetir apenas o outbound (sem recalcular o resultado). Quando a requisição de envio teve resultado **ambíguo** — timeout, queda de conexão, falha após aceitação —, o evento fica `send_unknown` e **não é reenviado automaticamente**, evitando mensagem duplicada; exige avaliação operacional explícita. Um `sending` com lease expirado também passa a `send_unknown`.

O corpo bruto do webhook, a mensagem bancária e credenciais nunca são persistidos nas tabelas do canal ou registrados em logs. `replyText` e `senderId` de eventos têm prazo máximo de 24h e devem ser redigidos pelo agendador `redactExpiredWhatsappState`; o histórico de evento e as correlações ficam para idempotência/rastreabilidade sem conteúdo financeiro. Pareamentos não confirmados expiram em 10 minutos. O sistema mantém rastreabilidade do resultado, não uma cópia adicional de mensagens ou de evidência financeira.

## Validação e segurança operacional

Testar com números sandbox Meta e perfis isolados: assinatura válida/inválida, perfil exigido, código expirado/reutilizado, vínculo recusado de outro usuário, duas mensagens simultâneas, múltiplas moedas, revogação durante a consulta e antes do envio, webhook repetido após restart, status-only webhook, captura com/sem consentimento e comandos de pagamento. O pipeline local usa testes `whatsapp-channel-provider.test.ts` e `whatsapp-channel-service.test.ts`; CI, testes de integração PostgreSQL e homologação ponta a ponta com WABA real são verificações adicionais, não substituídas por testes de fake.

**Nota de ativação:** app Meta, WABA, número validado, assinatura do webhook, segredos protegidos e verificação de permissões em produção são pré-requisitos externos. A migração e as rotas podem ser entregues sem ativar o canal; não declarar envio real sem configurar e testar o ambiente Meta.

## Referências

- [Meta Webhooks — validating payloads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
- [Meta WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Assistente financeiro](FINANCIAL_ASSISTANT.md)
- [Inbox de mensagens bancárias](BANK_MESSAGE_INBOX.md)
- [Fila de revisão](AI_REVIEW_QUEUE.md)
- [ADR 0011 — somente leitura](adr/0011-read-only-financial-assistant.md)
