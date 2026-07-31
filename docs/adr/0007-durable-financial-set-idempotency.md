# ADR 0007 - Idempotência durável para criação de conjuntos financeiros

- Status: aceito
- Data: 2026-07-31
- Issue: #553

## Contexto

A criação manual de um parcelamento no Extrato produz várias `Installment` e várias `Transaction` vinculadas. Repetições de envio, timeout, múltiplas instâncias da API e concorrência não podem duplicar efeitos financeiros nem deixar um conjunto parcial.

## Decisão

A API persiste a identidade da tentativa em `InstallmentCreationRequest`, sempre escopada por `organizationId`, `financialProfileId` e `idempotencyKey` UUID.

A mesma transação PostgreSQL:

1. adquire um advisory lock transacional pela chave escopada;
2. verifica fingerprint normalizado do payload de negócio;
3. cria todas as parcelas, transações e auditorias;
4. persiste a resposta canônica para replay.

A chave não integra o fingerprint. Replay com a mesma chave e payload retorna os mesmos identificadores; reutilização com payload diferente falha com conflito. Rollback remove efeitos e não consome a chave.

## Consequências

- O contrato funciona após restart e entre múltiplas instâncias.
- Concorrência da mesma tentativa converge para um único conjunto.
- A tabela de idempotência permanece enquanto o perfil financeiro existir.
- Respostas persistidas devem conter apenas dados operacionais minimizados, nunca tokens ou dados brutos sensíveis.
- Novos endpoints financeiros em lote podem reutilizar o padrão, mas precisam de issue e contrato próprios antes de compartilhar uma abstração genérica.
