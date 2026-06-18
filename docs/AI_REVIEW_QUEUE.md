# Fila de revisao de sugestoes

## Objetivo

A fila de revisao transforma sugestoes geradas por importacao, regras, automacoes ou IA em um fluxo operacional controlado. Ela permite consultar sugestoes pendentes por perfil financeiro, aprovar, editar ou rejeitar com trilha minima de revisao.

O fluxo preserva o principio do produto: sugestoes ajudam, mas nao aplicam efeitos financeiros incertos ou irreversiveis sem revisao humana.

## Entidade base

A fila usa `AiSuggestion` como registro persistido de sugestao revisavel.

Campos relevantes:

- `kind`: tipo da sugestao, como `transaction_extraction`, `categorization`, `deduplication`, `reconciliation` ou `insight`;
- `status`: `pending_review`, `approved`, `edited`, `rejected` ou `expired`;
- `sourceEntityId`: origem analisada, como lote de importacao;
- `targetEntityId`: entidade criada ou afetada apos revisao, quando houver;
- `confidence`: confianca numerica;
- `explanation`: explicacao segura e compreensivel;
- `provider` e `model`: origem tecnica da sugestao;
- `reviewedByUserId` e `reviewedAt`: trilha minima de revisao.

Todas as consultas e mutacoes exigem `organizationId` e `financialProfileId` resolvidos a partir do contexto ativo.

## API

### Listar fila

```http
GET /api/ai-review-queue
```

Filtros opcionais:

- `kind`: filtra pelo tipo de sugestao;
- `status`: filtra por estado. O padrao e `pending_review`; use `all` para historico;
- `includeLowConfidence=true`: inclui sugestoes abaixo do limiar inicial de 0.7;
- `profileId`: seleciona outro perfil financeiro autorizado.

Resposta:

```json
{
  "suggestions": [
    {
      "id": "...",
      "kind": "transaction_extraction",
      "status": "pending_review",
      "origin": "import",
      "confidence": 0.75,
      "risk": "normal",
      "explanation": "CSV linha 2: ...",
      "maskedSummary": "2026-06-18 - Compra ficticia",
      "proposedTransaction": {
        "kind": "expense",
        "amountMinor": 12345,
        "occurredOn": "2026-06-18",
        "accountId": "...",
        "description": "Compra ficticia",
        "currency": "BRL"
      }
    }
  ]
}
```

### Aprovar sugestao

```http
POST /api/ai-review-queue/:suggestionId/approve
```

Body opcional:

```json
{
  "payloadOverride": {
    "amountMinor": 12345,
    "description": "Descricao revisada"
  }
}
```

Efeitos atuais:

- `transaction_extraction`: cria um lancamento `posted` com `source: ai_suggestion`, vincula `targetEntityId` na sugestao e `aiSuggestionId` no lancamento;
- demais tipos: marca a sugestao como `approved` sem efeito financeiro automatico ate existir contrato especifico.

Em todos os casos, registra `reviewedByUserId`, `reviewedAt` e auditoria de aprovacao.

### Editar sugestao

```http
POST /api/ai-review-queue/:suggestionId/edit
```

Body minimo:

```json
{
  "payload": {
    "amountMinor": 2199,
    "description": "Compra revisada pelo usuario"
  },
  "reason": "Valor ajustado antes da confirmacao."
}
```

A edicao atual fecha a sugestao com `status: edited` e registra auditoria redigida dos campos revisados. Ela nao cria lancamento automaticamente. Quando a sugestao for de extracao de transacao, o payload informado e validado contra o contrato minimo antes da transicao.

### Rejeitar sugestao

```http
POST /api/ai-review-queue/:suggestionId/reject
```

Body opcional:

```json
{
  "reason": "Nao pertence a este extrato."
}
```

A rejeicao marca a sugestao como `rejected`, registra revisor, data e auditoria. Nao altera lancamentos.

## Transicoes

Transicoes permitidas nesta fase:

- `pending_review` -> `approved`;
- `pending_review` -> `edited`;
- `pending_review` -> `rejected`.

Qualquer tentativa de revisar uma sugestao que ja saiu de `pending_review` retorna erro controlado:

```text
AI_REVIEW_INVALID_TRANSITION
```

## Isolamento

A fila sempre consulta `AiSuggestion` por `organizationId` e `financialProfileId`.

Uma sugestao de outro perfil financeiro nao aparece na listagem e nao pode ser aprovada, editada ou rejeitada pelo contexto atual.

## Dados sensiveis

A fila deve seguir `docs/PRIVACY.md`:

- explicacoes devem ser minimizadas;
- resumos exibidos devem ser mascarados ou reduzidos;
- auditoria registra mudancas redigidas;
- payload bruto de importacao, mensagem bancaria ou IA nao deve ser persistido na fila;
- exemplos e testes devem usar dados ficticios.

## Limites conhecidos

- O payload estruturado ainda nao tem coluna propria em `AiSuggestion`; para importacao CSV, a API deriva a proposta da explicacao segura existente.
- Aprovacao automatica com efeito financeiro esta implementada apenas para `transaction_extraction` com dados suficientes.
- Categorizacao, deduplicacao, conciliacao e insights podem ser listados e revisados, mas efeitos especificos devem ser implementados por contratos dedicados.
- Nao ha chamada a provedor real de IA nesta entrega.
