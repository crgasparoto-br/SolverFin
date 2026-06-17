# Contrato de integracao - Limite MEI

Este documento orienta como receitas do SolverFin devem alimentar controle de limite MEI. As regras sao propostas tecnicas e dependem de validacao de produto/contabilidade antes de producao.

## Receitas consideradas

Entram no calculo proposto:

- lancamentos `income` do perfil financeiro `mei`;
- receitas profissionais confirmadas ou conciliadas;
- recebimentos importados e revisados pelo usuario;
- ajustes positivos explicitamente classificados como receita MEI.

Nao entram por padrao:

- receitas de perfil pessoal/familia;
- transferencias entre contas;
- lancamentos `suggested` ainda nao revisados;
- valores cancelados, estornados ou voided;
- receitas com contexto ambiguo ate revisao.

## Competencia e recebimento

| Situacao                                     | Tratamento proposto                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Receita recebida no mesmo mes da competencia | Considerar no mes informado.                                               |
| Receita recebida em mes diferente            | Registrar competencia e recebimento; relatorio deve deixar criterio claro. |
| Receita prevista sem pagamento               | Nao contar como realizada; pode aparecer como previsao.                    |
| Receita cancelada                            | Remover do acumulado a partir da competencia afetada.                      |
| Estorno parcial                              | Registrar ajuste negativo vinculado a receita original.                    |
| Ajuste manual                                | Exigir motivo e auditoria.                                                 |

## Campos recomendados para contrato futuro

| Campo                  | Obrigatorio | Observacao                                             |
| ---------------------- | ----------- | ------------------------------------------------------ |
| `transactionId`        | Sim         | ID do lancamento no SolverFin.                         |
| `tenantId`             | Sim         | Organizacao/tenant autorizado.                         |
| `financialProfileId`   | Sim         | Perfil MEI.                                            |
| `competenceMonth`      | Sim         | `YYYY-MM`.                                             |
| `receivedOn`           | Opcional    | Obrigatorio para receita realizada.                    |
| `amountMinor`          | Sim         | Centavos, positivo para receita, negativo para ajuste. |
| `currency`             | Sim         | Moeda ISO 4217.                                        |
| `status`               | Sim         | prevista, recebida, cancelada, estornada ou ajustada.  |
| `source`               | Sim         | manual, importacao, agenda ou ajuste.                  |
| `reconciliationStatus` | Opcional    | pendente, conciliado ou conflitante.                   |

## Exemplos

### Receita recebida no mesmo mes

Entrada: receita MEI de R$ 2.000,00 recebida em 2026-06-10, competencia 2026-06.

Resultado: somar 200000 ao acumulado de 2026-06.

### Receita recebida depois da competencia

Entrada: atendimento de 2026-05 recebido em 2026-06.

Resultado: relatorio deve mostrar competencia 2026-05 e recebimento 2026-06; decisao fiscal final fica pendente de validacao.

### Estorno parcial

Entrada: receita de 50000 com estorno de 10000.

Resultado: manter receita original auditavel e adicionar ajuste de -10000 vinculado.

### Lancamento pessoal classificado como MEI por engano

Entrada: receita em perfil pessoal sem contexto MEI.

Resultado: ignorar no limite MEI e sugerir revisao se houver sinal de erro.

## Reconciliacao

Receitas podem nascer de lancamento manual, importacao bancaria, agenda profissional ou ajuste. Duplicidades devem ser resolvidas por idempotencia, origem e conciliacao; valores conflitantes ficam pendentes de revisao.

## Backlog tecnico

- Adicionar campo/contrato de competencia em receitas MEI quando o modelo persistente evoluir.
- Criar relatorio de acumulado MEI por ano e mes.
- Criar revisao para receitas ambiguas entre pessoal e MEI.
- Definir ADR para integracao interna ou externa com produto Limite MEI.

## Perguntas abertas

- O criterio oficial sera competencia, recebimento ou ambos?
- Receitas pessoais erroneamente classificadas como MEI devem ser bloqueadas ou enviadas para revisao?
- O controle de limite MEI sera modulo interno do SolverFin ou contrato para outro produto SolverIT?
