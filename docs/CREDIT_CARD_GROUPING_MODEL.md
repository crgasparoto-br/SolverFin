# Modelo de cartao agrupador e instrumentos

Este documento consolida o comportamento principal do epico #317 e da subissue #325 para cartoes de credito. Ele e a referencia de dominio, API, UI e testes para o modelo em que um cartao representa a fatura e seus meios de uso aparecem como instrumentos internos.

## Conceitos principais

### Cartao agrupador/fatura

O cartao agrupador representa o contrato do cartao de credito e e o dono da fatura. Ele e o item listado como cartao na experiencia principal e concentra os dados que pertencem ao relacionamento com a instituicao e ao ciclo de faturamento:

- nome do cartao, por exemplo `Cartao C6`;
- instituicao financeira;
- bandeira;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total;
- status do agrupador.

Um agrupador sem instrumentos ativos fica `blocked` e nao fica disponivel para novas compras. Compras, parcelas ou recorrencias futuras ja existentes continuam consultaveis para acompanhamento, mas novos lancamentos dependem de pelo menos um instrumento ativo.

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

### Titularidade e default

Titularidade e default sao conceitos independentes. Um instrumento `primary` nao e default por ser do titular principal, e um instrumento `additional` pode se tornar default se o usuario escolher esse meio de uso para pre-preencher novos lancamentos.

O default apenas sugere o instrumento em novas compras e novas recorrencias. Ele nao altera compras, parcelas ou recorrencias ja criadas.

## Regras de dominio

- O primeiro instrumento ativo criado para um agrupador vira default automaticamente.
- Apenas um instrumento ativo pode ser default por agrupador.
- Criar um novo instrumento ativo nao troca o default atual, exceto quando a operacao pedir explicitamente isso.
- Definir um instrumento como default remove o default anterior do mesmo agrupador.
- Um instrumento arquivado nao pode ser default nem ser usado em novas compras.
- Ao arquivar o default, o proximo instrumento ativo disponivel assume o default.
- Se o ultimo instrumento ativo for arquivado, o agrupador fica `blocked`.
- Bandeira e limite total pertencem ao agrupador.
- A soma dos limites individuais dos instrumentos ativos nao pode ultrapassar o limite total do agrupador quando esse limite total existir.
- Instrumentos, agrupador e operacoes respeitam organizacao e perfil financeiro do tenant atual.

## Compras, faturas, parcelas, recorrencias e previsoes

A fatura e resolvida sempre pelo cartao agrupador e pelo periodo. Compras feitas em instrumentos diferentes do mesmo agrupador entram na mesma fatura quando pertencem ao mesmo ciclo.

A compra preserva o instrumento usado para rastreabilidade e exibicao. Por isso, os contratos de dominio usam `cardInstrumentId` em:

- `Transaction`, para a compra original;
- `Installment`, para parcelas originadas de compra ou recorrencia de cartao;
- `Recurrence`, para preservar o instrumento escolhido no momento da criacao.

Recorrencias preservam o instrumento definido na criacao. Mudancas futuras no instrumento default apenas pre-preenchem novas recorrencias ou compras; elas nao reescrevem recorrencias, parcelas ou compras existentes.

Previsoes de pagamento de fatura pertencem a fatura do agrupador e usam a conta padrao de pagamento do agrupador quando ela estiver configurada.

## API e UI principal

O fluxo principal de cadastro usa o conceito de conta/cartao de credito agrupador:

- `GET /api/credit-card-accounts` lista agrupadores com seus instrumentos internos.
- `POST /api/credit-card-accounts` cria o agrupador com pelo menos um instrumento ativo.
- `GET /api/credit-card-accounts/:cardId/instruments` lista instrumentos do agrupador.
- `POST /api/credit-card-accounts/:cardId/instruments` cria um novo instrumento interno.
- `PATCH /api/credit-card-accounts/:cardId/default-instrument` define o instrumento default.
- `PATCH /api/credit-card-instruments/:instrumentId` atualiza dados do instrumento.
- `POST /api/credit-card-instruments/:instrumentId/archive` arquiva o instrumento.
- `POST /api/credit-card-accounts/:cardId/purchases` registra compra usando o agrupador e, quando informado, o instrumento escolhido.

A tela `Contas e Cartoes` deve listar cartoes agrupadores e exibir seus instrumentos de forma aninhada. Ela nao deve oferecer a experiencia principal de criar cartoes soltos para depois vincular adicionais manualmente.

As rotas historicas de cartoes e faturas podem existir temporariamente para compatibilidade tecnica, mas nao devem sustentar o novo cadastro principal nem reintroduzir fatura por instrumento/cartao solto.

## Relacao com CardAdditionalLink

`CardAdditionalLink` pertence ao fluxo legado em que cartoes fisicos, virtuais e adicionais eram cadastrados como `Card` separados e agrupados depois por um vinculo manual.

No modelo novo, adicionais, fisicos e virtuais sao instrumentos internos vinculados diretamente ao agrupador. Portanto, `CardAdditionalLink` foi retirado do fluxo principal e nao deve sustentar cadastro, compras, faturas, previsoes ou documentacao recomendada.

A rota legada `/api/card-additional-links` tambem nao participa do fluxo principal. Testes e documentacao devem tratar qualquer referencia remanescente apenas como historico de migracao ou compatibilidade retirada.

## Migracao e dados historicos

A migracao para este modelo e destrutiva no contexto do epico #317. Nao ha compromisso de preservacao cuidadosa de historico antigo de cartoes, vinculos, faturas, compras, parcelas, recorrencias ou previsoes relacionadas ao modelo anterior.

Seeds, fixtures e testes devem usar agrupadores e instrumentos como comportamento principal.

## Cobertura esperada

A cobertura deve impedir regressao para o modelo antigo e verificar, no minimo:

- criacao de agrupador com instrumento ativo;
- criacao de instrumentos fisicos e virtuais;
- titularidade `primary` e `additional` sem confundir com default;
- primeiro instrumento ativo virando default automaticamente;
- default unico por agrupador;
- arquivamento do default promovendo o proximo ativo;
- agrupador `blocked` quando nao houver instrumento ativo;
- soma de limites individuais ativos respeitando o limite total do agrupador;
- compras em instrumentos diferentes compondo uma unica fatura do agrupador;
- resumo de fatura e compras preservando origem por instrumento;
- parcelas, recorrencias e previsoes mantendo vinculos corretos;
- recorrencias preservando o instrumento escolhido na criacao;
- ausencia do fluxo principal baseado em `CardAdditionalLink`.

## Entregas relacionadas

- #318 define o modelo de dominio e os contratos conceituais.
- #319 materializa essa modelagem no schema e em migracao destrutiva.
- #320 a #323 ligam as regras ao calculo de faturas, API, UI, compras, parcelas, recorrencias e previsoes.
- #324 remove o fluxo legado baseado em `CardAdditionalLink`.
- #325 consolida documentacao e testes de ponta a ponta.
