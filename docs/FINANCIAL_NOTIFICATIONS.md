# Notificações financeiras determinísticas — issue #693

## Escopo e limite

A fundação transporta eventos financeiros **já calculados**, sem estimativa financeira própria,
inferência de IA, alteração de lançamentos ou criação de novas regras de alerta.
O serviço interno publishFinancialNotificationForContext aceita eventos versionados;
não existe rota HTTP de publicação nem ligação automática dos motores existentes nesta fase.

Tipos aceitos:
- financial.insight.available.v1 — insight gerado pelo motor existente;
- financial.budget.threshold.v1 — limiar de orçamento;
- financial.invoice.due.v1 — fatura a vencer;
- financial.balance.warning.v1 — aviso de saldo.

O produtor fornece type, fingerprint no formato sha256- e 64 caracteres hexadecimais,
occurredAt UTC ISO e facts com código fechado, severidade e campos tipados opcionais
(moeda ISO, valor em unidades menores inteiras seguras e data efetiva). Não são aceitos
textos livres do provider, identificadores de contas, números arbitrários ou propriedades extras.
Referência de recurso opcional deve pertencer ao mesmo perfil financeiro.

## Persistência e idempotência

- FinancialNotification guarda identidade, fato, referência privada, timestamps e estado de leitura.
- FinancialNotificationPreference guarda configuração por usuário, perfil, tipo e canal.
- FinancialNotificationDelivery é uma outbox persistente para push/e-mail, com tentativas,
  lease, retomada após falha, backoff e código de erro redigido.

A chave única envolve organização, perfil, usuário, tipo e fingerprint.
Repetição com o mesmo fato não cria duplicata; reutilizar o fingerprint com fato, origem
ou data divergente é conflito. Publicações e alterações de preferência usam o mesmo advisory
lock por destinatário e evento para evitar decisões baseadas em configuração obsoleta.

Padrão sem preferência gravada: in-app habilitado, push/e-mail desabilitados.
Desabilitar in-app suprime novas publicações nesta fase, sem apagar notificações antigas.
Push e e-mail mantêm preferências e a outbox, mas **não há adapter externo conectado,
worker ativo ou envio real**; processar a outbox exige uma invocação interna e uma opção
explícita que é falsa por padrão. Adapter futuro deve garantir a idempotência com a
chave da entrega, inclusive se uma falha ocorrer após o envio e antes da confirmação.
Na falha de banco não existe fallback em memória, e a transação de criação é revertida.

## API autenticada

| Método | Rota | Contrato |
| --- | --- | --- |
| GET | /api/notifications?limit=20&offset=0 | Lista, total, unreadCount, nextOffset |
| GET | /api/notifications/unread-count | Contagem de não lidas |
| PATCH | /api/notifications/:id/read | Corpo JSON: read boolean |
| GET | /api/notifications/preferences | Tipos/canais e habilitação efetiva |
| PUT | /api/notifications/preferences | Corpo JSON: type, channel, enabled |
| GET | /api/notifications/:id/navigation | available e href seguro |

Todas exigem sessão e TenantContext do servidor. O parâmetro profileId seleciona somente
um perfil ativo pertencente à sessão. Corpo não pode sobrescrever organização, perfil
ou destinatário. A listagem é ordenada por occurredAt decrescente + id, com limite máximo
100 e offset até 10000. Resposta pública omite fingerprint e IDs privados de origem.
A navegação revalida a referência no momento de uso; se inacessível, retorna
available=false sem link. Página /notificacoes fornece leitura, paginação e preferências
sem eventos artificiais.

## Privacidade e auditoria

O servidor revalida organização/perfil/usuário ativo no banco, dentro das transações de
mutação. Marcadores de leitura são idempotentes e preservam o timestamp após repetição.
Auditoria inclui somente mudança redigida e correlationId, sem conteúdo bancário.
Tentativas de entrega armazenam código de erro genérico, sem erro bruto do provider.
Nenhum canal externo é chamado pelo servidor atual.

## Validação e rollout

Aplicar migration pelo pipeline existente. A matriz de testes contempla dados repetidos
e concorrentes, isolamento cross-profile e cross-user, preferências, marcação repetida,
crash/retry com fake adapter e idempotencyKey estável, ausência de envio quando desabilitado,
erro de banco e renderização segura. A ativação real de push/e-mail, provedores,
identificação de destino e consentimento revogável exigem issue própria e validação adicional.

CI verde isoladamente não é aprovação técnica: auditoria independente e evidências
exact-SHA são obrigatórias antes de considerar a issue concluída.
