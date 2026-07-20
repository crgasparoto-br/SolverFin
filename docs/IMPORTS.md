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
5. mapear data, descrição e a estratégia de valor quando necessário;
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
  "consentAccepted": true,
  "csvDelimiter": ";",
  "csvMapping": {
    "version": 2,
    "valueStrategy": "signed",
    "date": "Data",
    "description": "Descrição",
    "amount": "Valor"
  }
}
```

A resposta sempre informa `persisted: false` e um estado:

- `ready`: há linhas válidas para criar um lote;
- `mapping_required`: o usuário deve escolher separador ou mapear colunas;
- `blocked`: nenhuma linha válida pode seguir.

O preview exige conta ativa e consentimento explícito. Ele retorna os cabeçalhos originais, a estratégia detectada, a interpretação aplicada (incluindo colunas ignoradas), no máximo 10 propostas normalizadas (`sourceRowNumber`, data, descrição, tipo, valor e moeda) e diagnósticos por linha. Colunas extras e valores brutos não são devolvidos na amostra. Nenhum `ImportBatch`, `AiSuggestion` ou `Transaction` é criado.

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

A identidade do lote usa SHA-256 e considera conteúdo, conta, separador e mapeamento canônico. Uma repetição no mesmo contexto retorna o lote existente com `duplicateBatch: true`, sem duplicar sugestões. O hash SHA-256 separado do conteúdo permite avisar quando o mesmo arquivo é enviado com uma configuração diferente; lotes legados continuam reconhecidos pela identidade anterior.

O banco persiste:

- nome do arquivo;
- hash contextual SHA-256 e hash SHA-256 do conteúdo;
- conta padrão;
- separador e mapeamento;
- contadores e diagnósticos por linha;
- payload estruturado e versionado de cada proposta.

O conteúdo bruto do CSV não possui coluna de persistência.

## Formatos aceitos

O CSV aceita até 5 MB, UTF-8 com ou sem BOM, quebras `LF` ou `CRLF`, delimitadores `,` e `;`, campos entre aspas, delimitadores dentro de aspas e aspas escapadas com `""`. A detecção testa os dois separadores pelo resultado estrutural e pelo cabeçalho reconhecível; ela não decide pela contagem bruta de caracteres.

Colunas obrigatórias:

- data;
- descrição;
- uma estratégia de valor.

As estratégias aceitas são discriminadas e mutuamente exclusivas:

- `version: 2`, `valueStrategy: signed` e `amount`: valor positivo gera receita e valor negativo gera despesa;
- `version: 2`, `valueStrategy: split`, `incomeAmount` e `expenseAmount`: uma coluna representa entradas e a outra saídas, usando o módulo do número.

`Data Lançamento`, data do movimento ou data da transação têm prioridade sobre `Data Contábil`. `Descrição`, histórico ou memo têm prioridade sobre título/name. Cabeçalhos de saldo são reconhecidos como não transacionais e não podem ser usados como valor.

Tipo e ID externo não aparecem no novo mapeamento genérico. O tipo vem somente do sinal ou da coluna de entrada/saída; `externalId` permanece apenas para leitura de lotes legados. A conta é escolhida no fluxo e não precisa existir como coluna. A categoria é definida durante a revisão. Cabeçalhos ambíguos exigem escolha explícita, o mesmo cabeçalho não pode atender dois campos e linhas com quantidade diferente de colunas recebem diagnóstico seguro sem exposição do conteúdo bruto.

Datas aceitas:

- `AAAA-MM-DD`;
- `DD/MM/AAAA`.

Valores aceitam sinais e padrões `1234.56`, `1,234.56`, `1234,56` e `1.234,56`. Na estratégia assinada, o sinal positivo indica receita e o negativo indica despesa, mesmo que exista uma coluna de tipo no arquivo. Na estratégia separada, somente uma entre entrada e saída pode estar preenchida e diferente de zero; o valor persistido é sempre inteiro positivo em centavos.

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

A edição mantém a linha em `pending_review` e invalida candidaturas determinísticas antigas. Somente data, descrição, valor, tipo, conta e categoria são editáveis; moeda, ID externo, hash, origem e versão permanecem imutáveis.

Antes de criar um lançamento, a própria aprovação executa novamente a detecção determinística com o payload atual. Se houver possível duplicidade ou conciliação, a API persiste os candidatos, mantém o lote em `reviewing` e responde `409 IMPORT_REVIEW_CANDIDATE_PENDING`. A aprovação valida conta, categoria, tipo, data, moeda, valor e descrição dentro da mesma transação que cria o lançamento e finaliza a sugestão.

O lançamento aprovado recebe:

- `source: import`;
- `importBatchId`;
- `aiSuggestionId`;
- `status: posted`.

A chave única por sugestão torna repetições e concorrência idempotentes. Rejeições repetidas também retornam o estado já resolvido sem novo efeito.

Em reenvios da mesma decisão, inclusive chamadas concorrentes que chegam depois da primeira confirmação, a API devolve o recurso já resolvido; não cria segundo lançamento, não altera contadores novamente e não duplica eventos de auditoria.

A aprovação em conjunto rejeita IDs repetidos e processa cada linha em transação independente. A resposta contém `summary` (`requested`, `approved`, `failed`, `idempotent`), `results` para todos os itens e `failures` para compatibilidade. Uma linha inválida, bloqueada por candidato ou já resolvida não desfaz nem oculta o resultado das demais linhas selecionadas.

Na Inbox, a seleção é preservada ao trocar filtros e inclui apenas linhas elegíveis. Os filtros cobrem linhas elegíveis, candidatas pendentes, lançamentos criados, conciliações, duplicidades ignoradas, rejeições e problemas. O resumo do lote separa linhas válidas, pendentes, bloqueadas, aprovadas, conciliadas, ignoradas como duplicadas, rejeitadas, lançamentos vinculados e problemas. Antes da confirmação, a interface mostra quantidade, total de receitas e total de despesas. Em falha ou timeout, o detalhe é recarregado antes de uma nova tentativa. O lote aberto fica em `?importBatchId=...`, permitindo restaurar a revisão após recarregar a página. Lotes finalizados ficam somente para consulta e oferecem acesso ao Extrato.

Quando uma conciliação é confirmada, o detalhe recarregado recupera o lançamento existente vinculado, sem criar uma segunda transação, e mantém a ação **Ver no Extrato** disponível com conta e competência corretas. Após rejeitar todos os candidatos de duplicidade e conciliação, a linha volta a poder seguir pela aprovação normal.

Linhas legadas sem payload estruturado continuam listáveis para preservar o histórico. Elas são exibidas como somente leitura, recebem orientação para nova importação e qualquer tentativa de operação é recusada com erro controlado `IMPORT_SUGGESTION_PAYLOAD_INVALID`.

## Estados do lote

- `reviewing`: possui linha pendente;
- `completed`: todas as linhas foram resolvidas;
- `discarded`: encerrado logicamente pelo usuário;
- `failed`: preview sem linha válida, usado apenas no contrato de domínio.

Lotes descartados não aceitam novas edições, aprovações nem novas varreduras determinísticas. O descarte só é permitido enquanto não houver lançamento financeiro: extrações pendentes passam a `rejected`, candidatos determinísticos pendentes passam a `expired` e qualquer lote com efeito financeiro retorna `IMPORT_BATCH_HAS_FINANCIAL_EFFECTS`. Confirmar uma duplicidade apenas encerra a linha sem criar ou alterar lançamento, portanto o lote continua elegível para descarte; uma conciliação efetiva bloqueia o descarte porque altera o lançamento existente.

## Privacidade, isolamento e auditoria

Todas as operações filtram por `organizationId` e `financialProfileId`. Recursos inexistentes ou pertencentes a outro perfil retornam `TENANT_RESOURCE_NOT_FOUND`, sem revelar o tipo nem a existência do recurso protegido.

A auditoria registra explicitamente o consentimento redigido, criação do lote, criação/correção/decisão de sugestões, criação do lançamento, descarte e expiração de candidaturas, sempre com mudanças redigidas. O CSV bruto, seus campos completos e segredos não são registrados em auditoria ou logs.

## Erros controlados principais

- `IMPORT_CONSENT_REQUIRED`;
- `IMPORT_FILE_EMPTY`;
- `IMPORT_FILE_TOO_LARGE`;
- `IMPORT_FILE_ENCODING_INVALID`;
- `IMPORT_CSV_STRUCTURE_INVALID`;
- `IMPORT_CSV_HEADER_INVALID`;
- `IMPORT_CSV_NO_DATA_ROWS`;
- `IMPORT_CSV_MAPPING_REQUIRED`;
- `IMPORT_CSV_MAPPING_INVALID`;
- `IMPORT_ROW_AMOUNT_REQUIRED`;
- `IMPORT_ROW_AMOUNT_ZERO`;
- `IMPORT_ROW_NUMBER_INVALID`;
- `IMPORT_ROW_SPLIT_AMOUNT_CONFLICT`;
- `IMPORT_ROW_SPLIT_AMOUNT_REQUIRED`;
- `IMPORT_CSV_COLUMN_COUNT_MISMATCH`;
- `IMPORT_CSV_NO_VALID_ROWS`;
- `IMPORT_ACCOUNT_INVALID`;
- `IMPORT_ACCOUNT_CURRENCY_MISMATCH`;
- `IMPORT_CATEGORY_INVALID`;
- `IMPORT_REVIEW_INVALID_TRANSITION`;
- `IMPORT_REVIEW_CANDIDATE_PENDING`;
- `IMPORT_REVIEW_DUPLICATE_SELECTION`;
- `IMPORT_SUGGESTION_PAYLOAD_INVALID`;
- `IMPORT_BATCH_DISCARDED`;
- `IMPORT_BATCH_HAS_FINANCIAL_EFFECTS`;
- `IMPORT_BATCH_READ_ONLY`;
- `TENANT_RESOURCE_NOT_FOUND`.
