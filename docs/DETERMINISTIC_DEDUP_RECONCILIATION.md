# Deduplicacao e conciliacao deterministica

Este documento registra o primeiro fluxo persistido de deduplicacao e conciliacao deterministica do SolverFin. O objetivo e reduzir lancamentos duplicados sem depender de IA e sem aplicar efeito financeiro final sem revisao humana.

## Escopo atual

O fluxo parte de um lote CSV ja recebido por `POST /api/import-batches/csv`.

Depois da importacao, a API pode executar uma varredura deterministica sobre as sugestoes de transacao extraidas do CSV e os lancamentos existentes do mesmo `organizationId` e `financialProfileId`.

Endpoint principal:

```http
POST /api/import-batches/:importBatchId/detect-duplicates
```

A resposta cria sugestoes revisaveis em `AiSuggestion` com:

- `kind: deduplication`, para possivel duplicidade;
- `kind: reconciliation`, para possivel conciliacao com lancamento previsto/manual;
- `provider: solverfin-rule`;
- `model: deduplication-v1` ou `reconciliation-v1`;
- `status: pending_review`;
- `sourceEntityId` apontando para o lote de importacao;
- `targetEntityId` apontando para o lancamento existente candidato;
- `confidence` derivada da pontuacao deterministica;
- `explanation` em linguagem revisavel.

A varredura e idempotente por lote: se ja houver sugestoes deterministicas para o mesmo lote, a API retorna as sugestoes existentes com `duplicateScan: true`.

## Regras iniciais

A pontuacao reaproveita `packages/domain/src/deduplication.ts` e considera criterios simples e explicaveis:

- mesma origem tecnica ou identificador externo, quando disponivel;
- mesmo valor;
- datas proximas em ate dois dias;
- mesma conta ou mesmo cartao;
- descricoes parecidas por tokens normalizados.

Sugestoes abaixo do limiar de revisao definido no dominio nao sao persistidas.

A conciliacao usa `packages/domain/src/reconciliation.ts` para comparar a sugestao importada com o lancamento alvo. Quando houver conflito de valor, data, conta, categoria ou tipo, a sugestao continua pendente e a explicacao informa que a revisao e necessaria.

## Revisao por API

Listar sugestoes deterministicas:

```http
GET /api/review-suggestions
GET /api/review-suggestions?kind=deduplication
GET /api/review-suggestions?kind=reconciliation&status=pending_review
```

Aprovar sugestao:

```http
POST /api/review-suggestions/:suggestionId/approve
```

Rejeitar sugestao:

```http
POST /api/review-suggestions/:suggestionId/reject
```

Body opcional para rejeicao:

```json
{
  "reason": "Nao e duplicidade: compra feita em outro estabelecimento."
}
```

## Efeitos da aprovacao

Aprovacao de `deduplication`:

- marca a sugestao como `approved`;
- registra `reviewedByUserId` e `reviewedAt`;
- nao altera lancamentos automaticamente.

Aprovacao de `reconciliation`:

- marca a sugestao como `approved`;
- marca o lancamento alvo como `reconciled`;
- preenche `reconciledAt` e `aiSuggestionId` no lancamento alvo;
- registra auditoria minima de sugestao e lancamento.

Rejeicao:

- marca a sugestao como `rejected`;
- registra revisor, data e motivo seguro quando informado;
- nao altera lancamentos.

## Isolamento e seguranca

Todas as consultas e mutacoes filtram por `organizationId` e `financialProfileId`. Um lote, sugestao ou lancamento de outro perfil retorna erro seguro de recurso nao encontrado ou acesso negado.

As explicacoes usam somente dados minimizados do fluxo de importacao e nao exigem persistencia do CSV bruto. Logs e auditoria registram mudancas redigidas, sem valores sensiveis completos alem do que ja faz parte do contrato financeiro normalizado.

## Relacao com inbox e fila revisavel

O inbox de mensagens bancarias ja possui fluxo inicial proprio em `/api/bank-message-inbox` e `/inbox`, criando lotes `BANK_MESSAGE` e sugestoes revisaveis sem persistir texto bruto. A fila geral de revisao tambem existe em `/api/ai-review-queue` para listar, aprovar, editar ou rejeitar sugestoes.

A deduplicacao/conciliacao deterministica deste documento continua focada no primeiro fluxo de lote CSV. A extensao das mesmas regras para inbox, OFX ou outros canais deve ser tratada como evolucao explicita, preservando minimizacao, tenant e revisao humana.

## Limites conhecidos

- O fluxo inicial de deteccao cobre CSV persistido; OFX ainda precisa de ligacao operacional propria.
- `AiSuggestion` guarda a explicacao e os vinculos principais, mas ainda nao possui payload estruturado para todos os detalhes da sugestao importada.
- Nao existe tabela dedicada de `ReconciliationLink`; nesta entrega, o vinculo operacional fica em `AiSuggestion` e `Transaction.aiSuggestionId`.
- A UI ainda precisa expor a revisao de deduplicacao/conciliacao para uso final amigavel.
