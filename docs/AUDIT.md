# Auditoria financeira

## Objetivo

A auditoria financeira registra mudancas criticas de entidades do SolverFin com
rastreabilidade suficiente para suporte, investigacao e confianca do usuario,
sem persistir payloads financeiros completos quando marcadores de mudanca forem
suficientes.

## Escopo inicial

Nesta fase, o contrato de auditoria cobre principalmente `Transaction`, porque
lancamentos afetam saldo, dashboard, relatorios, importacoes, conciliacao e
sugestoes de IA.

Toda alteracao relevante de lancamento deve gerar um `AuditLogEntry` com:

- `organizationId` e `financialProfileId`;
- `actorKind` e, quando houver, `actorId`;
- `action`;
- `entityKind = "transaction"`;
- `entityId`;
- `occurredAt`;
- `correlationId`, quando disponivel;
- `reason`, quando houver justificativa de negocio;
- `redactedChanges`, quando houver campos alterados.

## Acoes iniciais

As acoes previstas para lancamentos sao:

- `create`: criacao de lancamento;
- `update`: edicao de valor, categoria, status, data, conta, cartao ou
  metadados operacionais;
- `soft_delete`: cancelamento ou exclusao logica;
- `reconcile`: conciliacao;
- `unreconcile`: desfazer conciliacao.

Importacoes e sugestoes de IA devem usar `actorKind = "import"`, `"ai"` ou
`"system"` quando nao houver usuario humano executando diretamente a acao.

## Dados minimizados

`redactedChanges` deve guardar apenas marcadores por campo:

- `added`;
- `changed`;
- `removed`.

Exemplo:

```json
{
  "amountMinor": "changed",
  "categoryId": "changed",
  "status": "changed"
}
```

O registro nao deve guardar valor monetario anterior/novo, descricao completa,
mensagem bancaria, numero de cartao, arquivo bruto, payload de IA ou qualquer
outro dado sensivel quando o marcador for suficiente.

## Tenant e isolamento

Snapshots `before` e `after` usados para montar auditoria devem pertencer ao
mesmo `organizationId` e `financialProfileId`. Mudancas entre tenants sao erro
de programacao e devem ser rejeitadas antes de gravar auditoria.

Consultas futuras de auditoria devem sempre filtrar por `organizationId` e
`financialProfileId`. A tabela possui indices para consulta por periodo,
entidade e `correlationId` dentro do tenant.

## Falha de auditoria

Para alteracoes financeiras criticas, a operacao deve preferir gravar o dado de
negocio e a auditoria na mesma transacao de banco. Se a auditoria falhar nesse
contexto, a operacao inteira deve falhar de forma controlada.

Quando a auditoria for assincrona em fluxos futuros, a fila deve preservar
correlation id, tenant e entidade, alem de expor falhas para reprocessamento
seguro.

## Testes

O pacote `@solverfin/domain` possui testes de contrato para:

- criacao de auditoria de lancamento;
- diff minimizado em edicao de valor, categoria e status;
- exclusao logica;
- rejeicao de snapshots de tenants diferentes;
- ausencia de valores financeiros e descricoes brutas em `redactedChanges`.
