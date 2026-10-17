# Cartoes agrupadores e instrumentos

Este documento consolida o modelo atual de cartoes de credito do SolverFin para orientar produto, implementacao, testes e revisao de PRs.

## Conceitos

### Cartao agrupador/fatura

O cartao agrupador representa o contrato do cartao e e o dono da fatura. Exemplo: `Cartao C6`.

Dados que pertencem ao agrupador:

- nome do cartao;
- instituicao financeira;
- bandeira;
- moeda padrao ISO 4217;
- dia de fechamento;
- dia de vencimento;
- conta padrao de pagamento;
- limite total.

A moeda padrao do cartao e o contexto monetario sugerido para novos lancamentos e para os limites do agrupador e de seus instrumentos. Ela pertence ao cartao e nao deve ser inferida em tempo de uso a partir da conta de pagamento.

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

Um agrupador precisa de pelo menos um instrumento ativo e de uma moeda padrao valida para ficar disponivel em novos lancamentos.

Quando um agrupador fica sem instrumentos ativos:

- ele deve ser tratado como bloqueado/inativo para novas compras;
- compras futuras ja existentes continuam visiveis para acompanhamento;
- instrumentos arquivados podem continuar visiveis enquanto forem relevantes para consulta;
- a tela deve explicar que nao ha instrumento ativo para novos lancamentos.

Quando um agrupador legado nao possui moeda padrao:

- novas compras ficam bloqueadas ate que a moeda seja configurada em `Contas e Cartoes`;
- a interface nao deve substituir a ausencia por `BRL` ou por qualquer outra moeda implicita;
- compras, faturas e recorrencias historicas continuam consultaveis com a moeda que ja possuem.

Criar um novo instrumento ativo em um agrupador bloqueado deve ser o caminho principal para voltar a usar esse agrupador quando o problema for ausencia de instrumento. Configurar a moeda padrao do cartao e o caminho principal quando o bloqueio for monetario.

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

### Integridade de moeda

Cada fatura e monomoeda. Uma compra so pode compor uma fatura existente quando a moeda ISO normalizada da compra for exatamente igual a moeda da fatura. Nao existe conversao cambial implicita nesse fluxo: divergencia de moeda deve ser rejeitada antes de persistir `Transaction`, `Installment`, `Invoice`, previsao ou auditoria relacionada a operacao.

Novos cartoes criados pelo contrato HTTP de `credit-card-accounts` devem informar uma moeda ISO 4217 de tres letras. A tela `Cartoes` usa essa moeda do agrupador como valor padrao da nova compra. O campo e informativo no modal e nao deve ser usado como mecanismo para transformar um cartao em multi-moeda por compra.

Para cartoes existentes, a migracao pode preencher a moeda apenas quando houver uma fonte inequivoca: uma unica moeda normalizada nas faturas, uma unica moeda nas transacoes do cartao ou, sem historico monetario do cartao, a moeda da conta de pagamento vinculada. Casos ambiguos permanecem sem moeda ate revisao do usuario; nao existe fallback generico para `BRL`.

A mesma regra vale para parcelas futuras, recorrencias materializadas e movimentacao de compra entre periodos. Uma movimentacao deve validar a moeda da fatura de origem e, quando ja existir, da fatura de destino antes de alterar a compra ou qualquer total.

Estados historicos em que uma compra esteja vinculada a uma fatura de moeda diferente nao podem ser agregados silenciosamente. Resumo, edicao, fechamento e movimentacao da fatura devem falhar de forma explicita ate a inconsistencia ser saneada.

A conta usada para liquidar uma fatura deve ter a mesma moeda da fatura. Previsoes automaticas de pagamento so podem ser geradas para a conta configurada quando a moeda da conta corresponder a moeda da fatura. Provider de cambio permanece fora de escopo; portanto nenhuma dessas operacoes faz conversao automatica.

## Recorrencias

Recorrencias de cartao devem preservar o instrumento escolhido no momento da criacao.

Mudancas futuras no instrumento default nao alteram recorrencias existentes. O default vigente deve apenas pre-preencher novas compras ou novas recorrencias.

## Limites

A bandeira, a moeda padrao e o limite total pertencem ao agrupador.

Instrumentos podem ter limite individual opcional. Quando houver limites individuais ativos, a soma desses limites nao deve ultrapassar o limite total do agrupador. A exibicao desses limites usa a moeda padrao do cartao, sem inferencia pela conta de pagamento.

## Edicao de compra de cartao

A edicao de uma compra na tela `Cartoes` usa diretamente `PATCH /api/credit-card-accounts/:cardId/purchases/:transactionId`. A tela nao depende de nenhuma rota generica de transacao nem de um override de outro modulo para corrigir rota, metodo ou payload.

No modo de edicao:

- o seletor de instrumento permanece visivel e editavel;
- a data persistida da compra e preservada ao abrir o formulario;
- para compra simples, o modo de repeticao fica oculto e valor/data continuam editaveis;
- para compra parcelada, o modal identifica `Parcelado`, mostra `Parcela X de Y`, valor da ocorrencia, total da compra, total de parcelas e parcela inicial; valor, data e estrutura ficam somente leitura;
- descricao, categoria e instrumento continuam editaveis. A troca de instrumento atualiza atomicamente a compra e todas as parcelas ligadas ao mesmo cronograma.

Na criacao de uma compra, o campo `Data` e inicializado no navegador com a data local atual. Esse preenchimento e apenas uma sugestao editavel e nao deve usar `toISOString()` como fonte de calendario local, para evitar deslocamento de dia por fuso horario.

Compras de faturas `closed`, `paid` ou `cancelled` tem a acao de edicao desabilitada na tela e sao rejeitadas pela API com o codigo `CARD_PURCHASE_INVOICE_LOCKED` (HTTP 409) caso a chamada ocorra mesmo assim. O bloqueio ocorre antes de qualquer alteracao em `Transaction`, `Installment`, `Invoice` ou auditoria.

A `Installment` tecnica vinculada a uma compra recorrente materializada nao aparece em painel, historico ou linha separada na tela `Cartoes`. Quando o vinculo for canonico, o metadado `Parcela X de Y` e exibido na propria linha da compra, e a manutencao continua exclusivamente pelo endpoint operacional da compra.

## Movimentacao de compra entre faturas/periodos

A movimentacao de uma compra para outro periodo de fatura usa o contrato dedicado:

```text
POST /api/credit-card-accounts/:cardId/purchases/:transactionId/move-invoice-period
```

Payload:

```json
{
  "invoicePeriod": "2026-08"
}
```

`invoicePeriod` representa o mes de fechamento da fatura (`AAAA-MM`). A API calcula o periodo real pelo mesmo dominio usado no registro normal de compras, considerando `closingDay` e `dueDay` do cartao agrupador. O cliente nao envia `invoiceId` de destino.

Comportamento:

- valida tenant, perfil financeiro, cartao, compra e fatura de origem;
- rejeita periodo invalido com `CARD_PURCHASE_INVOICE_PERIOD_INVALID`;
- rejeita movimentacao para o mesmo periodo com `CARD_PURCHASE_INVOICE_PERIOD_UNCHANGED`;
- rejeita origem travada com `CARD_PURCHASE_INVOICE_LOCKED`;
- rejeita destino travado com `CARD_PURCHASE_DESTINATION_INVOICE_LOCKED`;
- rejeita origem ou destino com moeda diferente da compra com `CARD_INVOICE_CURRENCY_MISMATCH`;
- resolve ou cria fatura destino aberta para o periodo calculado;
- move somente a compra/ocorrencia selecionada;
- preserva `cardId`, `cardInstrumentId`, categoria, descricao, valor, moeda, status, recorrencia e demais vinculos da compra;
- ajusta os totais da fatura de origem e da fatura destino na mesma transacao;
- registra auditoria redigida da operacao.

Para compras recorrentes materializadas, a movimentacao afeta apenas a ocorrencia ja gerada. A regra da recorrencia nao e alterada.

Para compras parceladas, a movimentacao desta entrega e limitada a compra/ocorrencia selecionada. Movimentar um conjunto completo de parcelas continua fora de escopo ate existir contrato especifico de lote.

## Fluxo legado

O fluxo antigo de criar cartoes separados e vincular adicionais manualmente nao e o comportamento principal.

O modelo novo nao deve depender de `CardAdditionalLink` para cadastro, compras, faturas, recorrencias, parcelas, previsoes ou exibicao principal. Se alguma rota ou tabela legada permanecer temporariamente por compatibilidade, ela deve ser documentada como legado e nao deve sustentar novos fluxos.

Cartoes legados podem temporariamente possuir `currency = null` enquanto a migracao nao consegue determinar uma unica moeda segura. Essa nulabilidade existe somente para compatibilidade e saneamento; o cadastro HTTP de um novo agrupador continua exigindo moeda.

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
POST /api/credit-card-accounts/:cardId/purchases/:transactionId/move-invoice-period
PATCH /api/credit-card-instruments/:instrumentId
POST /api/credit-card-instruments/:instrumentId/archive
```

Exemplo minimo de criacao de agrupador com instrumento inicial:

```json
{
  "name": "Cartao C6",
  "institutionKey": "c6",
  "brandKey": "mastercard",
  "currency": "BRL",
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

## Gestao na tela `Contas e Cartoes`

A rota `/contas-cartoes` deve manter uma unica colecao master-detail A3, sem abas para separar contas e cartoes. Busca e filtros de tipo (`Todos`, `Contas`, `Cartoes`), moeda e status sao cumulativos e devem permanecer disponiveis no mesmo contexto da colecao mestre.

No contexto de cartoes da colecao mestre:

- o cadastro e a edicao do cartao exibem `Moeda` como dado do agrupador;
- a linha do cartao mostra somente identificacao, instituicao, bandeira, moeda, datas, conta de pagamento, quantidade de instrumentos ativos, limite, status e acoes;
- a lista de instrumentos nao aparece expandida na linha nem dentro do modal de edicao do cartao;
- a acao de icone `Ver instrumentos` abre um modal dedicado que identifica o cartao;
- o modal lista nome, tipo, titularidade, identificador mascarado, limite individual, status e marcador de default de cada instrumento;
- adicionar, editar, definir como padrao e arquivar instrumentos reutilizam os contratos de API existentes;
- ausencia de instrumentos ou de instrumento ativo deve ser explicada no proprio modal, com a acao de adicionar como caminho principal;
- ausencia de moeda padrao deve ser exibida como estado a corrigir, sem preencher `BRL` automaticamente;
- dados sensiveis permanecem mascarados, e o modal deve suportar lista extensa com rolagem interna;
- o modal fecha por controle identificado e por `Escape`, restaurando o foco para `Ver instrumentos`.

Acoes recorrentes de conta, cartao e instrumento usam icones da biblioteca do projeto com nome acessivel e tooltip em hover e foco. Arquivamento e exclusao exigem modal de confirmacao; cancelar ou fechar nao envia requisicao.

A validacao visual permanente da rota usa `scripts/statement-visual/accounts-cards-interface.mjs` e cobre `1440x900`, `1366x768` e `390x844`, incluindo ausencia de abas, combinacao de busca/tipo/moeda/status, persistencia de filtros, alvos de acao, CDI por icone, modal de instrumentos, formulario agrupado, arvore de acessibilidade, `Escape`, restauracao de foco e cancelamento de confirmacao sem chamada de API.

## Hierarquia da tela `Cartoes`

A rota `/cartoes` deve priorizar a decisao operacional sobre a fatura selecionada, sem alterar os contratos financeiros descritos neste documento.

### Refatoração de interface — `design-interface` (Issue #715 / PR #720)

A Skill `crgasparoto-br/skill/design-interface` foi aplicada em modo `implementation`, seguindo o contrato `2026-08-20.3` sobre o arquétipo **A3** e a referência aprovada do Extrato. A tarefa principal permanece `cartão → fatura → compras`, sem reproduzir literalmente a geometria do Extrato.

- **Contexto do cartão:** painel esquerdo desktop preserva seleção, instituição/identificação mascarada, estado, moedas, dados contratuais e instrumentos. A identidade do cartão perde o card aninhado; no mobile, a seleção continua visível e o nome repetido fica apenas no seletor, preservando status e acesso aos detalhes expansíveis.
- **Instrumentos em duas linhas (PR #720):** no painel lateral de `/cartoes`, cada instrumento exibe a identificação (tipo/nome e número mascarado) na primeira linha e **`Limite <MOEDA> <VALOR>`** na segunda (por exemplo, `Limite BRL 84.000,00`), sempre com `L` maiúsculo. `Padrão` e `Arquivado` continuam em coluna separada, alinhados ao item. Sem limite informado, não mostrar linha vazia; sem moeda, usar `Limite com moeda indisponível`. A lista continua acessível no mobile e a seleção de instrumentos nos formulários mantém rótulo compacto em linha única.
- **Faixa financeira:** `Total da fatura`, `Conciliado`, `Não conciliado` e `Limite disponível` continuam valores independentes na moeda da fatura, mas formam uma faixa comparável sem quatro cartões decorados ou ícones supérfluos. O detalhamento do limite permanece contextual. Em 390 px, os quatro fatos compõem uma grade compacta 2×2; em 320 px, viram linhas rótulo/valor para evitar corte ou quebra da moeda.
- **Consulta e compras:** busca, filtros e contadores permanecem funcionais no mesmo GET; chips ativos usam contraste sem bordas de destaque repetidas. Instrumentos usam subtotais agrupados por moeda e divisores discretos, e compras mantêm as seis colunas semânticas (categoria independente, situação em pictograma, descrição e valor priorizados). `Registrar compra` continua junto à coleção, enquanto fechar/documentar/liquidar pertencem à fatura.
- **Verificação visual:** usar cenário autenticado `/cartoes` com fixture fictícia em 1366×768, 1920×1080, 390×844 e 320×740, além de estados de filtro vazio, conteúdo longo, modal e teclado. O Chrome exige faixa com quatro métricas sem caixas completas, controle negativo que reaplica uma moldura e falha, contexto mobile compacto e ausência de overflow. O parecer visual independente permanece obrigatório, mesmo com CI verde.

### Propagação visual da Golden Screen — Issue #715

A Golden Screen do Extrato (`/lancamentos`) define o **nível de acabamento**, não a geometria literal de Cartões. A composição A3 da rota `/cartoes` deve usar a largura útil da aplicação para a hierarquia cartão selecionado → valor e decisão da fatura → compras; uma coluna fixa de metadados do cartão não deve atrasar a leitura da coleção financeira.

- O cabeçalho evita repetir título/descrição já presentes no shell e mantém **Registrar compra** no contexto das compras quando existe fatura. Liquidar fatura é a única ação visual primária no escopo da fatura; fechamento é secundário.
- **Redesenho orientado a decisão (#715, PR #720):** com fatura selecionada, o cabeçalho da rota `/cartoes` usa composição **valor → situação/datas → ações secundárias**. No desktop, **Valor a pagar** lidera à esquerda com **Liquidar fatura** alinhado ao mesmo grupo; situação, vencimento, fechamento e moeda ficam em um bloco factual à direita, separados por divisor discreto. A faixa inferior agrupa **Documentos** (nome acessível **Documentos da fatura**), **Fechar fatura** (somente aberta) e explicação progressiva **Sobre a liquidação**, sem duplicar botões de maior peso. Em telas estreitas, os dois comandos ocupam uma linha de duas colunas, e a explicação fica abaixo. No mobile, valor e liquidação aparecem primeiro; depois situação/datas e faixa secundária, com alvos de pelo menos 44 px. **Registrar compra** permanece exclusivamente no contexto de Itens da fatura; sem fatura, o cabeçalho da página oferece o primeiro registro. Não mudar operações, permissões ou endpoints.

- **Primeira dobra / hierarquia responsiva (#715):** em 1366×768, o início de uma compra não basta: a primeira linha, sua descrição e seu valor devem estar integralmente visíveis com margem inferior de 12 px, sem ocultar o painel esquerdo. O resumo contém o acesso aos detalhes do limite no próprio indicador de limite, enquanto documentos e fechamento pertencem à mesma faixa secundária, sem competir com a liquidação. Em 390×844 e 320×740, a navegação do mês identifica a fatura e a seção começa pelo **Valor a pagar** e sua ação, antes das datas e dos comandos secundários, sem esconder status, vencimento, fechamento ou a gestão dos instrumentos. Os controles Chrome rejeitam deslocamento artificial da compra ou do valor principal e restauram a geometria após o teste.
- **Navegação e acessibilidade do cabeçalho (PR #720):** anterior/mês/próxima formam um seletor compacto à esquerda; **Escolher outro mês** fica à direita, com foco de teclado perceptível e escolha explícita de meses históricos. O mês é exibido visualmente uma só vez; o `<h2>` da fatura fica disponível para leitores de tela. **Vencimento**, **Fechamento** e **Moeda** permanecem fatos separados com `<dt>/<dd>`; ambas as datas usam `<time datetime>` sem alterar fuso. O contraste e a dimensão dos valores têm precedência sobre badges e bordas. O modal de documentos e os comandos financeiros existentes mantêm sua semântica.
- A lista de compras utiliza **Categoria como coluna própria**, entre Compra e Situação, no desktop; a descrição não duplica a categoria em linha secundária. **Paridade com o Extrato:** a célula Categoria mostra o mesmo SVG de direção de saída (seta para baixo, `data-category-direction="out"`), seguido do nome, com iconografia de 13 px e espaçamento coerentes com a Golden Screen. O ícone e o nome ficam num badge semântico: entrada com fundo verde (`--success-bg`), saída com fundo vermelho (`--danger-bg`) e transferência com fundo cinza (`--surface-soft`), utilizando também as respectivas cores de texto dos tokens. Em compras com cartão, a direção atual é sempre saída; as outras duas variantes estão disponíveis no CSS sem introduzir transferências ou receitas artificiais no modelo. O rótulo contextual mobile permanece fora do fundo colorido, e textos longos quebram sem scroll horizontal. Compras em cartão são despesas; por isso não exibem o ícone de entrada. A indicação visual é decorativa (`aria-hidden`) e o nome permanece legível/acessível, inclusive para `Sem categoria`. No mobile, a categoria continua como célula independente com rótulo contextual, sem scroll horizontal e sem cortar nomes longos. A ordem é Data, Compra, Categoria, Situação, Valor e Ações.
- A coluna **Situação** das compras conserva pictogramas SVG da iconografia compartilhada, equivalentes aos do Extrato: conciliada (check), efetivada não conciliada (círculo) e planejada (relógio). O ícone fica dentro de um acionador `summary` com alvo de pelo menos 44×44 px e foco de teclado. **Ao clicar ou pressionar Enter/Espaço**, abre um menu com a situação atual e as alterações permitidas: **Marcar como conciliada** para não conciliadas, **Desconciliar** para conciliadas e, em planejadas, **Marcar como não conciliada** ou **Marcar como conciliada**. A ação usa exclusivamente `PATCH /api/credit-card-accounts/:cardId/purchases/:transactionId` com `{status}`, atualiza a fatura após sucesso, preserva filtros e exibe erros de API/rede no próprio menu para nova tentativa. Escape e clique fora fecham o menu, e o ícone mantém `role="img"`, `aria-label`, `title` e `data-tooltip` sem texto visual duplicado. Em **faturas fechadas, pagas ou canceladas** e nas **ocorrências parceladas**, o ícone abre apenas uma explicação de bloqueio: a API proíbe a mudança direta de status de uma compra parcelada para não alterar outras parcelas. Essa restrição não pode ser contornada por PATCH genérico. O menu de ações continua usando SVG compartilhado, não caracteres `•••`. **Padrão de interação visual:** o menu contextual e suas opções são controles neutros sobre superfície clara, inclusive no hover e no foco. A cor de fundo da opção em hover/foco é `--neutral-control-hover` e o texto é `--neutral-control-text-hover`; o `button:hover:not(:disabled)` global, reservado às ações primárias, **não** pode prevalecer neste menu. O teste SSR valida a precedência dos tokens neutros sobre `button:hover`. O teste Chrome deve mover o cursor de verdade sobre a opção e medir o **fundo final composto com os elementos pais** (um botão transparente sobre menu branco não equivale a fundo preto), rejeitando opções escuras e exigindo contraste visual de pelo menos 4,5:1 em desktop e mobile.
- O seletor e a identidade mascarada do cartão ficam num contexto compacto. Dados contratuais e instrumentos permanecem acessíveis sob expansão, **inclusive no mobile**, sem apagar moeda, identidade, seleção nem navegação.
- A navegação corrente/futura e a escolha explícita de mês histórico seguem as regras cronológicas documentadas abaixo. O resumo prioriza valor a pagar, vencimento, fechamento e estado; limites e conciliação aparecem como indicadores contidos, enquanto explicações operacionais e detalhes complementares usam divulgação progressiva.
- No Chrome autenticado 1366×768, a **primeira linha de compra inteira**, incluindo descrição e valor, deve terminar antes do limite de 12 px acima da primeira dobra; em 390×844 e 320×740, o **valor a pagar** deve iniciar antes de 62% da altura da viewport e a menos de 88 px do começo do cabeçalho da fatura. O controle negativo deve deslocar temporariamente esses elementos para fora do limite, observar rejeição e restaurar sem efeitos persistentes.
- Em fluxo normal, busca sem resultados, descrição longa e diálogos, a apresentação deve preservar leitura integral, valor/moeda, foco, alvos de toque, estado e hierarquia. Uma execução do CI ou do Chrome sem inspeção comparativa com a Golden Screen não é aceite visual independente.
- **Acabamento GS715-V03:** o shell compartilhado recebe tema claro apenas na rota A3 `/cartoes`, mantendo o menu e a ação de sair. O cabeçalho interno da fatura não duplica o título do shell no mobile; no desktop o cabeçalho interno substitui a barra superior redundante. Em telas sem fatura o cabeçalho com ação de registro permanece disponível.
- **Alvo de toque REC-715-01:** o menu SVG de cada compra usa alvo mínimo de 44×44 px, com foco explícito e menu ancorado abaixo do acionador; Chrome/SSR verificam o alvo e controle negativo reversível de 30 px.
- **Comparativo visual:** as capturas de `cards-desktop.png`, `cards-mobile.png` e `cards-compact-mobile.png` devem ser confrontadas com as capturas da Golden Screen do mesmo workflow/HEAD material. O CI valida geometria e regressões; o parecer de acabamento independente permanece uma etapa distinta.

Ordem esperada de leitura:

1. selecao do cartao e do periodo da fatura;
2. valor a pagar, estado da fatura, fechamento e vencimento;
3. acoes disponiveis para fechar ou pagar a fatura;
4. composicao, conciliacao, compras por instrumento e limite do cartao;
5. busca, filtros e lista de compras.

A navegacao de periodo da fatura usa um controle compacto com **Anterior**, periodo selecionado e **Proxima**, acompanhado de **Escolher outro mes** para salto direto. Na sequencia principal, o mes corrente e o primeiro periodo elegivel e os meses futuros seguem em ordem cronologica; meses anteriores nao sao inseridos automaticamente nessa sequencia. A consulta historica continua disponivel quando o usuario escolhe explicitamente outro mes, sem transformar os meses historicos em parte da sequencia corrente/futura. Dentro dessa consulta historica explicita, **Anterior** e **Proxima** percorrem meses calendario adjacentes ate o usuario retornar ao mes corrente; essa navegacao local nao altera a sequencia principal corrente/futura. Quando existe fatura, `invoiceId` e `month` devem identificar o mesmo periodo; quando o mes nao possui fatura, a navegacao usa somente o mes e apresenta estado equivalente a **Sem fatura**.

A lista de compras deve:

- preservar o agrupamento e os subtotais por instrumento;
- exibir cabecalho comparavel no desktop com data, compra, categoria, situacao, valor e acoes;
- manter rotulos de contexto por campo no mobile, sem depender da posicao de uma coluna;
- representar conciliacao com icone e texto acessivel, sem depender apenas de cor;
- mostrar contadores nos filtros e anunciar a quantidade de compras visiveis;
- oferecer estado vazio especifico quando busca e filtros nao retornarem resultados;
- manter identificadores de cartao sempre mascarados.

No modal de nova compra:

- `Moeda` vem da moeda padrao do cartao selecionado e nao e substituida por uma moeda generica;
- `Data` abre com a data local atual como sugestao editavel;
- `Categoria` exibe a arvore `parentCategoryId` em ordem pai/filho e apresenta o caminho hierarquico, por exemplo `Alimentacao › Bares e restaurantes`;
- categorias irmas preservam a ordem estavel recebida da API; o cliente nao aplica uma ordenacao alfabetica concorrente;
- categorias orfas continuam visiveis como opcoes de nivel raiz;
- se o cartao nao tiver moeda padrao, a acao de nova compra fica indisponivel e a tela orienta a editar o cartao em `Contas e Cartoes`.
- ao selecionar `Parcelado`, `Valor total da compra` e a interpretacao padrao e informa que o valor sera dividido. `Valor da parcela` exige escolha explicita e informa que o total sera calculado a partir dela.

Os modais de compra e pagamento devem ter titulo e descricao acessiveis, fechamento por controle identificado, foco inicial em campo interativo e layout de coluna unica nas viewports moveis.

A validacao visual permanente usa `scripts/statement-visual/cards-interface.mjs` para os estados principal e modal em desktop e mobile, e `scripts/statement-visual/cards-interface-adversarial.mjs` para `1366x768`, arvore de acessibilidade, anuncio unico da regiao viva, agrupamentos recolhidos e fluxo completo por teclado. O workflow `Statement visual validation` deve preservar as evidencias `cards-desktop.png`, `cards-modal-desktop.png`, `cards-mobile.png`, `cards-modal-mobile.png`, `cards-compact-desktop.png`, `cards-collapsed-groups.png`, `cards-modal-compact-desktop.png`, `cards-interface.json` e `cards-interface-adversarial.json`.

## Propagacao da Golden Screen — Issue #715

A implementacao de `/cartoes` adota o **nivel de acabamento** do Extrato aprovado em 14/10/2026, sem copiar a geometria do Extrato. A ordem de leitura continua `cartao -> fatura -> compras` e o material de referencia integrado na `develop` e o merge da PR #713 (`b50ee44238dd9e63129ebc87a3ee31c0965b19f8`). A certificacao tecnica independente da Issue #714 e um marco distinto do aceite de produto.

- **Acao principal:** quando a fatura permite liquidacao, **Liquidar fatura** tem a unica aparencia primaria no escopo da fatura; **Fechar fatura** e **Registrar compra** sao acoes secundarias, sem alterar autorizacao ou endpoints. Quando a liquidacao nao e permitida, o fechamento permanece visivel como acao secundaria.
- **Composicao:** valor a pagar, situacao, fechamento e vencimento ficam no cabecalho da fatura; limite, conciliacao e total da fatura ficam em faixa compacta de metricas, sem uma grade de cards coloridos.
- **Filtros:** busca e conciliacao sao visiveis; ordenacao e dia ficam em **Mais filtros**, reaberto no SSR quando filtros nao padrao estao ativos. Os inputs continuam associados ao mesmo formulario GET e preservam IDs, query params e controles existentes.
- **Compras:** linha financeira com descricao, valor e codigo de moeda legiveis; descricao e identificacao de cartao longas podem quebrar linha, em vez de serem truncadas. Os totais por instrumento continuam usando agrupamento por moeda, nunca conversao implicita.
- **Mobile e modais:** composicao compacta em 390x844, fallback em 320x740, rolagem interna de formulario, foco perceptivel e botoes com rotulos acessiveis.
- **Documentos da fatura:** retirar o formulário completo da lista principal e apresentá-lo em modal secundário por **Documentos da fatura**, mantendo o vínculo `invoice` e a separação dos anexos de lançamentos (`transaction`).
- **Invariantes:** ocorrencias parceladas, recorrencias, conciliacao, moeda da compra e pagamento da fatura continuam usando os contratos atuais; pagamento e liquidacao da obrigacao e nao segunda compra.

A validacao visual de aceite exige cenarios reais SSR/Chrome com fatura normal, busca sem resultado, descricao longa e modal de compra em 1366x768 e 390x844, alem de 320x740 quando a composicao mudar. A matriz `requisito -> cenario -> screenshot/assertion -> SHA -> parecer independente` deve ser vinculada a Issue #715 e revisada no HEAD final. CI verde nao atesta por si so equivalencia estetica.

## Cobertura esperada

A cobertura automatizada deve proteger pelo menos:

- criacao de agrupador com instrumento inicial e moeda padrao valida;
- persistencia e edicao da moeda padrao do agrupador;
- cartao legado sem moeda bloqueando nova compra sem inventar `BRL`;
- migracao de moeda somente a partir de contexto historico inequivoco;
- criacao de instrumentos fisicos e virtuais;
- titular principal e adicional como titularidade do instrumento, nao como cartao separado;
- default unico por agrupador;
- primeiro instrumento ativo virando default;
- arquivamento do default promovendo outro instrumento ativo;
- agrupador bloqueado/inativo sem instrumento ativo;
- soma de limites individuais respeitando o limite total;
- compra em instrumentos diferentes gerando uma fatura unica por agrupador;
- nova compra sugerindo moeda do cartao e data local atual;
- seletor de categoria exibindo hierarquia pai/filho, mantendo categorias orfas e preservando a ordem de categorias irmas recebida da API;
- fatura exibindo origem por instrumento;
- parcelas e recorrencias preservando o instrumento da compra;
- recorrencias preservando o instrumento definido na criacao;
- rejeicao atomica de compra, parcela ou movimentacao com moeda divergente da fatura;
- deteccao fail-closed de estado historico com compra e fatura em moedas diferentes;
- liquidacao e previsao de pagamento somente com conta na mesma moeda da fatura;
- movimentacao segura de compra para outro periodo de fatura;
- tela `Contas e Cartoes` com lista compacta, criacao e edicao em modal, gestao de instrumentos em modal dedicado, default, arquivamento, estado bloqueado/inativo e ausencia do fluxo legado;
- tela `Cartoes` com hierarquia da fatura, busca, filtros, lista responsiva, estados acessiveis e modais validados em desktop e mobile.

## Parcelas canônicas na fatura

A tela de Cartões consulta parcelas uma vez pelo `invoiceId` selecionado e associa cada ocorrência à compra por `transaction.id`. O indicador `Parcela X de Y` e o `Installment.amountMinor` aparecem na própria linha, sem reintroduzir blocos separados de parcelas ou histórico. `Transaction.amountMinor` permanece o total da compra e pode aparecer somente como `Total da compra`; contagens e subtotais da fatura usam a ocorrência.

Novas compras parceladas persistem, em cada `Installment`, os vínculos `transactionId` da compra econômica e `invoiceId` da fatura que recebeu aquela parcela. Registros legados sem prova inequívoca permanecem sem esses vínculos; descrição, valor, instrumento, data aproximada e ordem visual não são usados como backfill.

A manutenção continua exclusivamente pelo endpoint da compra. O bloqueio `invoice_linked` pertence ao contrato de edição direta de parcelas, prevalece sobre motivos genéricos de situação da transação e não desabilita, por si só, uma compra que a situação da fatura permite editar. O indicador associa essa explicação por `aria-describedby` e oferece tooltip acionável por hover e foco de teclado. Faturas fechadas, pagas ou canceladas mantêm os bloqueios existentes; vencimento isolado não cria novo bloqueio.

## Semantica financeira de compra e liquidacao da fatura

Compra de cartao e pagamento da fatura representam fatos financeiros diferentes:

- a compra e a **despesa economica** e deve ser reconhecida uma unica vez no periodo da compra conforme o contrato do relatorio;
- o pagamento da fatura e a **liquidacao financeira** dessa obrigacao e continua sendo uma `Transaction` da conta de pagamento para representar o movimento de caixa;
- a liquidacao nao cria uma segunda despesa economica.

A classificacao da liquidacao e persistida de forma canonica por `Invoice.paymentTransactionId`. Uma `Transaction` e tratada como pagamento de fatura para fins de agregacao economica quando seu `id` esta referenciado por esse campo. Nao se deve inferir pagamento por descricao, valor, data, categoria ou qualquer outra heuristica.

Consequencias do contrato:

- agregacoes de despesa economica devem excluir a transacao referenciada por `Invoice.paymentTransactionId` e manter as compras da fatura;
- uma despesa legitima com o mesmo valor ou a mesma descricao do pagamento continua sendo despesa quando nao estiver referenciada por `Invoice.paymentTransactionId`;
- calculos especificamente de caixa podem considerar a liquidacao, desde que nao a confundam com uma segunda despesa economica;
- o pagamento persiste `Invoice.paymentTransactionId` apontando para a `Transaction` criada e a resposta devolve essa referencia;
- repetir o pagamento de uma fatura ja paga e rejeitado por `CARD_INVOICE_ALREADY_PAID` antes de criar outra transacao, preservando a idempotencia financeira do fluxo.

Relatorios que exponham despesa economica devem documentar explicitamente essa exclusao. O contrato atual de evolucao por categoria esta em `docs/API_REPORTS.md`.

## Importação de faturas PDF/XLSX (#690)

Faturas importadas por `/api/import-batches/pdf` ou `/api/import-batches/xlsx` não criam um modelo financeiro paralelo. Cada linha revisável referencia o `Card` canônico e, quando confirmado, um `CardInstrument` canônico.

A aprovação chama `registerCardPurchaseForContext` dentro da mesma transação que resolve a `AiSuggestion`. A compra resultante recebe `source=import`, `importBatchId` e `aiSuggestionId`; resolução/criação de `Invoice`, parcelas e projeções continua pertencendo ao domínio de cartões.

Regras específicas:

- a moeda da linha deve coincidir com a moeda canônica do cartão; não há FX implícito;
- identificador mascarado único pode pré-selecionar o instrumento, mas ambiguidade ou ausência bloqueia a aprovação até revisão explícita;
- `invoicePeriod`, quando fornecido pela origem, precisa coincidir com o período da fatura calculado pelo domínio;
- parcelamento só é materializado quando sequência e total foram extraídos de forma consistente e o valor total revisado da compra reproduz exatamente o valor da parcela observado no documento; `Transaction.amountMinor` continua sendo o total da compra e `installmentAmountMinor` é apenas evidência imutável da ocorrência importada;
- total da fatura, pagamento, saldo anterior e linhas de resumo não são tratados como compras;
- deduplicação/conciliação usa o mesmo detector determinístico compartilhado, incluindo `cardId` como evidência.

## Golden Screen — composição e painel contextual (Issue #715)

A rota `/cartoes` reutiliza a linguagem visual aprovada do Extrato: hierarquia textual,
contraste, botões do sistema, filtros acessíveis, resumo financeiro compacto e
lista de compras escaneável. **A composição é master-detail própria de cartões**:
no desktop largo, o painel contextual ocupa a coluna esquerda, com identificação,
seletor do cartão, status, moeda, fechamento, vencimento e instrumentos ativos
visíveis, sem menus sobrepostos nem competir com a área de consulta. A fatura,
valor a pagar, ações de liquidação, indicadores e compras ficam na coluna direita.
Abaixo de 940 px, a composição passa a ser vertical. No mobile, dados contratuais
e instrumentos continuam disponíveis em disclosures acessíveis sem dominar a
primeira viewport.

O registro de compras permanece como ação secundária da página, enquanto a
liquidação mantém precedência **somente no contexto da fatura**; fechamento é
secundário. A lista preserva categoria em coluna, situação por ícone com tooltip,
moeda explícita, ações de 44 px, filtros por conciliação, grupo de instrumentos e
documentos da fatura em diálogo dedicado. Os testes Chrome verificam a coluna
lateral separada e suas informações visíveis e rejeitam uma mutação que volte a
empilhar o painel no desktop. Preservar os contratos financeiros existentes.

A largura externa usa exclusivamente `--sf-layout-content-max-width` e os gutters
`--sf-layout-gutter-desktop` / `--sf-layout-gutter-mobile` do design system, sem
segundo limite local de 1500/1560 px. No desktop de 1920 px o layout A3 deve preencher
a largura efetiva de `.main-area > main`, sem faixas laterais extras, conforme a
mesma área útil do Extrato. O Chrome captura `cards-wide-desktop.png` e reprova
uma redução artificial da largura antes de restaurar a composição.
