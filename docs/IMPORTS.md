# Importação CSV com revisão humana

## Objetivo

O fluxo de CSV reduz lançamentos manuais sem criar efeitos financeiros antes da confirmação do usuário. O arquivo é pré-visualizado, normalizado em linhas estruturadas e descartado; somente metadados mínimos, diagnósticos e propostas revisáveis são persistidos.

OFX continua disponível apenas no parser de domínio e não faz parte do fluxo operacional desta entrega.

## Fluxo na Inbox

Em `/inbox`, a ação **Importar extrato** permite:

1. selecionar um CSV e uma conta ativa;
2. confirmar o consentimento de processamento;
3. detectar ou escolher o separador `,` ou `;`;
4. visualizar cabeçalhos, amostra, contadores e problemas sem persistência;
5. mapear data, descrição, valor, tipo e ID externo quando necessário;
6. criar o lote para revisão;
7. corrigir, aprovar ou rejeitar cada linha;
8. aprovar somente linhas selecionadas;
9. buscar possíveis duplicidades e conciliações;
10. descartar logicamente o lote, preservando histórico e auditoria.

## Contrato de preview

```http
POST /api/import-batches/csv/preview
```

```json
{
  "originalFileName": "extrato-julho.csv",
  "content": "Data;Descrição;Valor\n17/07/2026;Mercado;-123,45",
  "accountId": "ACCOUNT_ID",
  "csvDelimiter": ";",
  "csvMapping": {
    "date": "data",
    "description": "descrição",
    "amount": "valor"
  }
}
```

A resposta sempre informa `persisted: false` e um estado:

- `ready`: há linhas válidas para criar um lote;
- `mapping_required`: o usuário deve escolher separador ou mapear colunas;
- `blocked`: nenhuma linha válida pode seguir.

O preview retorna somente dados normalizados, cabeçalhos, amostra limitada e diagnósticos por linha. Nenhum `ImportBatch`, `AiSuggestion` ou `Transaction` é criado.

## Criação do lote

```http
POST /api/import-batches/csv
```

Campos obrigatórios:

- `originalFileName`;
- `content`;
- `accountId` de uma conta ativa do perfil;
- `consentAccepted: true`.

`csvDelimiter` e `csvMapping` devem repetir a configuração validada no preview quando forem necessários.

A identidade do lote considera conteúdo, conta, separador e mapeamento canônico. Uma repetição no mesmo contexto retorna o lote existente com `duplicateBatch: true`, sem duplicar sugestões.

O banco persiste:

- nome do arquivo;
- hash contextual;
- conta padrão;
- separador e mapeamento;
- contadores e diagnósticos por linha;
- payload estruturado e versionado de cada proposta.

O conteúdo bruto do CSV não possui coluna de persistência.

## Formatos aceitos

O CSV aceita UTF-8 com ou sem BOM, quebras `LF` ou `CRLF`, delimitadores `,` e `;`, campos entre aspas, delimitadores dentro de aspas e aspas escapadas com `""`.

Colunas obrigatórias:

- data;
- descrição;
- valor.

Colunas opcionais:

- tipo;
- ID externo.

A conta é escolhida no fluxo e não precisa existir como coluna. A categoria é definida durante a revisão.

Datas aceitas:

- `AAAA-MM-DD`;
- `DD/MM/AAAA`.

Valores aceitam sinais e padrões `1234.56`, `1,234.56`, `1234,56` e `1.234,56`. Quando o tipo não é informado, o sinal positivo indica receita e o negativo indica despesa.

## Revisão das linhas

```http
GET /api/import-batches?sourceKind=csv&status=all
GET /api/import-batches/:importBatchId
PATCH /api/import-batches/:importBatchId/suggestions/:suggestionId
POST /api/import-batches/:importBatchId/suggestions/:suggestionId/approve
POST /api/import-batches/:importBatchId/suggestions/:suggestionId/reject
POST /api/import-batches/:importBatchId/approve-selected
POST /api/import-batches/:importBatchId/discard
```

A edição mantém a linha em `pending_review` e invalida candidaturas determinísticas antigas. A aprovação valida conta, categoria, tipo, data, moeda, valor e descrição dentro da mesma transação que cria o lançamento e finaliza a sugestão.

O lançamento aprovado recebe:

- `source: import`;
- `importBatchId`;
- `aiSuggestionId`;
- `status: posted`.

A chave única por sugestão torna repetições e concorrência idempotentes. Rejeições repetidas também retornam o estado já resolvido sem novo efeito.

Em reenvios da mesma decisão, a API devolve o recurso já resolvido; não cria segundo lançamento, não altera contadores novamente e não duplica eventos de auditoria.

A aprovação em conjunto retorna `results` e `failures` por item. Uma linha inválida não oculta o resultado das demais linhas selecionadas.

## Estados do lote

- `reviewing`: possui linha pendente;
- `completed`: todas as linhas foram resolvidas;
- `discarded`: encerrado logicamente pelo usuário;
- `failed`: preview sem linha válida, usado apenas no contrato de domínio.

Lotes descartados não aceitam novas edições, aprovações nem novas varreduras determinísticas.

## Privacidade, isolamento e auditoria

Todas as operações filtram por `organizationId` e `financialProfileId`. Recursos de outro perfil retornam resposta segura de não encontrado.

A auditoria registra criação do lote, criação/correção/decisão de sugestões, criação do lançamento, descarte e expiração de candidaturas, sempre com mudanças redigidas. O CSV bruto, seus campos completos e segredos não são registrados em auditoria ou logs.

## Erros controlados principais

- `IMPORT_CONSENT_REQUIRED`;
- `IMPORT_FILE_EMPTY`;
- `IMPORT_FILE_TOO_LARGE`;
- `IMPORT_FILE_ENCODING_INVALID`;
- `IMPORT_CSV_STRUCTURE_INVALID`;
- `IMPORT_CSV_HEADER_INVALID`;
- `IMPORT_CSV_NO_DATA_ROWS`;
- `IMPORT_CSV_MAPPING_REQUIRED`;
- `IMPORT_CSV_NO_VALID_ROWS`;
- `IMPORT_ACCOUNT_INVALID`;
- `IMPORT_CATEGORY_INVALID`;
- `IMPORT_REVIEW_INVALID_TRANSITION`;
- `IMPORT_BATCH_DISCARDED`.
