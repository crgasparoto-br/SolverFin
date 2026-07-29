# Importação CSV e OFX com revisão humana

## Objetivo

O fluxo de importação reduz lançamentos manuais sem criar efeitos financeiros antes da confirmação do usuário. CSV e OFX são pré-visualizados, normalizados em linhas estruturadas e descartados da memória ao fim da requisição. Somente metadados mínimos, hashes, diagnósticos seguros e propostas revisáveis são persistidos.

## Fluxo na Inbox

Em `/inbox`, a ação **Importar extrato** permite:

1. selecionar um arquivo `.csv` ou `.ofx` e uma conta ativa;
2. confirmar o consentimento de processamento;
3. pré-visualizar contadores, propostas e problemas sem persistência;
4. no CSV, detectar ou escolher o separador e mapear colunas quando necessário;
5. criar o lote para revisão;
6. corrigir, aprovar ou rejeitar cada linha;
7. aprovar somente linhas selecionadas;
8. buscar possíveis duplicidades e conciliações;
9. descartar logicamente o lote sem efeitos financeiros.

O histórico combina CSV e OFX e identifica a origem de cada lote. O lote aberto permanece em `?importBatchId=...`, inclusive após recarregar a página. Os controles de separador e mapeamento são exclusivos do CSV.

Após timeout ou falha ambígua na criação, a Inbox recarrega o histórico persistido antes de reabilitar a tentativa. Assim, um lote criado pelo servidor apesar da perda da resposta reaparece como fonte de verdade e pode ser aberto sem depender do conteúdo bruto mantido em memória. Origens conhecidas recebem rótulos explícitos; uma origem desconhecida nunca é apresentada silenciosamente como CSV.

## Contratos de preview

```http
POST /api/import-batches/csv/preview
POST /api/import-batches/ofx/preview
```

Payload comum:

```json
{
  "originalFileName": "extrato-julho.ofx",
  "content": "OFX_HEADER_E_CONTEUDO",
  "accountId": "ACCOUNT_ID",
  "consentAccepted": true
}
```

O CSV também aceita `csvDelimiter` e `csvMapping`. O preview sempre informa `persisted: false`.

Estados:

- `ready`: há linhas válidas para criar um lote;
- `mapping_required`: somente CSV; o usuário deve escolher separador ou mapear colunas;
- `blocked`: nenhuma linha válida pode seguir.

O preview exige conta ativa e consentimento explícito. Ele retorna no máximo 10 propostas normalizadas e diagnósticos por linha. Nenhum `ImportBatch`, `AiSuggestion` ou `Transaction` é criado; somente um evento de auditoria redigido registra o resultado da tentativa.

## Criação do lote

```http
POST /api/import-batches/csv
POST /api/import-batches/ofx
```

Campos obrigatórios:

- `originalFileName`;
- `content`;
- `accountId` de uma conta ativa do perfil;
- `consentAccepted: true`.

Uma criação nova retorna `201`. Repetir o mesmo arquivo no mesmo contexto retorna `200`, o lote existente e `duplicateBatch: true`, sem duplicar sugestões. A identidade contextual considera origem, organização, perfil, conta e hash do conteúdo. Requisições concorrentes convergem para um único lote pela restrição única e por nova leitura do lote vencedor.

O banco persiste:

- nome do arquivo;
- origem `csv` ou `ofx`;
- hash contextual SHA-256 e hash SHA-256 do conteúdo;
- conta padrão;
- contadores e diagnósticos seguros;
- payload estruturado e versionado de cada proposta;
- no CSV, separador e mapeamento canônico.

O conteúdo bruto do arquivo não possui coluna de persistência e não aparece em logs, auditoria, respostas de erro ou documentação operacional.

## CSV

O CSV aceita até 5 MB, UTF-8 com ou sem BOM, quebras `LF` ou `CRLF`, delimitadores `,` e `;`, campos entre aspas, delimitadores dentro de aspas e aspas escapadas com `""`.

Colunas obrigatórias:

- data;
- descrição;
- uma estratégia de valor.

Estratégias:

- `version: 2`, `valueStrategy: signed` e `amount`: positivo gera receita e negativo gera despesa;
- `version: 2`, `valueStrategy: split`, `incomeAmount` e `expenseAmount`: colunas separadas de entrada e saída, usando o módulo do número.

Datas aceitas: `AAAA-MM-DD` e `DD/MM/AAAA`. Valores aceitam `1234.56`, `1,234.56`, `1234,56` e `1.234,56`. Tipo e direção derivam exclusivamente da estratégia de valor; uma coluna textual de tipo não sobrepõe o sinal.

## OFX

O OFX aceita até 5 MB, texto UTF-8 com ou sem BOM e variações XML ou SGML usuais. O documento deve conter ao menos um bloco `STMTTRN`. As quatro rotas de importação reservam até 32 MiB para o envelope JSON, permitindo transportar com segurança o arquivo de 5 MB mesmo quando caracteres precisam ser escapados; as demais rotas da API mantêm o limite padrão de 1.000.000 bytes.

Regras de normalização:

- `DTPOSTED` fornece a data; o prefixo `AAAAMMDD` é usado mesmo quando há hora e timezone;
- `TRNAMT` é obrigatório, diferente de zero e convertido para centavos;
- o sinal de `TRNAMT` é a fonte canônica: negativo gera `expense/outflow`, positivo gera `income/inflow`;
- `TRNTYPE` é apenas diagnóstico; conflito com o sinal gera aviso e não altera a classificação;
- descrição usa `NAME`, depois `MEMO`, depois `FITID`;
- `FITID`, quando presente, é preservado como `externalId`;
- `CURDEF` define a moeda do arquivo; se ausente, usa-se a moeda da conta selecionada;
- `CURDEF` diferente da moeda da conta bloqueia o arquivo com `IMPORT_ACCOUNT_CURRENCY_MISMATCH`;
- a conta escolhida pelo usuário é sempre a conta canônica das propostas.

Linhas inválidas geram diagnósticos por posição e não criam propostas. Se nenhuma linha for válida, o preview fica `blocked` e a criação retorna `IMPORT_OFX_NO_VALID_ROWS`. O parser não devolve campos bancários não utilizados nem valores brutos em problemas.

Sugestões OFX são persistidas como `transaction_extraction`, `pending_review`, com `provider: solverfin-import-ofx` e `model: ofx-parser-v1`, e seguem o mesmo fluxo de revisão do CSV.

## Listagem e revisão compartilhada

```http
GET /api/import-batches?status=all
GET /api/import-batches?sourceKind=csv&status=all
GET /api/import-batches?sourceKind=ofx&status=all
GET /api/import-batches/:importBatchId
PATCH /api/import-batches/:importBatchId/suggestions/:suggestionId
POST /api/import-batches/:importBatchId/suggestions/:suggestionId/approve
POST /api/import-batches/:importBatchId/suggestions/:suggestionId/reject
POST /api/import-batches/:importBatchId/approve-selected
POST /api/import-batches/:importBatchId/discard
```

Sem `sourceKind`, a listagem retorna CSV e OFX. O filtro aceita somente `csv` ou `ofx`.

A edição mantém a linha em `pending_review` e invalida candidaturas determinísticas antigas. Data, descrição, valor, tipo, conta, outra conta e categoria podem ser revisados; moeda, ID externo, hash e origem permanecem imutáveis.

Antes de criar um lançamento, a aprovação executa novamente a detecção determinística. Possíveis duplicidades ou conciliações mantêm o lote em `reviewing` e retornam `409 IMPORT_REVIEW_CANDIDATE_PENDING`. A aprovação valida os dados na mesma transção que cria ou concilia o lançamento.

O lançamento aprovado recebe `source: import`, `importBatchId`, `aiSuggestionId` e `status: posted`. Reenvios e concorrência são idempotentes. A aprovação em conjunto processa cada linha em transação independente e retorna resultados individualizados.

Transferências continuam sendo uma decisão de revisão: a inferência inicial de CSV e OFX fica limitada ao sinal/estratégia de valor. A outra conta deve ser ativa, distinta, do mesmo perfil e moeda.

## Estados do lote

- `reviewing`: possui linha pendente;
- `completed`: todas as linhas foram resolvidas;
- `discarded`: encerrado logicamente pelo usuário;
- `failed`: preview sem linha válida; não é persistido pela criação normal.

Lotes descartados não aceitam novas operações. O descarte só é permitido enquanto não houver efeito financeiro.

## Privacidade, isolamento e auditoria

Todas as operações filtram por `organizationId` e `financialProfileId`. Recursos inexistentes ou pertencentes a outro perfil retornam `TENANT_RESOURCE_NOT_FOUND` sem revelar sua existência.

A auditoria registra consentimento redigido, preview bem-sucedido, falhas controladas de preview ou criação, criação do lote e das sugestões, correções, decisões e efeitos financeiros apenas com mudanças redigidas. Conteúdo bruto CSV/OFX, campos bancários completos e segredos não são registrados. Quando a própria persistência de auditoria estiver indisponível, o erro funcional original é preservado para não substituir uma falha controlada por mensagem interna sem relação com a tentativa.

## Erros controlados principais

Comuns:

- `IMPORT_CONSENT_REQUIRED`;
- `IMPORT_FILE_EMPTY`;
- `IMPORT_FILE_TOO_LARGE`;
- `IMPORT_FILE_ENCODING_INVALID`;
- `IMPORT_FILE_KIND_UNSUPPORTED`;
- `IMPORT_ACCOUNT_INVALID`;
- `IMPORT_ACCOUNT_CURRENCY_MISMATCH`;
- `IMPORT_ROW_DATE_INVALID`;
- `IMPORT_ROW_DESCRIPTION_REQUIRED`;
- `IMPORT_ROW_AMOUNT_REQUIRED`;
- `IMPORT_ROW_AMOUNT_ZERO`;
- `IMPORT_ROW_NUMBER_INVALID`;
- `IMPORT_REVIEW_INVALID_TRANSITION`;
- `IMPORT_REVIEW_CANDIDATE_PENDING`;
- `IMPORT_SUGGESTION_PAYLOAD_INVALID`;
- `IMPORT_BATCH_DISCARDED`;
- `IMPORT_BATCH_HAS_FINANCIAL_EFFECTS`;
- `TENANT_RESOURCE_NOT_FOUND`.

CSV:

- `IMPORT_CSV_STRUCTURE_INVALID`;
- `IMPORT_CSV_HEADER_INVALID`;
- `IMPORT_CSV_NO_DATA_ROWS`;
- `IMPORT_CSV_MAPPING_REQUIRED`;
- `IMPORT_CSV_MAPPING_INVALID`;
- `IMPORT_CSV_COLUMN_COUNT_MISMATCH`;
- `IMPORT_CSV_NO_VALID_ROWS`.

OFX:

- `IMPORT_OFX_INVALID`;
- `IMPORT_OFX_NO_VALID_ROWS`;
- `IMPORT_OFX_TRNTYPE_CONFLICT`.
