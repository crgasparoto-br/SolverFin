# Regras automaticas configuraveis

Este documento descreve o motor deterministico de regras automaticas do dominio financeiro.

## Objetivo

Regras automaticas classificam ou enriquecem sugestoes, importacoes e lancamentos pendentes antes de acionar IA. Elas sao previsiveis, configuraveis por contexto financeiro e retornam uma explicacao do motivo da aplicacao.

## Condicoes suportadas

Uma regra pode combinar uma ou mais condicoes:

- descricao contem um trecho de texto;
- merchant contem um trecho de texto;
- valor em centavos igual, minimo ou maximo;
- conta financeira;
- cartao;
- tipo da movimentacao, como receita, despesa ou transferencia.

Textos sao comparados de forma case-insensitive e sem acentos para tolerar variacoes simples, por exemplo `mercado`, `Mercado` e `mercadó`.

Regras sem nenhuma condicao nao sao aplicadas. Isso evita automacoes amplas demais por engano.

## Acoes suportadas

Uma regra pode preencher campos do alvo:

- categoria;
- conta financeira;
- cartao;
- tags;
- status compatível com o alvo.

A regra nao confirma uma automacao irreversivel sozinha. O resultado continua retornando o alvo enriquecido e as explicacoes para revisao ou fluxo superior.

## Prioridade e conflitos

Quando mais de uma regra combina com o mesmo alvo, regras com maior `priority` sao aplicadas primeiro. Se duas regras tentam preencher o mesmo campo, vence a primeira regra pela ordem de prioridade.

Em caso de empate, a regra criada primeiro vence. Regras de menor prioridade ainda podem preencher outros campos que nao foram preenchidos por regras anteriores.

## Ativacao e isolamento

Somente regras com status `active` sao consideradas. Regras `inactive` permanecem cadastradas, mas nao alteram o alvo.

Todas as regras e alvos passam pelo mesmo isolamento de tenant usado no restante do dominio. Uma regra de outro contexto financeiro e ignorada, e um alvo de outro contexto e tratado como recurso inexistente.

## Explicabilidade

Cada regra aplicada retorna:

- id da regra;
- nome;
- prioridade;
- campos preenchidos;
- motivo da aplicacao.

Quando a regra possui `explanation`, esse texto e retornado. Caso contrario, o dominio gera uma explicacao padrao com o nome da regra, descricao do alvo e campos preenchidos.

## Cobertura de testes

A suite de dominio cobre:

- match com explicacao;
- nao-match sem alteracao;
- conflito resolvido por prioridade;
- regra desativada;
- isolamento por tenant.
