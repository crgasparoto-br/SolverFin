# Remuneracao de contas indexada ao CDI

## Objetivo

Definir o comportamento funcional e arquitetural da remuneracao prevista de contas no SolverFin, utilizando o CDI como indexador compartilhado com o futuro modulo de investimentos.

## Escopo inicial

A primeira versao deve permitir:

- ativar ou desativar remuneracao em uma conta;
- selecionar o CDI como indexador;
- definir o percentual da conta sobre o CDI, por exemplo `100,00%`;
- importar taxas diarias do CDI a partir de fonte oficial e confiavel;
- calcular o rendimento previsto com base no saldo final do dia anterior;
- criar uma receita prevista no dia atual, mantendo o dia anterior como data de competencia;
- permitir que o usuario substitua o valor previsto pelo valor efetivamente creditado;
- impedir duplicidade de remuneracao para a mesma conta, competencia e indexador.

Tributos, IOF, imposto de renda e regras por lote de aplicacao ficam fora do escopo inicial.

## Modelo conceitual compartilhado

A base de indices financeiros nao pertence exclusivamente ao extrato. Ela deve ser um componente compartilhado do dominio financeiro, reutilizavel pelo futuro modulo de investimentos.

```text
Nucleo financeiro
└── Indices financeiros
    ├── CDI
    ├── Selic
    ├── IPCA
    └── outros indices futuros

Contas e extrato
└── remuneracao prevista de contas

Investimentos
└── rentabilidade, projecoes e comparacoes
```

O extrato e o modulo de investimentos devem consumir a mesma base de indices, mas manter motores de calculo independentes.

## Fonte do CDI

A fonte preferencial deve ser institucional, publica e rastreavel. A implementacao deve priorizar o Banco Central do Brasil, por meio do Sistema Gerenciador de Series Temporais (SGS), evitando scraping de sites privados.

Cada taxa importada deve armazenar, no minimo:

- tipo do indice;
- data de referencia;
- taxa diaria;
- fator diario, quando aplicavel;
- fonte;
- data e hora da importacao;
- status de importacao ou confirmacao.

Deve existir unicidade por `indice + data de referencia`.

## Configuracao da conta

O cadastro da conta deve prever:

- conta remunerada: sim ou nao;
- indexador: inicialmente CDI;
- percentual do indexador;
- data inicial da remuneracao;
- categoria padrao de receita financeira, quando aplicavel.

O rotulo visivel recomendado e `Percentual de remuneracao sobre o CDI`.

## Regra de calculo

Para cada data de referencia com CDI disponivel:

```text
taxa aplicada = taxa CDI do dia × percentual configurado da conta
rendimento previsto = saldo final da data de referencia × taxa aplicada
```

Regras adicionais:

- usar o saldo final do dia anterior;
- gerar o lancamento no dia atual;
- usar o dia anterior como data de competencia;
- calcular somente quando o saldo final for maior que zero;
- nao gerar lancamento de valor zero;
- nao gerar remuneracao em datas sem CDI;
- nao recalcular automaticamente valores ja gerados em razao de lancamentos retroativos.

## Lancamento no extrato

O lancamento deve ser criado como receita prevista, com:

- data do lancamento: dia do processamento;
- data de competencia: dia anterior;
- descricao sugerida: `Rendimento previsto — 100% do CDI`;
- origem: remuneracao automatica de conta;
- saldo-base utilizado;
- CDI da competencia;
- percentual configurado;
- valor calculado originalmente;
- valor atual do lancamento;
- indicador de ajuste manual.

O usuario pode alterar o valor previsto para refletir o valor real creditado pelo banco.

Depois de alterado manualmente:

- o valor nao deve ser sobrescrito por novo processamento;
- o sistema deve preservar o valor originalmente calculado para auditoria;
- o lancamento deve ser identificado como ajustado manualmente.

## Idempotencia e duplicidade

Deve existir apenas um calculo por:

```text
conta + data de competencia + indexador
```

A protecao deve funcionar mesmo quando:

- o botao de atualizacao for acionado mais de uma vez;
- a rotina automatica executar novamente;
- houver duas execucoes concorrentes;
- a tela de extrato for aberta repetidamente.

## Processamento

O calculo nao deve depender exclusivamente da abertura da tela de extrato.

Fluxo recomendado:

1. importar os indices pendentes;
2. localizar contas remuneradas ativas;
3. localizar competencias ainda nao processadas;
4. obter o saldo final da competencia;
5. calcular o rendimento previsto;
6. criar o lancamento de receita;
7. registrar o vinculo entre calculo e lancamento.

Na administracao, devem existir acoes separadas para:

- atualizar taxas CDI;
- processar rendimentos pendentes;
- visualizar ultima taxa disponivel;
- visualizar ultimo processamento;
- visualizar falhas e pendencias.

## Finais de semana, feriados e atrasos

- o sistema processa somente datas para as quais exista CDI;
- sabados, domingos e feriados sem CDI nao geram lancamento proprio;
- se o processamento ficar atrasado, cada competencia pendente deve ser processada individualmente;
- a data real de criacao deve ser preservada, sem alterar a competencia.

## Fora do escopo inicial

- imposto de renda;
- IOF;
- rentabilidade liquida;
- lotes de aplicacao;
- aportes e resgates de investimentos;
- vencimentos;
- marcacao a mercado;
- comparacao entre produtos;
- recalculo automatico por alteracoes retroativas no extrato.

## Evolucao para o modulo de investimentos

O futuro modulo de investimentos deve reutilizar a base de indices financeiros definida aqui, mas acrescentar regras proprias de produtos, aportes, resgates, tributacao, vencimento e rentabilidade acumulada.

A remuneracao de conta continua sendo uma previsao conciliavel do extrato, nao uma posicao de investimento completa.
