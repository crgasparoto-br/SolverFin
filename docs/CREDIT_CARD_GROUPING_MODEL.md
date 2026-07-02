# Modelo de cartao agrupador e instrumentos

Este documento registra a modelagem alvo do epico #317 e da subissue #318. Ele descreve o contrato conceitual do dominio; a migracao destrutiva de banco, API, UI e remocao do fluxo legado ficam nas subissues seguintes.

## Conceitos

### Cartao agrupador/fatura

O cartao agrupador representa o contrato do cartao de credito e e o dono da fatura. Ele concentra os dados que pertencem ao relacionamento com a instituicao e ao ciclo de faturamento:

- nome do cartao, por exemplo `Cartao C6`;
- instituicao financeira;
- bandeira;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total;
- status do agrupador.

Um agrupador sem instrumentos ativos deve ficar bloqueado para novas compras. Compras futuras ja existentes continuam consultaveis, mas novos lancamentos dependem de pelo menos um instrumento ativo.

### Instrumento interno

O instrumento interno representa o meio usado em uma compra dentro de um agrupador. Ele nao e uma fatura propria e nao deve ser listado como cartao solto na experiencia principal.

Cada instrumento guarda apenas dados do meio de uso:

- vinculo direto com o cartao agrupador;
- tipo: `physical` ou `virtual`;
- titularidade: `primary` ou `additional`;
- nome/apelido opcional;
- identificador mascarado/final opcional;
- limite individual opcional;
- status: `active` ou `archived`;
- marcacao de default.

O identificador mascarado passa a pertencer ao instrumento. O agrupador nao depende dele para representar a fatura.

## Regras de dominio

- O primeiro instrumento ativo criado para um agrupador vira default automaticamente.
- Apenas um instrumento ativo pode ser default por agrupador.
- Criar um novo instrumento ativo nao troca o default atual, exceto quando a operacao pedir explicitamente isso.
- Definir um instrumento como default remove o default anterior do mesmo agrupador.
- Um instrumento arquivado nao pode ser default.
- Ao arquivar o default, o proximo instrumento ativo disponivel assume o default.
- Se o ultimo instrumento ativo for arquivado, o agrupador fica `blocked`.
- A soma dos limites individuais dos instrumentos ativos nao pode ultrapassar o limite total do agrupador quando esse limite total existir.
- Instrumentos, agrupador e operacoes respeitam organizacao e perfil financeiro do tenant atual.

## Referencias em compras, parcelas e recorrencias

A fatura deve ser resolvida sempre pelo cartao agrupador e pelo periodo. A compra deve preservar o instrumento usado para rastreabilidade.

Por isso, os contratos de dominio passam a aceitar `cardInstrumentId` em:

- `Transaction`, para a compra original;
- `Installment`, para parcelas originadas de compra ou recorrencia de cartao;
- `Recurrence`, para preservar o instrumento escolhido no momento da criacao.

Mudancas futuras no instrumento default apenas pre-preenchem novas compras. Elas nao alteram compras, parcelas ou recorrencias ja criadas.

## Relacao com CardAdditionalLink

`CardAdditionalLink` pertence ao fluxo legado em que cartoes fisicos, virtuais e adicionais eram cadastrados como `Card` separados e agrupados depois.

No modelo novo, adicionais e virtuais sao instrumentos internos vinculados diretamente ao agrupador. Portanto, `CardAdditionalLink` nao deve sustentar o cadastro principal, compras, faturas ou previsoes quando as subissues de banco, API e UI forem implementadas.

## Entregas relacionadas

- #318 define o modelo de dominio e os contratos conceituais.
- #319 deve materializar essa modelagem no schema e em migracao destrutiva.
- #320 a #323 devem ligar as regras ao calculo de faturas, API, UI, compras, parcelas, recorrencias e previsoes.
- #324 deve remover o fluxo legado baseado em `CardAdditionalLink`.
- #325 deve consolidar documentacao e testes de ponta a ponta.
