# Contrato de integracao - Agenda Profissional

Este documento define um contrato conceitual para eventos de agenda gerarem contas a receber, receitas ou cancelamentos no SolverFin. Nao implementa endpoint produtivo nem autenticao real.

## Eventos suportados

| Evento | Efeito esperado no SolverFin |
| --- | --- |
| `appointment.created` | Criar conta a receber prevista, pendente de conciliacao. |
| `appointment.rescheduled` | Atualizar vencimento/competencia se ainda nao conciliado. |
| `appointment.completed` | Marcar recebivel como confirmado quando aplicavel. |
| `appointment.cancelled` | Cancelar recebivel ainda nao pago ou criar ajuste se ja conciliado. |
| `appointment.paid` | Criar/atualizar receita recebida e reconciliar com pagamento. |

## Payload minimo

Campos obrigatorios:

- `eventId`: identificador unico do evento.
- `eventType`: tipo do evento.
- `occurredAt`: data/hora do evento.
- `tenantId`: organizacao/tenant autorizado.
- `financialProfileId`: perfil financeiro destino.
- `appointmentId`: identificador externo do atendimento.
- `idempotencyKey`: chave estavel para reprocessamento seguro.
- `amountMinor`: valor em centavos quando houver impacto financeiro.
- `currency`: moeda ISO 4217.
- `dueOn` ou `paidOn`: data relevante para recebivel ou pagamento.

Campos opcionais:

- `customerExternalId`;
- `serviceExternalId`;
- `description`;
- `competenceMonth`;
- `paymentMethod`;
- `metadata` minimizada.

## Exemplo de criacao

```json
{
  "eventId": "evt-demo-001",
  "eventType": "appointment.created",
  "occurredAt": "2026-06-16T10:00:00.000Z",
  "tenantId": "org-demo",
  "financialProfileId": "profile-mei-demo",
  "appointmentId": "apt-demo-001",
  "idempotencyKey": "agenda:apt-demo-001:created:v1",
  "amountMinor": 18000,
  "currency": "BRL",
  "dueOn": "2026-06-20",
  "description": "Atendimento demonstrativo"
}
```

## Exemplo de cancelamento

```json
{
  "eventId": "evt-demo-002",
  "eventType": "appointment.cancelled",
  "occurredAt": "2026-06-17T10:00:00.000Z",
  "tenantId": "org-demo",
  "financialProfileId": "profile-mei-demo",
  "appointmentId": "apt-demo-001",
  "idempotencyKey": "agenda:apt-demo-001:cancelled:v1",
  "reason": "Cancelado pelo cliente"
}
```

## Idempotencia

- Mesmo `idempotencyKey` deve retornar o mesmo resultado sem duplicar lancamentos.
- Evento com `appointmentId` existente e versao mais recente pode atualizar recebivel ainda nao conciliado.
- Evento fora de ordem deve ficar em revisao quando afetar valor, status ou pagamento ja conciliado.
- Duplicidade por `eventId` ou `idempotencyKey` deve ser tratada como reprocessamento seguro.

## Reconciliacao

Pagamentos importados ou registrados manualmente podem reconciliar com recebiveis da Agenda quando valor, data, perfil financeiro e referencia externa forem compativeis. Conflitos devem ir para revisao humana.

## Autenticacao conceitual

A integracao futura deve exigir credencial por tenant, assinatura de webhook ou token de servidor. Segredos reais nao devem aparecer em payload, logs ou exemplos.

## Falhas

- Payload invalido: retornar erro controlado com codigo e correlation id.
- Tenant nao autorizado: rejeitar sem revelar existencia do tenant.
- Entidade externa inexistente: enviar para revisao ou retornar erro de contrato.
- Valor alterado apos conciliacao: criar ajuste/revisao, nao sobrescrever silenciosamente.

## Perguntas abertas

- Agenda Profissional sera produto interno SolverIT ou fornecedor externo?
- Recebiveis nascem como previstos, confirmados ou pendentes de revisao?
- Cliente/servico externo deve ser sincronizado ou apenas referenciado?
