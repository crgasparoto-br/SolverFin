# Importacao CSV e OFX inicial

Este documento registra o escopo entregue para a issue #45: uma base deterministica para importar extratos CSV e OFX como sugestoes revisaveis antes de qualquer lancamento definitivo.

## Objetivo

A importacao inicial deve reduzir lancamentos manuais sem confirmar movimentos automaticamente. O sistema prepara um preview com linhas validas, problemas encontrados e marcadores de duplicidade para revisao humana.

## Contratos adicionados

O modulo `packages/domain/src/imports.ts` expoe:

- `previewImportedStatement`, para validar e transformar um arquivo em preview;
- `ImportBatchDraft`, com origem, nome do arquivo, hash, data de recebimento e contadores;
- `ImportTransactionSuggestion`, com sugestao de receita/despesa pendente de revisao;
- `ImportProblem`, com erros e avisos por linha;
- `buildStableImportHash`, para hash deterministico usado na deduplicacao inicial.

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

O objetivo e cobrir OFX simples no MVP. Layouts bancarios especificos devem entrar em issues menores quando forem conhecidos.

## Regras de seguranca e privacidade

- O arquivo bruto nao e persistido pelo contrato de dominio.
- Logs nao sao gerados pelo parser.
- O hash do lote usa o conteudo apenas para deduplicacao e rastreabilidade tecnica.
- Cada sugestao recebe hash proprio por linha e contexto financeiro.
- Todas as sugestoes carregam `organizationId` e `financialProfileId`.
- Sugestoes ficam como `pending_review` ou `duplicate`; nenhuma vira lancamento definitivo automaticamente.

## Erros controlados

O modulo lança `ImportFileError` para:

- arquivo vazio;
- arquivo acima do limite configurado;
- formato nao suportado;
- CSV sem cabecalho minimo;
- OFX sem transacoes `STMTTRN`.

Problemas de linha aparecem no preview como `ImportProblem`, permitindo mostrar ao usuario quais linhas precisam de correcao.

## Limites desta entrega

Ainda nao ha upload real, API executavel, armazenamento de lote, tela de preview ou politicas finais de retencao de arquivo bruto. Esses pontos dependem das proximas issues de backend, frontend e privacidade.

Perguntas que seguem abertas:

- quais layouts CSV bancarios serao suportados primeiro;
- se arquivos brutos serao descartados imediatamente ou preservados por auditoria;
- qual politica de retencao sera aprovada para anexos e extratos.
