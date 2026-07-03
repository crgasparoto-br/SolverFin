# Cartoes agrupadores e instrumentos

Este documento consolida o modelo atual de cartoes de credito do SolverFin para orientar produto, implementacao, testes e revisao de PRs.

## Conceitos

### Cartao agrupador/fatura

O cartao agrupador representa o contrato do cartao e e o dono da fatura. Exemplo: `Cartao C6`.

Dados que pertencem ao agrupador:

- nome do cartao;
- instituicao financeira;
- bandeira;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total.

A fatura deve ser resolvida sempre pelo agrupador e pelo periodo. Ela nunca deve ser calculada por instrumento isolado.

### Instrumento interno

O instrumento interno representa o meio usado em uma compra dentro do agrupador. Exemplos:

- fisico do titular principal;
- virtual do titular principal;
- fisico adicional;
- virtual adicional.

Dados que pertencem ao instrumento:

- tipo: `physical` ou `virtual`;
- titularidade: `primary` ou `additional`;
- nome/apelido opcional;
- identificador mascarado ou final do meio de uso;
- limite individual opcional;
- status;
- marcador de default.

O identificador mascarado nao pertence ao agrupador. Ele deve ficar no instrumento usado na compra.

## Regras de disponibilidade

Um agrupador precisa de pelo menos um instrumento ativo para ficar disponivel em novos lancamentos.

Quando um agrupador fica sem instrumentos ativos:

- ele deve ser tratado como bloqueado/inativo para novas compras;
- compras futuras ja existentes continuam visiveis para acompanhamento;
- instrumentos arquivados podem continuar visiveis enquanto forem relevantes para consulta;
- a tela deve explicar que nao ha instrumento ativo para novos lancamentos.

Criar um novo instrumento ativo em um agrupador bloqueado deve ser o caminho principal para voltar a usar esse agrupador.

## Instrumento default

Cada agrupador pode ter no maximo um instrumento default ativo.

Regras esperadas:

- o primeiro instrumento ativo de um agrupador vira default automaticamente;
- definir um novo default remove o default anterior do mesmo agrupador;
- instrumentos arquivados, inexistentes ou de outro agrupador nao podem virar default;
- ao arquivar o default, o proximo instrumento ativo deve ser promovido;
- se nao houver outro instrumento ativo, o agrupador fica bloqueado/inativo para novos lancamentos.

O default e apenas uma sugestao para novos lancamentos. Ele nao altera compras, parcelas ou recorrencias ja criadas.

## Compras, faturas e rastreabilidade

Compras feitas em instrumentos diferentes do mesmo agrupador devem compor uma unica fatura do agrupador.

A compra deve manter referencia ao instrumento usado para que telas, faturas e relatorios consigam mostrar a origem. Exemplos:

- `Cartao C6 / Fisico titular`;
- `Cartao C6 / Virtual adicional`.

Parcelas devem preservar a origem da compra. A fatura consolida os valores por agrupador e periodo, mas cada item deve continuar rastreavel pelo instrumento.

## Recorrencias

Recorrencias de cartao devem preservar o instrumento escolhido no momento da criacao.

Mudancas futuras no instrumento default nao alteram recorrencias existentes. O default vigente deve apenas pre-preencher novas compras ou novas recorrencias.

## Limites

A bandeira e o limite total pertencem ao agrupador.

Instrumentos podem ter limite individual opcional. Quando houver limites individuais ativos, a soma desses limites nao deve ultrapassar o limite total do agrupador.

## Fluxo legado

O fluxo antigo de criar cartoes separados e vincular adicionais manualmente nao e o comportamento principal.

O modelo novo nao deve depender de `CardAdditionalLink` para cadastro, compras, faturas, recorrencias, parcelas, previsoes ou exibicao principal. Se alguma rota ou tabela legada permanecer temporariamente por compatibilidade, ela deve ser documentada como legado e nao deve sustentar novos fluxos.

## Rotas principais

As rotas de UI/API devem tratar o agrupador como recurso pai e instrumentos como recursos internos.

Rotas principais ja esperadas pela tela `Contas e Cartoes`:

```text
GET  /api/credit-card-accounts?status=all
POST /api/credit-card-accounts
PATCH /api/credit-card-accounts/:cardId
POST /api/credit-card-accounts/:cardId/instruments
PATCH /api/credit-card-accounts/:cardId/default-instrument
POST /api/credit-card-accounts/:cardId/archive
PATCH /api/credit-card-instruments/:instrumentId
POST /api/credit-card-instruments/:instrumentId/archive
```

Exemplo minimo de criacao de agrupador com instrumento inicial:

```json
{
  "name": "Cartao C6",
  "institutionKey": "c6",
  "brandKey": "mastercard",
  "closingDay": 20,
  "dueDay": 10,
  "paymentAccountId": "account-main",
  "creditLimitMinor": 500000,
  "instruments": [
    {
      "type": "physical",
      "holder": "primary",
      "name": "Fisico titular",
      "maskedIdentifier": "**** 1111",
      "creditLimitMinor": 300000
    }
  ]
}
```

Exemplo minimo de criacao de instrumento em agrupador existente:

```json
{
  "type": "virtual",
  "holder": "additional",
  "name": "Virtual adicional",
  "maskedIdentifier": "**** 2222",
  "creditLimitMinor": 100000
}
```

## Cobertura esperada

A cobertura automatizada deve proteger pelo menos:

- criacao de agrupador com instrumento inicial;
- criacao de instrumentos fisicos e virtuais;
- titular principal e adicional como titularidade do instrumento, nao como cartao separado;
- default unico por agrupador;
- primeiro instrumento ativo virando default;
- arquivamento do default promovendo outro instrumento ativo;
- agrupador bloqueado/inativo sem instrumento ativo;
- soma de limites individuais respeitando o limite total;
- compra em instrumentos diferentes gerando uma fatura unica por agrupador;
- fatura exibindo origem por instrumento;
- parcelas e recorrencias preservando o instrumento da compra;
- recorrencias preservando o instrumento definido na criacao;
- tela `Contas e Cartoes` com lista hierarquica, criacao, edicao, default, arquivamento, estado bloqueado/inativo e ausencia do fluxo legado.
