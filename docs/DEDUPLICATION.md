# Motor de deduplicacao de transacoes

Este documento registra o escopo entregue para a issue #47: um motor deterministico para detectar possiveis duplicidades sem excluir, mesclar ou confirmar movimentacoes automaticamente.

## Objetivo

O motor deve reduzir duplicidades vindas de importacao, mensagens bancarias, IA ou cadastro manual, preservando revisao humana, auditoria e isolamento por tenant/contexto.

## Contratos adicionados

O modulo `packages/domain/src/deduplication.ts` expoe:

- `detectDuplicateTransactions`, para comparar um candidato com uma lista de candidatos existentes;
- `buildTransactionDeduplicationCandidate`, para normalizar transacoes existentes;
- `buildImportSuggestionDeduplicationCandidate`, para normalizar sugestoes de importacao;
- `buildBankMessageDeduplicationCandidate`, para normalizar mensagens bancarias ja enriquecidas por parser/IA;
- `buildDeduplicationAuditEntry`, para registrar metadados redigidos de revisao.

## Criterios de comparacao

A pontuacao inicial considera:

- hash tecnico de origem identico;
- identificador externo igual;
- mesmo valor;
- datas proximas em ate dois dias;
- mesma conta;
- mesmo cartao;
- descricao similar por sobreposicao de termos normalizados.

O limiar padrao para criar revisao e `70`. O resultado e sempre `needs_review`; o motor nao faz exclusao, merge ou reconciliacao automatica.

## Privacidade e seguranca

- A deteccao filtra candidatos pelo tenant ativo.
- A auditoria registra somente marcadores redigidos para status, score e motivos.
- Nenhum dado financeiro bruto e enviado para logs pelo contrato de dominio.
- Falsos positivos ficam abaixo do limiar e nao viram revisao.

## Limites desta entrega

Ainda nao ha persistencia real das revisoes, tela de revisao, reconciliacao automatica nem regras especiais para transferencias. Esses pontos devem ser implementados em issues futuras reutilizando os contratos deste modulo.

Perguntas que seguem abertas:

- qual limiar sera ideal apos dados reais de uso;
- se transferencias entre contas terao regra propria;
- como o historico de decisoes do usuario ajustara pesos futuros.
