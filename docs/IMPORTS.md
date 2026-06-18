# Importacao CSV e OFX inicial

Este documento registra o escopo atual da importacao inicial do SolverFin: validar extratos CSV/OFX no dominio e, para CSV, expor um primeiro fluxo persistido de lote com sugestoes revisaveis antes de qualquer lancamento definitivo.

## Objetivo

A importacao inicial deve reduzir lancamentos manuais sem confirmar movimentos automaticamente. O sistema prepara um preview com linhas validas, problemas encontrados e marcadores de duplicidade para revisao humana.

## Contratos de dominio

O modulo `packages/domain/src/imports.ts` expoe:

- `previewImportedStatement`, para validar e transformar um arquivo em preview;
- `ImportBatchDraft`, com origem, nome do arquivo, hash, data de recebimento e contadores;
- `ImportTransactionSuggestion`, com sugestao de receita/despesa pendente de revisao;
- `ImportProblem`, com erros e avisos por linha;
- `buildStableImportHash`, para hash deterministico usado na deduplicacao inicial.

## API persistida de CSV

A primeira API executavel cobre CSV. OFX segue disponivel como parser de dominio, mas ainda nao foi conectado a persistencia/API.

### `POST /api/import-batches/csv`

Cria ou reutiliza um lote CSV do perfil financeiro ativo.

Body minimo:

```json
{
  "originalFileName": "extrato-junho.csv",
  "content": "date,description,amount,kind,accountId,categoryId\n2026-06-18,Mercado,-123.45,expense,ACCOUNT_ID,CATEGORY_ID"
}
```

Campos:

- `originalFileName`: deve terminar com `.csv`.
- `content`: conteudo textual do CSV.
- `csvMapping`: opcional; permite informar nomes alternativos para as colunas esperadas.

Resposta `201`:

```json
{
  "importBatch": {
    "id": "...",
    "sourceKind": "csv",
    "status": "reviewing",
    "sourceHash": "fnv1a-..."
  },
  "suggestions": [
    {
      "kind": "transaction_extraction",
      "status": "pending_review",
      "sourceEntityId": "...",
      "explanation": "CSV linha 2: ... Revise antes de criar o lancamento final."
    }
  ],
  "problems": []
}
```

Se o mesmo conteudo ja existir no mesmo perfil financeiro, a API retorna `200`, preserva o lote anterior e inclui o problema `IMPORT_BATCH_DUPLICATE` com severidade `warning`.

### `GET /api/import-batches`

Lista os lotes do perfil financeiro ativo.

Filtros opcionais:

- `status`: `received`, `parsed`, `reviewing`, `completed`, `failed`, `discarded` ou `all`.
- `sourceKind`: `csv`, `ofx`, `bank_message` ou `manual`.
- `profileId`: seleciona outro perfil financeiro autorizado.

### `GET /api/import-batches/:importBatchId`

Consulta um lote especifico e as sugestoes associadas. Se o lote pertencer a outro perfil financeiro, a API responde `404` com `TENANT_RESOURCE_NOT_FOUND`.

## Formatos aceitos no MVP

### CSV

O CSV padrao deve conter as colunas obrigatorias:

- `date`;
- `description`;
- `amount`.

Colunas opcionais:

- `kind` com `income`, `expense`, `receita`, `despesa`, `credit` ou `debit`;
- `accountId`;
- `categoryId`.

Quando `kind` nao vem preenchido, valores positivos viram receita e valores negativos viram despesa. Datas em `AAAA-MM-DD` e `DD/MM/AAAA` sao aceitas.

### OFX

O parser inicial aceita blocos `STMTTRN` com os campos basicos:

- `TRNTYPE`;
- `DTPOSTED`;
- `TRNAMT`;
- `FITID`;
- `NAME` ou `MEMO`.

OFX completo, variacoes bancarias especificas e conexao com persistencia/API ficam fora desta entrega.

## Regras de seguranca e privacidade

- Use somente dados ficticios, anonimizados ou autorizados.
- O arquivo bruto nao e persistido pelo contrato de dominio.
- Logs nao sao gerados pelo parser.
- O hash do lote usa o conteudo apenas para deduplicacao e rastreabilidade tecnica.
- Cada lote e sugestao respeita `organizationId` e `financialProfileId`.
- Sugestoes ficam em `pending_review`; nenhuma vira lancamento definitivo automaticamente.

## Erros controlados

O modulo lanca `ImportFileError` para:

- arquivo vazio;
- arquivo acima do limite configurado;
- formato nao suportado;
- CSV sem cabecalho minimo;
- OFX sem transacoes `STMTTRN`.

Problemas de linha aparecem no preview como `ImportProblem`, permitindo mostrar ao usuario quais linhas precisam de correcao.

## Limites desta entrega

Ainda nao ha tela de preview, aceite/rejeicao estruturado, politica final de retencao de arquivos brutos, conciliacao automatica ou criacao final de lancamentos a partir das sugestoes. Esses pontos seguem em issues especificas de frontend, privacidade, conciliacao e fila de revisao.
