# Importação CSV e OFX com revisão humana

## Objetivo

O fluxo de importação reduz lançamentos manuais sem criar efeitos financeiros antes da confirmação do usuário. CSV e OFX são pré-visualizados, normalizados em linhas estruturadas e descartados da memória ao fim da requisição. Somente metadados mínimos, hashes, diagnósticos seguros e propostas revisáveis são persistidos.

## Fluxo na Inbox

Em `/inbox`, a ação **Importar extrato** permite:

1. selecionar um arquivo `.csv` ou `.ofx` e uma conta ativa;
2. confirmar o consentimento de processamento;
3. pré-visualizar contadores, propostas e problemas sem persistência do arquivo bruto;
4. no CSV, detectar ou escolher o separador e mapear colunas quando necessário;
5. criar o lote para revisão;
6. corrigir, aprovar ou rejeitar cada linha;
7. aprovar somente linhas selecionadas;
8. buscar possíveis duplicidades e conciliações;
9. descartar logicamente o lote quando ainda não houver efeito financeiro.

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

O CSV também aceita `csvDelimiter` e `csvMapping`:

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

O preview sempre informa `persisted: false`.

Estados:

- `ready`: há linhas válidas para criar um lote;
- `mapping_required`: somente CSV; o usuário deve escolher separador ou mapear colunas;
- `blocked`: nenhuma linha válida pode seguir.

O preview exige conta ativa e consentimento explícito. Ele retorna no máximo 10 propostas normalizadas e diagnósticos por linha. No CSV, também retorna cabeçalhos, estratégia detectada e interpretação aplicada. Nenhum `ImportBatch`, `AiSuggestion`, candidato determinístico ou `Transaction` é criado; somente um evento de auditoria redigido registra o resultado da tentativa.

## Criação do lote

```http
POST /api/import-batches/csv
POST /api/import-batches/ofx
```

Campos obrigatórios:

- `originalFileName`;
- `content`;
- `accountId` como UUID canônico de uma conta ativa do perfil;
- `consentAccepted: true`.

Um `accountId` sintaticamente inválido é recusado com `IMPORT_ACCOUNT_INVALID` antes da consulta da conta no PostgreSQL. A tentativa ainda pode registrar uma auditoria redigida da falha, sem consultar nem revelar o recurso informado.

Uma criação nova retorna `201`. Repetir a mesma identidade retorna `200`, o lote existente e `duplicateBatch: true`, sem duplicar sugestões. Requisições concorrentes convergem para um único lote pela restrição única e por nova leitura do lote vencedor.

### Identidade por formato

A identidade OFX usa SHA-256 e considera origem, organização, perfil financeiro, conta selecionada e hash seguro do conteúdo bruto exatamente como recebido. Espaços, BOM e demais bytes de borda participam do limite, do hash e da identidade antes de qualquer normalização usada somente para interpretar o documento.

A identidade CSV usa SHA-256 e considera origem, organização, perfil financeiro, conta, conteúdo, separador e mapeamento canônico. Lotes CSV legados continuam reconhecidos pela identidade anterior. O hash separado do conteúdo permite emitir `IMPORT_BATCH_CONFIGURATION_CHANGED` quando o mesmo arquivo é enviado com outra conta, separador ou mapeamento.

No OFX, o mesmo conteúdo associado a outra conta também forma uma identidade diferente e recebe o diagnóstico de configuração alterada.

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

Valores aceitam sinais e padrões `1234.56`, `1,234.56`, `1234,56` e `1.234,56`. Na estratégia assinada, o sinal positivo indica receita e o negativo gera despesa, mesmo que exista uma coluna textual de tipo. Na estratégia separada, somente uma entre entrada e saída pode estar preenchida e diferente de zero; o valor persistido é sempre inteiro positivo em centavos.

## OFX

O OFX aceita até 5 MB e texto UTF-8 com ou sem BOM. O limite é calculado sobre o conteúdo bruto antes de `trim`, remoção de BOM, decodificação, máscara ou canonicalização; um documento composto somente por espaços retorna `IMPORT_FILE_EMPTY`, e espaços externos que levem o conteúdo a `5 MB + 1 byte` retornam `IMPORT_FILE_TOO_LARGE`. O subconjunto operacional reconhece:

- XML com declaração opcional e envelope raiz `<OFX>...</OFX>`;
- SGML com cabeçalho `OFXHEADER`/`DATA:OFXSGML` ou envelope iniciado diretamente em `<OFX>`;
- seção de extrato `STMTRS` ou `CCSTMTRS`;
- lista completa `<BANKTRANLIST>...</BANKTRANLIST>`;
- ao menos um bloco `STMTTRN`.

Conteúdo arbitrário que apenas contenha `STMTTRN`, envelope truncado, seção de extrato ausente, lista incompleta ou dados após o fechamento de `OFX` falham com `IMPORT_OFX_INVALID`. Entidades XML conhecidas e referências numéricas são decodificadas nos campos normalizados. A única instrução de processamento aceita é a declaração XML opcional antes do envelope raiz; qualquer outra construção `<?...?>`, inclusive incompleta ou contendo tags financeiras aparentes, é recusada com `IMPORT_OFX_INVALID` antes da extração dos campos.

Um documento cujas tags estão integralmente balanceadas é tratado como XML mesmo sem declaração. Nessa modalidade, todas as tags precisam estar corretamente aninhadas e fechadas, e o pai imediato de cada campo consumido é validado pela pilha estrutural. O ramo SGML continua aceitando o fechamento implícito de escalares, como `<NAME><MEMO>Descrição`, mas uma tag escalar que possua fechamento explícito atua como contêiner real; qualquer campo financeiro dentro dela é recusado.

As quatro rotas de importação reservam até 32 MiB para o envelope JSON, permitindo transportar com segurança o arquivo de 5 MB mesmo quando caracteres precisam ser escapados. As demais rotas da API mantêm o limite padrão de 1.000.000 bytes.

Regras de normalização:

- `DTPOSTED` fornece a data; o prefixo `AAAAMMDD` é usado mesmo quando há hora e timezone;
- `TRNAMT` é obrigatório, diferente de zero e aceita somente sinal opcional, dígitos e ponto decimal opcional com no máximo duas casas. A conversão para centavos é decimal exata, sem arredondamento binário; vírgula, separador de milhar, precisão adicional e partes inteiras acima de 13 dígitos recebem `IMPORT_ROW_NUMBER_INVALID` e não geram proposta;
- o sinal de `TRNAMT` é a fonte canônica: negativo gera `expense/outflow`, positivo gera `income/inflow`;
- `TRNTYPE` é apenas diagnóstico; conflito com o sinal gera aviso e não altera a classificação;
- descrição usa `NAME`, depois `MEMO`, depois `FITID`;
- `FITID`, quando presente, é preservado como `externalId`;
- `CURDEF`, quando presente, deve ser filho direto de `STMTRS` ou `CCSTMTRS`, fora de `BANKTRANLIST`, e define a moeda do arquivo; se ausente, usa-se a moeda da conta selecionada;
- `CURDEF` diferente da moeda da conta bloqueia o arquivo com `IMPORT_ACCOUNT_CURRENCY_MISMATCH`;
- a conta escolhida pelo usuário é sempre a conta canônica das propostas.

Cada `STMTTRN` reconhecido deve ser filho direto do `BANKTRANLIST` canônico; uma transação dentro de `EXTENSION`, `WRAPPER`, `MEMO` ou qualquer outro contêiner intermediário, genérico ou escalar explicitamente fechado, torna o arquivo inválido em todos os modos aceitos.

Cada um dos campos consumidos em uma movimentação — `DTPOSTED`, `TRNAMT`, `FITID`, `NAME`, `MEMO` e `TRNTYPE` — deve ser um filho direto do respectivo `STMTTRN` e pode ocorrer no máximo uma vez. Uma ocorrência aninhada em contêiner genérico ou em tag escalar explicitamente fechada não é reinterpretada como dado financeiro e torna o arquivo inválido em XML com declaração, XML sem declaração e SGML. Uma repetição, ainda que os valores coincidam, também torna a estrutura ambígua e retorna `IMPORT_OFX_INVALID`; ocorrências em comentários ou CDATA permanecem inativas e não entram na cardinalidade. Instruções de processamento diferentes da declaração XML não são tratadas como conteúdo inativo: o arquivo inteiro é recusado para impedir que tags aparentes sejam reinterpretadas como dados financeiros.

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
POST /api/import-batches/:importBatchId/detect-duplicates
POST /api/import-batches/:importBatchId/discard
```

Sem `sourceKind`, a listagem retorna CSV e OFX. O filtro aceita somente `csv` ou `ofx`.

A edição mantém a linha em `pending_review` e invalida candidaturas determinísticas antigas. Data, descrição, valor, tipo, conta de referência, outra conta e categoria podem ser revisados; moeda, ID externo, hash e origem permanecem imutáveis. Novas linhas usam `TransactionExtractionPayloadV2`, que preserva `direction: inflow|outflow`. Sugestões V1 pendentes derivam a direção por `income → inflow` e `expense → outflow` e só migram para V2 quando a edição exige transferência; linhas históricas resolvidas não são reinterpretadas.

Antes de criar um lançamento, a própria aprovação executa novamente a detecção determinística com o payload atual. Se houver possível duplicidade ou conciliação, a API persiste os candidatos, mantém o lote em `reviewing` e responde `409 IMPORT_REVIEW_CANDIDATE_PENDING`. A aprovação valida conta, categoria, tipo, data, moeda, valor e descrição dentro da mesma transação que cria o lançamento e finaliza a sugestão.

O lançamento aprovado recebe:

- `source: import`;
- `importBatchId`;
- `aiSuggestionId`;
- `status: posted`.

### Fila unificada da Inbox

As linhas `transaction_extraction` de CSV/OFX e suas candidaturas `categorization`, `deduplication` e `reconciliation` também aparecem em `/api/ai-review-queue` e na área unificada de revisão da Inbox. Esse caminho não substitui os serviços de importação: edição e aprovação de extrações continuam delegando ao mesmo contrato canônico descrito acima, preservando lote, detecção determinística, transferência, idempotência e auditoria.

A fila mantém `kind`, `status` e `confidence` na URL junto de `profileId`. Antes de aprovar, rejeitar ou editar, a interface lê o payload atual e envia `expectedFingerprint`. Versão obsoleta, lote descartado, item já resolvido ou alvo inelegível retorna conflito controlado e não deixa estado, efeito e auditoria divergentes.

Editar uma extração pela fila mantém a linha em `pending_review` e invalida candidatos baseados na versão anterior. Aprovar `categorization` pode incorporar a categoria diretamente na extração pendente; essa mudança gera novo fingerprint e expira candidaturas irmãs que observavam a versão anterior. Aprovar `deduplication` ou `reconciliation` delega aos serviços determinísticos existentes. IDs internos usados como valores de controles são sempre recortados pelo tenant e apresentados na UI como nomes/rótulos.

### Categorização e aprendizado por correção

As linhas CSV e OFX pendentes usam o mesmo pipeline de categorização das demais `transaction_extraction`: regra explícita, correção confirmada, histórico do perfil, IA autorizada e revisão manual. O resultado é uma sugestão `categorization` V1 vinculada à linha e ao fingerprint observado.

Quando o usuário corrige `categoryId` em `PATCH /api/import-batches/:importBatchId/suggestions/:suggestionId`, a correção e o sinal de aprendizado são persistidos na mesma transação. A categoria é revalidada no perfil e no tipo da linha; falha na correção não deixa aprendizado órfão. O sinal vale apenas para sugestões futuras e não altera linhas ou lançamentos históricos retroativamente.

A mesma origem e a mesma versão de regras/aprendizado/histórico são idempotentes. Correções conflitantes, categorias arquivadas e provider indisponível degradam para revisão explícita, sem categoria inventada. Consulte `docs/ai/category-learning.md`.

### Transferências na revisão

O campo **Tipo** oferece Receita, Despesa e Transferência. A inferência inicial continua limitada ao sinal ou às colunas Entrada/Saída; textos como PIX ou TED não classificam uma linha automaticamente.

Ao selecionar transferência, o usuário informa uma **Outra conta** ativa, distinta, do mesmo perfil e moeda. A conta da linha permanece como conta de referência do extrato:

- `outflow`: referência é origem e a outra conta é destino;
- `inflow`: outra conta é origem e a referência é destino.

A aprovação cria uma única `Transaction kind=transfer`, com `transferGroupId` igual ao próprio identificador e dois movimentos derivados pelo domínio: débito na origem e crédito no destino. Categoria é opcional e, quando informada, deve ser ativa e do tipo `transfer`.

A outra ponta importada é detectada pelo par de contas, valor, moeda, data e tipo. A conciliação vincula a nova sugestão à transferência existente sem sobrescrever `aiSuggestionId` ou `importBatchId` originais. Um lock transacional por identidade canônica faz aprovações concorrentes convergirem para uma criação e uma conciliação/idempotência.

A chave única por sugestão torna repetições e concorrência idempotentes. Rejeições repetidas também retornam o estado já resolvido sem novo efeito.

Em reenvios da mesma decisão, inclusive chamadas concorrentes que chegam depois da primeira confirmação, a API devolve o recurso já resolvido; não cria segundo lançamento, não altera contadores novamente e não duplica eventos de auditoria.

A aprovação em conjunto rejeita IDs repetidos e processa cada linha em transação independente. A resposta contém `summary` (`requested`, `approved`, `failed`, `created`, `reconciled`, `idempotent`, `blocked`, `transferCount`, `transferTotalMinor`), `results` com o desfecho de cada item e `failures` para compatibilidade. Uma linha inválida, bloqueada por candidato ou já resolvida não desfaz nem oculta o resultado das demais linhas selecionadas.

Na Inbox, a seleção é preservada ao trocar filtros e inclui apenas linhas elegíveis. Os filtros cobrem linhas elegíveis, candidatas pendentes, lançamentos criados, conciliações, duplicidades ignoradas, rejeições e problemas. O resumo do lote separa linhas válidas, pendentes, bloqueadas, aprovadas, conciliadas, ignoradas como duplicadas, rejeitadas, lançamentos vinculados e problemas. Antes da confirmação, a interface mostra quantidade, total de receitas, total de despesas e quantidade/total absoluto de transferências. Transferências não entram em receitas, despesas nem resultado. Em falha ou timeout, o detalhe é recarregado antes de uma nova tentativa. Lotes finalizados ficam somente para consulta e oferecem acesso ao Extrato.

No modal **Corrigir linha**, a Inbox carrega a taxonomia canônica com `status=all` em uma única requisição para a página. O seletor nativo mostra caminhos completos, preserva o `categoryId` selecionado e oferece somente categorias ativas compatíveis com o tipo da linha. Categorias arquivadas podem aparecer apenas como ancestrais do caminho; pais ausentes e ciclos legados usam rótulos de fallback sem bloquear a revisão. Ao mudar entre receita, despesa e transferência, uma categoria incompatível ou indisponível é removida com aviso, mantendo os demais campos e o foco no modal.

Quando uma conciliação é confirmada, o detalhe recarregado recupera o lançamento existente vinculado, sem criar uma segunda transação, e mantém a ação **Ver no Extrato** disponível com conta e competência corretas. Após rejeitar todos os candidatos de duplicidade e conciliação, a linha volta a poder seguir pela aprovação normal.

Linhas legadas sem payload estruturado continuam listáveis para preservar o histórico. Elas são exibidas como somente leitura, recebem orientação para nova importação e qualquer tentativa de operação é recusada com erro controlado `IMPORT_SUGGESTION_PAYLOAD_INVALID`.

## Estados do lote

- `reviewing`: possui linha pendente;
- `completed`: todas as linhas foram resolvidas;
- `discarded`: encerrado logicamente pelo usuário;
- `failed`: preview sem linha válida; não é persistido pela criação normal.

Lotes descartados não aceitam novas edições, aprovações nem novas varreduras determinísticas. O descarte só é permitido enquanto não houver efeito financeiro: extrações pendentes passam a `rejected`, candidatos determinísticos pendentes passam a `expired` e qualquer lote com efeito financeiro retorna `IMPORT_BATCH_HAS_FINANCIAL_EFFECTS`. Confirmar uma duplicidade apenas encerra a linha sem criar ou alterar lançamento, portanto o lote continua elegível para descarte; uma conciliação efetiva bloqueia o descarte porque altera o lançamento existente.

## Privacidade, isolamento e auditoria

Todas as operações filtram por `organizationId` e `financialProfileId`. Recursos inexistentes ou pertencentes a outro perfil retornam `TENANT_RESOURCE_NOT_FOUND`, sem revelar o tipo nem a existência do recurso protegido.

A auditoria registra consentimento redigido, preview bem-sucedido, falhas controladas de preview ou criação, criação do lote e das sugestões, correções, decisões, criação ou conciliação de lançamento, descarte e expiração de candidaturas, sempre com mudanças redigidas. Conteúdo bruto CSV/OFX, campos bancários completos e segredos não são registrados. O evento de aprendizado registra apenas contexto, identificador e ação, sem descrição financeira. Quando a própria persistência de auditoria estiver indisponível, o erro funcional original é preservado para não substituir uma falha controlada por mensagem interna sem relação com a tentativa.

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
- `IMPORT_TRANSFER_DIRECTION_INVALID`;
- `IMPORT_TRANSFER_OTHER_ACCOUNT_REQUIRED`;
- `IMPORT_TRANSFER_OTHER_ACCOUNT_INVALID`;
- `IMPORT_TRANSFER_SAME_ACCOUNT`;
- `IMPORT_TRANSFER_CURRENCY_MISMATCH`;
- `IMPORT_CATEGORY_INVALID`;
- `IMPORT_CATEGORY_KIND_MISMATCH`;
- `IMPORT_REVIEW_INVALID_TRANSITION`;
- `IMPORT_REVIEW_CANDIDATE_PENDING`;
- `IMPORT_REVIEW_DUPLICATE_SELECTION`;
- `IMPORT_SUGGESTION_PAYLOAD_INVALID`;
- `IMPORT_BATCH_DISCARDED`;
- `IMPORT_BATCH_HAS_FINANCIAL_EFFECTS`;
- `IMPORT_BATCH_READ_ONLY`;
- `TENANT_RESOURCE_NOT_FOUND`.

CSV:

- `IMPORT_CSV_STRUCTURE_INVALID`;
- `IMPORT_CSV_HEADER_INVALID`;
- `IMPORT_CSV_NO_DATA_ROWS`;
- `IMPORT_CSV_MAPPING_REQUIRED`;
- `IMPORT_CSV_MAPPING_INVALID`;
- `IMPORT_ROW_SPLIT_AMOUNT_CONFLICT`;
- `IMPORT_ROW_SPLIT_AMOUNT_REQUIRED`;
- `IMPORT_CSV_COLUMN_COUNT_MISMATCH`;
- `IMPORT_CSV_NO_VALID_ROWS`.

OFX:

- `IMPORT_OFX_INVALID`;
- `IMPORT_OFX_NO_VALID_ROWS`;
- `IMPORT_OFX_TRNTYPE_CONFLICT`.

## Deduplicação e conciliação generalizadas na fila

A issue #566 mantém o endpoint especializado do lote e acrescenta uma varredura comum na fila unificada. Qualquer linha CSV/OFX pendente já convertida em `transaction_extraction` é comparada pelo mesmo motor usado para mensagens bancárias e extrações de IA.

A candidatura usa o fingerprint estruturado da sugestão de origem, tipo e lançamento alvo para convergir de forma idempotente. A versão observada do alvo também participa da identidade persistente para que uma candidatura antiga possa expirar e uma nova seja criada quando o lançamento comparado muda mas continua elegível.

Uma edição da linha invalida candidaturas baseadas no fingerprint anterior. Alteração ou indisponibilidade do alvo também torna a decisão obsoleta. Aprovar duplicidade rejeita a linha sem alterar `Transaction`; aprovar conciliação revalida o alvo, concilia o lançamento, aprova/vincula a origem, expira irmãs e recalcula o lote na mesma transação.

Para transferências, a varredura exige o par de contas compatível, moeda, valor e tolerância temporal; descrição semelhante não compensa divergência de conta de destino.
