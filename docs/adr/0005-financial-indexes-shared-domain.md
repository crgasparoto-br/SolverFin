# ADR 0005 — Indices financeiros como dominio compartilhado

## Status

Aceito.

## Contexto

O SolverFin precisa calcular remuneracao prevista de contas com base no CDI e, futuramente, utilizar os mesmos indices no modulo de investimentos.

Manter a base de CDI dentro do extrato criaria acoplamento indevido e duplicacao quando investimentos, projecoes e comparacoes fossem implementados.

## Decisao

Os indices financeiros devem pertencer a um componente compartilhado do dominio financeiro.

O extrato e o futuro modulo de investimentos consumirao a mesma base de indices, mas manterao motores de calculo independentes.

A primeira integracao deve priorizar fonte institucional e rastreavel, com preferencia pelo Banco Central do Brasil via SGS.

A remuneracao de contas sera tratada como previsao conciliavel. O usuario podera substituir o valor previsto pelo valor real creditado, sem recalculo automatico por lancamentos retroativos.

## Consequencias

- CDI, Selic, IPCA e outros indices poderao compartilhar o mesmo modelo persistente;
- o extrato nao dependera da existencia da interface do modulo de investimentos;
- o modulo de investimentos podera evoluir sem duplicar a importacao dos indices;
- os calculos de remuneracao de contas e investimentos permanecerao separados;
- sera necessario garantir idempotencia por indice e data de referencia;
- valores ajustados manualmente nao poderao ser sobrescritos por processamentos automaticos.

## Referencias

- [`../ACCOUNT_REMUNERATION_CDI.md`](../ACCOUNT_REMUNERATION_CDI.md)
