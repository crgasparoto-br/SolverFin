# Modelo de dominio financeiro

## Objetivo

Este documento define o modelo conceitual e tecnico inicial do core financeiro do
SolverFin para orientar schema Prisma, APIs, frontend, importacoes, IA e auditoria.

O modelo segue `docs/ARCHITECTURE.md` e a ADR `docs/adr/0001-stack-inicial.md`.
Ele nao implementa persistencia nem APIs; esses itens ficam para issues
especificas.

## Principios

- Toda entidade financeira persistente pertence a uma organizacao e a um perfil
  financeiro.
- Regras de dominio devem ser testaveis sem depender diretamente de UI, banco,
  fila, IA ou APIs externas.
- Receitas, despesas e transferencias sao diferenciadas explicitamente.
- Sugestoes de IA e importacoes permanecem revisaveis antes de virar lancamento
  definitivo quando houver incerteza.
- Dados sensiveis devem ser minimizados, mascarados quando possivel e auditados
  apenas com metadados necessarios.

## Contexto, tenant e rastreabilidade

`Usuario` representa a pessoa autenticada.

`Organizacao` agrupa um ou mais perfis financeiros. No MVP, ela pode representar
uma pessoa, familia, MEI ou pequeno negocio mesmo que exista apenas um usuario.

`PerfilFinanceiro` e o contexto operacional usado para separar vida pessoal,
familia, MEI e negocio. Dados financeiros devem carregar `organizationId` e
`financialProfileId`.

Entidades mutaveis devem registrar `createdAt`, `updatedAt`, `createdByUserId`
e `updatedByUserId` quando houver usuario autenticado. Operacoes criticas devem
gerar auditoria.

## Entidades principais

### Conta

Representa conta corrente, poupanca, dinheiro, investimento ou equivalente.
Campos essenciais: nome, tipo, status, moeda, saldo inicial e identificador
mascarado opcional.

### Cartao

Representa cartao de credito sem armazenar numero completo. Campos essenciais:
nome, status, dia de fechamento, dia de vencimento, limite opcional,
identificador mascarado opcional e conta de pagamento opcional.

### Categoria

Classifica receitas, despesas e transferencias. Pode ter categoria pai para
subcategorias. Categorias arquivadas continuam ligadas a lancamentos historicos.

### Lancamento

Registra receita, despesa ou transferencia.

Status iniciais:

- `planned`: previsto.
- `posted`: realizado.
- `reconciled`: conciliado.
- `suggested`: sugerido por importacao, regra ou IA e pendente de revisao.
- `voided`: cancelado logicamente.

Transferencias usam uma origem (`accountId`) e um destino
(`destinationAccountId`) diferentes. Receitas e despesas exigem conta ou cartao
e nao usam conta de destino.

### Recorrencia e parcela

`Recorrencia` descreve lancamentos futuros repetidos. `Parcela` representa uma
parte prevista ou realizada de recorrencia, compra parcelada ou controle similar.

Reexecucoes de geracao devem evitar duplicidade por tenant, recorrencia,
sequencia e vencimento.

### Fatura

Agrupa compras de um cartao em um periodo de fechamento e vencimento. O pagamento
da fatura deve gerar ou vincular lancamento de saida na conta de pagamento.

### Orcamento

Define valor planejado por categoria e periodo. Alertas usam percentual de
limite quando configurado.

### Importacao

`ImportBatch` registra origem CSV, OFX, mensagem bancaria ou entrada manual,
status, hash e metadados. Arquivos ou mensagens brutas devem seguir politica de
retencao futura e nao devem aparecer em logs.

### Sugestao de IA

`AiSuggestion` registra tipo, status, origem, alvo opcional, confianca,
explicacao, provider/modelo quando aplicavel e revisao humana.

Status iniciais:

- `pending_review`: aguardando revisao.
- `approved`: aprovado.
- `edited`: aprovado com edicao.
- `rejected`: rejeitado.
- `expired`: expirado.

### Anexo

Vincula recibos, comprovantes, extratos, mensagens ou arquivos auxiliares a
lancamentos, faturas, importacoes ou sugestoes. Deve permitir redacao ou exclusao
logica.

### Auditoria

`AuditLogEntry` registra quem fez, o que foi feito, quando, em qual entidade,
tenant/contexto, origem e correlation id quando disponivel.

Auditoria deve preferir diffs minimizados ou marcadores de campos alterados, sem
persistir payload financeiro completo quando metadados forem suficientes.

## Relacionamentos essenciais

- Usuario possui ou opera organizacoes.
- Organizacao contem perfis financeiros.
- Perfil financeiro contem contas, cartoes, categorias, lancamentos,
  recorrencias, parcelas, faturas, orcamentos, importacoes, sugestoes, anexos e
  auditorias.
- Cartao pode apontar para uma conta de pagamento.
- Fatura pertence a um cartao.
- Lancamento pode apontar para conta, cartao, fatura, categoria, recorrencia,
  parcela, importacao e sugestao de IA.
- Anexo aponta para uma entidade de negocio autorizada.
- Auditoria aponta para a entidade alterada, com tenant/contexto obrigatorio.

## Decisoes iniciais

- Transferencia sera modelada como `Transaction` com tipo `transfer`, conta de
  origem, conta de destino e `transferGroupId` opcional para futuras
  representacoes em duas pontas.
- Anexos entram no modelo inicial como entidade propria, mas armazenamento,
  retencao e redacao ficam para issue futura.
- Sugestoes de IA nao alteram dados finais sem revisao ou regra segura aprovada.
- Exclusao definitiva nao e o padrao para dados financeiros; estados de arquivo,
  cancelamento ou exclusao logica devem ser preferidos.

## Pendencias para schema e migrations

- Definir constraints Prisma para evitar transferencia para a mesma conta.
- Definir indices por `organizationId`, `financialProfileId`, datas, status,
  conta, cartao, categoria e origem de importacao.
- Definir estrategia de soft delete por entidade.
- Decidir se `transferGroupId` vira entidade propria em persistencia.
- Definir politica de retencao para mensagens bancarias, anexos e arquivos
  brutos de importacao.
- Definir formato final de diffs de auditoria sem vazar dados sensiveis.

## Validacao esperada

Enquanto esta issue define modelo e contratos, a validacao principal e:

- typecheck do pacote `@solverfin/domain`;
- revisao de alinhamento com arquitetura, produto e ADR;
- ausencia de dados reais em exemplos e documentacao.
