# Deduplicação e conciliação determinística

## Objetivo

A varredura determinística compara linhas CSV pendentes com lançamentos existentes do mesmo perfil e produz candidaturas explicáveis. Ela nunca decide sozinha.

```http
POST /api/import-batches/:importBatchId/detect-duplicates
```

A operação cria ou reutiliza sugestões `deduplication` e `reconciliation` vinculadas por payload estruturado à sugestão de origem e ao lançamento alvo. A unicidade inclui contexto, tipo, origem, fingerprint e alvo, tornando varreduras repetidas idempotentes.

## Regras

A pontuação usa valor, proximidade de data, conta, identificador externo e similaridade de descrição. A conciliação também explicita conflitos de tipo, valor, data, conta e categoria.

Editar a linha de origem altera seu fingerprint e expira candidaturas antigas. Resolver uma candidatura expira as irmãs ainda pendentes.

## Revisão

```http
GET /api/review-suggestions
POST /api/review-suggestions/:suggestionId/approve
POST /api/review-suggestions/:suggestionId/reject
```

Aprovar duplicidade:

- marca a candidatura como aprovada;
- rejeita a linha importada como duplicada;
- não cria nem altera lançamento financeiro.

Aprovar conciliação:

- marca a candidatura como aprovada;
- valida que o payload de origem não ficou obsoleto;
- marca o lançamento alvo como reconciliado;
- aprova a linha de origem e vincula seu `targetEntityId` ao lançamento.

Rejeitar candidatura mantém a linha importada pendente para correção, aprovação como novo lançamento ou outra decisão.

## Garantias

- isolamento por organização e perfil financeiro;
- vínculo explícito, sem inferência por texto;
- transação compartilhada para decisão, origem, lançamento, expirações e auditoria;
- repetição segura da mesma varredura ou decisão;
- lote descartado não pode ser analisado novamente;
- nenhum CSV bruto é necessário ou persistido.

## Transferências importadas

Candidatos de transferência exigem o mesmo par de contas, aceitando ambas as orientações para localizar a outra ponta, além de tipo, valor, moeda e tolerância temporal. Descrição isolada não é suficiente. O preview de conciliação também compara `destinationAccountId`.

Na aprovação, a identidade canônica usa origem, destino, valor, moeda e data. Um lock transacional impede que duas pontas aprovadas simultaneamente criem duas transferências. A segunda decisão vincula a sugestão à transação existente e registra auditoria sem substituir a proveniência da criação original.
