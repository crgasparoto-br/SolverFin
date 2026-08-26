# Arquetipos reutilizaveis de tela

Este documento define o contrato de composicao das principais classes de tela do SolverFin. Ele complementa `docs/DESIGN_SYSTEM.md` e usa as primitives executaveis descritas em `docs/UI_PRIMITIVES.md`.

O objetivo e reduzir variacao estrutural entre rotas sem transformar preferencia estetica em requisito. A escolha do arquetipo parte da tarefa dominante do usuario, e nao do nome da rota ou da quantidade de dados exibidos.

## Regras comuns

### Como escolher o arquetipo

1. identificar a decisao ou tarefa dominante da tela;
2. escolher um unico arquetipo primario;
3. usar padroes locais de outro arquetipo apenas dentro de uma regiao subordinada, sem criar uma composicao paralela;
4. preservar ordem, estados e comportamento responsivo do arquetipo primario;
5. registrar uma excecao somente quando houver requisito funcional que nao possa ser expresso pelas primitives existentes.

Uma lista dentro do painel de detalhe de uma tela master-detail, por exemplo, continua sendo uma regiao subordinada da tela master-detail. Isso nao cria um setimo arquetipo.

### Estrutura compartilhada

Quando aplicavel, a composicao parte de `renderPageContainer` e `renderPageHeader`. Filtros usam `renderFilterBar`; resumos podem usar `renderSummaryGrid` quando houver um conjunto pequeno de indicadores que mudem decisao; relacoes mestre-detalhe usam `renderDetailLayout`; formularios usam `renderFormLayout`.

Cards sao reservados a agrupamentos semanticos reais, indicadores destacados ou superficies que precisam de fronteira propria. Pares label/valor, listas, tabelas, definicoes e secoes podem ser usados diretamente quando forem mais adequados. Nenhum arquetipo exige transformar toda informacao em card.

### Acoes

Cada escopo visual deve ter no maximo uma acao primaria evidente. Acoes secundarias ficam proximas do contexto que afetam ou em menu apropriado. Telas somente leitura nao inventam uma acao primaria apenas para preencher o cabecalho.

Acoes destrutivas nao competem visualmente com a acao primaria e devem aparecer em zona ou menu separado quando houver risco de acionamento acidental.

### Estados

Os arquetipos devem representar, quando aplicavel:

- loading, mantendo titulo e contexto suficientes para a pessoa entender o que esta sendo carregado;
- vazio, explicando o que falta e a proxima acao possivel quando existir;
- erro recuperavel, com mensagem orientada a acao e retry quando a operacao puder ser repetida;
- sucesso, por feedback proporcional como `renderToast`, mensagem inline ou atualizacao evidente do estado;
- indisponibilidade e permissao, sem transformar falha de acesso em vazio;
- dados parciais, quando o contrato da rota permitir resultado util incompleto, com alerta explicito sobre o que falta.

A interface nao deve exibir um estado vazio intermediario enquanto ainda esta carregando.

### Desktop e mobile

A ordem semantica deve ser a mesma em desktop e mobile. A versao mobile pode empilhar regioes, reduzir densidade, transformar detalhe lateral em drawer/pagina e permitir overflow controlado de tabela, mas nao deve esconder contexto, moeda, status ou acao necessaria para concluir a tarefa.

Conteudo longo deve reflowar sem sobrepor acoes. Alvos interativos, foco visivel e navegacao por teclado seguem o contrato do design system e das primitives.

### Dialog, drawer e pagina

- dialog: acao curta, foco unico e poucos dados;
- drawer: inspecao ou edicao contextual quando manter a referencia da lista ou do mestre ajuda a tarefa;
- pagina: tarefa longa, multiplas secoes, URL propria ou acao de maior risco.

No mobile, drawer e dialog devem usar a largura segura definida pela fundacao e preservar foco/fechamento das primitives compartilhadas. Nao criar controller modal especifico por rota.

### Valores financeiros e moeda

Todo valor monetario usa o contrato `Money` com moeda explicita. Nao inferir BRL pela ausencia de moeda e nao transformar valor indisponivel em zero.

Valores de moedas distintas ficam separados por moeda, salvo quando existir conversao explicita fornecida por contrato de dominio. Valor nativo e valor convertido devem ser identificaveis como papeis diferentes. O arquetipo nunca soma, converte ou recalcula valores financeiros.

## A1 - Cockpit / dashboard

### Quando usar

Usar quando a tarefa dominante e entender rapidamente situacao, mudanca, horizonte e necessidade de acao. Exemplos principais: `/dashboard` e, com foco operacional por periodo/categoria, `/orcamentos`.

### Hierarquia

1. titulo, periodo e contexto relevante;
2. filtros globais essenciais;
3. poucos indicadores que alterem decisao;
4. tendencia, comparacao ou composicao;
5. alertas, excecoes e itens que exigem acao;
6. detalhe em lista ou tabela;
7. acoes secundarias, exportacao ou metodologia.

### Acoes

A acao primaria deve corresponder ao proximo passo dominante do contexto. Drilldown de indicador e acao contextual, nao substituto de uma acao primaria global. Exportacao e configuracao ficam como secundarias.

### Filtros e busca

Filtros globais ficam antes do conjunto que afetam. Filtro local fica junto da visualizacao correspondente. Busca so aparece quando existe colecao pesquisavel relevante.

### Estados

Loading preserva periodo/contexto. Vazio distingue ausencia real de dados de filtro sem resultado. Erro recuperavel mantem os filtros atuais. Dados parciais exibem o que esta valido e sinalizam explicitamente o bloco indisponivel.

### Desktop e mobile

Desktop pode usar `renderSummaryGrid` para poucos indicadores e manter visualizacao/detalhe em regioes subsequentes. Mobile empilha na mesma ordem de decisao; indicadores nao essenciais nao devem empurrar alertas importantes para uma regiao inacessivel ou escondida.

### Detalhe, dialog, drawer ou pagina

Drilldown curto pode abrir drawer para manter o cockpit como referencia. Analise extensa usa pagina/rota canonica. Dialog fica reservado a acao curta, nao a leitura de series ou tabelas grandes.

### Moeda

Indicadores monetarios exibem moeda explicita. Totais por moedas diferentes ficam em blocos separados. Nao produzir um unico saldo geral sem contrato de conversao.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderFilterBar`, `renderSummaryGrid`, `renderMetricCard` apenas para KPIs selecionados, `renderAlert`, `renderDataTable`, `renderDrawer` e estados compartilhados.

### Exemplo ficticio

Um dashboard de "Perfil Exemplo" mostra periodo atual, saldos BRL e USD em grupos separados, uma variacao do periodo, compromissos proximos e um alerta que leva ao Extrato filtrado. O detalhe completo dos lancamentos permanece no Extrato.

### Criterios observaveis

- situacao, mudanca e necessidade de acao aparecem antes do detalhe bruto;
- o mesmo valor nao e repetido em card, grafico e tabela sem funcao diferente;
- moedas distintas nao sao somadas implicitamente;
- a tela continua compreensivel sem transformar toda medida em card.

## A2 - Listagem / extrato

### Quando usar

Usar quando a tarefa dominante e localizar, filtrar, comparar e agir sobre registros repetitivos. Exemplo principal: `/lancamentos`.

### Hierarquia

1. titulo, contexto da colecao, conta/perfil e moeda quando aplicavel;
2. acao primaria;
3. busca, filtros, ordenacao e filtros ativos;
4. lista ou tabela;
5. agrupamento/paginacao/carregamento progressivo;
6. acoes de linha e selecao em massa;
7. detalhe contextual.

### Acoes

Criacao ou registro pode ser a acao primaria quando fizer parte da jornada. Acoes de linha e massa ficam associadas a selecao/registro; nao devem competir com a acao primaria da pagina.

### Filtros e busca

Usar `renderFilterBar` proximo da lista. Filtros ativos devem permanecer identificaveis e limpaveis. Ordenacao temporal relevante deve ser previsivel e reproduzivel.

### Estados

Loading usa estrutura da colecao sem inventar linhas finais. Vazio distingue "nenhum registro" de "nenhum resultado para estes filtros". Erro de carregamento oferece retry quando aplicavel e preserva filtros. Sucesso de acao nao remove silenciosamente a selecao antes de o resultado ficar evidente.

### Desktop e mobile

Desktop prioriza tabela/lista escaneavel. Mobile pode usar lista responsiva ou overflow horizontal controlado quando a natureza tabular exigir colunas. Data, identificacao, status, valor/moeda e acao principal nao podem desaparecer por causa do viewport.

### Detalhe, dialog, drawer ou pagina

Inspecao e edicao curta usam drawer quando manter a lista ajuda. Dialog serve a confirmacao/acao curta. Tarefa extensa ou que exija URL propria usa pagina.

### Moeda

O contexto da conta e a moeda de cada valor devem ser inequivocos. Registros de moedas diferentes nao produzem subtotal combinado sem conversao explicita.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderFilterBar`, `renderDataTable` ou lista responsiva, `renderBadge`, `renderDrawer`, `renderDialog`, botoes e estados compartilhados.

### Exemplo ficticio

O Extrato da "Conta Exemplo BRL" mostra periodo, busca por descricao, filtros ativos e lancamentos agrupados por data. Selecionar um item abre detalhe contextual sem perder os filtros da lista.

### Criterios observaveis

- registros repetitivos permanecem compactos e escaneaveis;
- filtros ativos e contexto da conta continuam visiveis durante detalhe/retry;
- vazio por filtro nao e apresentado como ausencia total de dados;
- cards grandes nao substituem a lista de registros.

## A3 - Master-detail

### Quando usar

Usar quando a pessoa seleciona um recurso mestre e trabalha com dados/filhos relacionados sem perder esse contexto. Exemplos principais: `/cartoes` e `/contas-cartoes`.

### Hierarquia

1. titulo e contexto da colecao mestre;
2. lista/seletor de mestres com identificacao e status;
3. mestre selecionado e suas acoes;
4. resumo dos dados relevantes;
5. secoes de detalhe, filhos ou linha do tempo;
6. historico, configuracoes secundarias e acoes destrutivas.

Em Cartoes, a hierarquia local e `cartao -> fatura -> compras`; pagamento de fatura e uma acao/liquidacao do contexto da fatura, nao uma segunda compra.

### Acoes

A acao primaria depende do mestre selecionado e deve permanecer associada a ele. Criar novo mestre pode ser acao de colecao. Acoes destrutivas ficam separadas de manutencao comum.

### Filtros e busca

Busca/filtro do mestre fica na regiao mestre. Filtros de filhos ficam no detalhe e nao alteram silenciosamente a selecao do mestre.

### Estados

Loading distingue carregamento da lista mestre e carregamento do detalhe. Colecao vazia orienta criacao quando permitida. Mestre sem filhos e estado vazio local. Erro no detalhe nao deve apagar a lista mestre nem parecer que o recurso deixou de existir.

### Desktop e mobile

Desktop usa `renderDetailLayout` com mestre e detalhe quando houver largura. Mobile colapsa para uma coluna; a selecao atual permanece identificavel e o detalhe pode abrir como drawer/pagina conforme extensao. Nao depender apenas de posicao lado a lado para indicar relacao.

### Detalhe, dialog, drawer ou pagina

O proprio detalhe e parte do arquetipo. Edicao curta pode usar drawer/dialog. Formulario longo ou operacao de maior risco usa pagina. Filhos extensos podem navegar para rota canonica mantendo contexto por parametros suportados.

### Moeda

Moeda do mestre financeiro deve estar visivel antes dos valores de detalhe. Fatura, compras, limites e saldos nao podem herdar uma moeda implicita quando o contrato exige moeda explicita.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderDetailLayout`, `renderDataTable`, `renderTabs` quando houver categorias reais de detalhe, `renderBadge`, `renderDrawer`, `renderDialog`, `renderFormLayout` e estados compartilhados.

### Exemplo ficticio

Em Cartoes, "Cartao Exemplo USD" fica selecionado; o detalhe mostra a fatura atual, fechamento, vencimento e compras. Trocar a fatura muda apenas a regiao de fatura/compras, mantendo o cartao identificado.

### Criterios observaveis

- o recurso mestre selecionado permanece inequivoco durante a tarefa;
- erro/vazio em filhos nao apaga o mestre;
- acoes pertencem claramente a colecao, mestre ou filho correto;
- relacoes nao dependem somente de duas colunas em desktop.

## A4 - Cadastro / configuracao

### Quando usar

Usar quando a tarefa dominante e criar, editar ou configurar dados e preferencias. Exemplos existentes: `/configuracoes` e, para manutencao de classificacoes, `/categorias`.

### Hierarquia

1. titulo e consequencia/contexto da alteracao;
2. navegacao por categoria quando houver grupos independentes;
3. identificacao e campos essenciais;
4. dados principais agrupados por significado;
5. opcoes secundarias/avancadas;
6. revisao de consequencias importantes;
7. salvar/cancelar ou feedback de persistencia;
8. zona de risco separada.

### Acoes

Salvar/aplicar e a acao primaria quando a mudanca nao for imediata. Se cada controle persistir imediatamente, o estado de salvamento deve ser visivel e nao deve existir botao "Salvar" sem efeito real. Cancelar e destrutivas sao secundarios.

### Filtros e busca

Busca so e usada quando existe um catalogo grande de configuracoes. Navegacao por categoria nao deve ser disfarçada como filtro se muda o escopo da configuracao.

### Estados

Loading preserva a categoria atual. Erros de campo aparecem proximos ao controle; erro de submissao usa o resumo recuperavel sem esconder erros locais. Sucesso confirma persistencia. Permissao negada e indisponibilidade nao aparecem como formulario vazio.

### Desktop e mobile

Formularios seguem ordem unica de leitura. Duas colunas so sao aceitaveis para campos curtos e independentes; campos longos, mensagens e erros refluem em uma coluna. Mobile mantem labels, ajuda e acoes proximas dos campos correspondentes.

### Detalhe, dialog, drawer ou pagina

Dialog serve a cadastro curto e independente. Drawer serve a edicao contextual de item selecionado. Configuracao extensa, multipla categoria ou risco elevado usa pagina.

### Moeda

Configuracao que inclui valor financeiro exige moeda como dado explicito. Preferencia de exibicao nao substitui a moeda do dado de dominio.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderFormLayout`, `renderTabs` apenas para categorias reais, inputs/selects existentes, `renderAlert`, `renderDialog`, `renderDrawer`, botoes, toast e estados compartilhados.

### Exemplo ficticio

Em Configuracoes, a categoria "Perfil Exemplo" mostra campos relacionados e indica se a mudanca e imediata. Uma zona de risco separada concentra uma acao destrutiva, sem competir com a manutencao comum.

### Criterios observaveis

- campos sao agrupados por significado, nao por conveniencia visual;
- dependencia entre campos aparece antes do controle dependente;
- feedback informa se a alteracao foi salva, aplicada ou rejeitada;
- zona de risco nao se mistura com configuracao rotineira.

## A5 - Analise / relatorio

### Quando usar

Usar quando a tarefa dominante e compreender tendencia, comparacao, composicao ou resultado antes de consultar dados detalhados. Exemplo principal: `/relatorios`.

### Hierarquia

1. titulo, periodo, escopo e fonte/contexto;
2. filtros reproduziveis;
3. resumo ou conclusao suportada pelos dados;
4. visualizacao de tendencia/comparacao/composicao;
5. destaques, excecoes ou observacoes relevantes;
6. matriz/tabela detalhada;
7. metodologia/exportacao como secundaria.

### Acoes

A acao primaria pode ser aplicar/atualizar filtros quando isso for necessario para gerar o relatorio. Drilldown e exportacao sao secundarias. Relatorio somente leitura nao ganha mutacao artificial.

### Filtros e busca

Filtros devem permanecer visiveis ou resumidos de forma reproduzivel no resultado. Busca pertence ao detalhe tabular quando ajuda a localizar linha, nao a todo relatorio por padrao.

### Estados

Loading preserva parametros. Vazio explica qual combinacao nao retornou dados. Erro recuperavel preserva os filtros. Dados parciais identificam a secao ausente. Sucesso e o proprio resultado atualizado; toast e reservado a acoes como exportacao.

### Desktop e mobile

Visualizacoes refluem sem exigir leitura por largura fixa. Tabela detalhada usa headers semanticos e overflow controlado. Mobile pode empilhar resumo, visualizacao e detalhe, preservando a mesma ordem logica.

### Detalhe, dialog, drawer ou pagina

Drilldown curto pode usar drawer; exploracao extensa deve navegar para rota/filtro canonico. Metodologia curta pode usar dialog, mas nao deve esconder dados essenciais para interpretar o resultado.

### Moeda

Analises monetarias separam blocos por moeda por padrao. Consolidacao cambial so aparece quando o contrato fornece conversao explicita e metadados suficientes para distinguir valor nativo e convertido.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderFilterBar`, `renderSummaryGrid` quando houver poucos resumos, `renderAlert`, `renderDataTable`, `renderDrawer`, `renderDialog`, `Money` e estados compartilhados.

### Exemplo ficticio

Um Relatorio Exemplo para janeiro mostra filtros aplicados, resumo por BRL e USD em secoes separadas, uma comparacao temporal e, depois, a tabela de categorias que sustenta a leitura.

### Criterios observaveis

- a matriz detalhada nao e a primeira representacao quando existe resumo util;
- filtros do resultado podem ser identificados e reproduzidos;
- visualizacao existe para responder pergunta analitica, nao apenas decorar dados;
- moedas distintas permanecem separadas sem conversao implicita.

## A6 - Revisao / inbox

### Quando usar

Usar quando a tarefa dominante e triar itens pendentes, examinar evidencia e tomar uma decisao humana. Exemplo principal: `/inbox`.

### Hierarquia

1. titulo, contagem e contexto da fila;
2. filtros/ordenacao por estado, origem ou prioridade quando suportados;
3. fila compacta com status e sinais necessarios a triagem;
4. item selecionado e evidencia;
5. acao primaria de decisao;
6. acoes secundarias, historico e justificativas.

### Acoes

A decisao principal do item selecionado deve ser clara e reversibilidade/efeito deve seguir o contrato do dominio. Acoes de fila, selecao em massa e filtros ficam separadas da decisao do item.

### Filtros e busca

Filtros pertencem a fila e devem manter estado visivel. Busca e apropriada quando ajuda a localizar item por identificador/conteudo suportado. Trocar filtro nao deve aplicar decisao ao item aberto.

### Estados

Loading separa fila e evidencia. Fila vazia informa que nao ha itens pendentes no recorte atual. Item obsoleto/concorrente deve apresentar estado proprio quando o dominio o expuser, em vez de fingir sucesso. Erro de evidencia nao autoriza decisao sem os dados obrigatorios.

### Desktop e mobile

Desktop pode usar lista + painel de revisao; mobile usa fluxo em uma coluna, drawer ou pagina para o item. Status, origem, evidencia essencial e acoes de decisao devem continuar acessiveis por teclado e sem depender de hover.

### Detalhe, dialog, drawer ou pagina

Drawer funciona para revisao contextual de baixa complexidade. Pagina e adequada quando a evidencia ou historico for extenso. Dialog fica restrito a confirmacao curta; nao substitui a superficie de evidencia.

### Moeda

Quando a evidencia inclui valor financeiro, exibir valor e moeda explicitos. Se o item comparar dados em moedas diferentes, nao apresentar equivalencia sem conversao de dominio.

### Primitives

`renderPageContainer`, `renderPageHeader`, `renderFilterBar`, lista responsiva ou `renderDataTable`, `renderDetailLayout` quando apropriado, `renderBadge`, `renderAlert`, `renderDrawer`, `renderDialog`, botoes e estados compartilhados.

### Exemplo ficticio

A Inbox mostra uma fila de "Importacoes Exemplo". Selecionar um item revela origem, evidencia e status; a decisao principal fica junto da evidencia. Se o item ficar obsoleto durante a revisao, a tela solicita recarregar em vez de confirmar silenciosamente.

### Criterios observaveis

- fila, evidencia e decisao pertencem a regioes distinguiveis;
- estado obsoleto/concorrente nao e tratado como sucesso;
- a decisao nao fica disponivel quando falta evidencia obrigatoria;
- a operacao continua possivel por teclado e em viewport reduzida.

## Mapeamento das telas-piloto

| Rota | Entrega | Tarefa dominante | Arquetipo primario | Composicao local permitida |
| --- | --- | --- | --- | --- |
| `/dashboard` | #608 | entender situacao, mudanca, horizonte e necessidade de acao | A1 Cockpit/dashboard | listas/drilldowns subordinados |
| `/lancamentos` | #609 | localizar, filtrar e agir sobre lancamentos | A2 Listagem/extrato | drawer de detalhe e formularios curtos |
| `/cartoes` | #610 | selecionar cartao/fatura e operar compras no contexto correto | A3 Master-detail | lista de compras e formularios contextuais |
| `/relatorios` | #611 | analisar resumo, visualizacao e evidencia detalhada | A5 Analise/relatorio | tabela e drilldown subordinados |
| `/contas-cartoes` | #612 | selecionar instrumento mestre e manter seu detalhe | A3 Master-detail | cadastro/edicao contextual |
| `/orcamentos` | #613 | acompanhar planejado x realizado por periodo/categoria | A1 Cockpit/dashboard | lista/drilldown e cadastro contextual |
| `/inbox` | #614 | triar evidencia e tomar decisao | A6 Revisao/inbox | master-detail responsivo para item selecionado |

Esse mapeamento nao depende da implementacao das issues #608-#614. Ele define o contrato que essas migracoes devem consumir. A4 Cadastro/configuracao ja possui aplicacao direta em rotas existentes como `/configuracoes` e `/categorias`, sem exigir nova rota.

## Matriz de implementabilidade com as primitives

| Necessidade | Primitive/contrato existente |
| --- | --- |
| container, largura e gutters | `renderPageContainer` |
| titulo, contexto e acoes | `renderPageHeader` |
| filtros e busca | `renderFilterBar` + controles existentes |
| poucos resumos/KPIs | `renderSummaryGrid` + `renderMetricCard` |
| registros repetitivos | `renderDataTable` ou lista responsiva composta |
| mestre e detalhe | `renderDetailLayout` |
| cadastro/edicao | `renderFormLayout` + controles existentes |
| status | `renderBadge` / `renderAlert` |
| loading | `renderLoading` |
| vazio | `renderEmptyState` |
| erro recuperavel | `renderRecoverableError` |
| indisponibilidade | `renderUnavailableState` |
| permissao | `renderPermissionState` |
| feedback de sucesso | `renderToast` ou feedback inline |
| acao contextual curta | `renderDialog` |
| detalhe/edicao contextual | `renderDrawer` |
| navegacao por categorias reais | `renderTabs` |
| valor financeiro | `Money` com `currency` explicita |

Nenhum arquetipo exige uma primitive estrutural nova para ser implementado. Se uma migracao futura encontrar requisito que nao caiba nesta matriz, a lacuna deve ser tratada como evolucao da fundacao, nao como markup/CSS duplicado na rota.

## Criterios de uso e anti-padroes verificaveis

Uma tela esta conforme quando:

- possui um arquetipo primario identificavel pela tarefa dominante;
- ordem de informacao, estados e comportamento mobile seguem o contrato desse arquetipo;
- primitives compartilhadas expressam a estrutura recorrente;
- valores monetarios tem moeda explicita e nao ha soma multi-moeda implicita;
- cards sao usados por agrupamento semantico, nao como layout obrigatorio de todo conteudo;
- dialog, drawer e pagina sao escolhidos pela extensao/contexto da tarefa;
- exemplos, fixtures e evidencias usam dados ficticios.

Nao sao criterios de conformidade palavras como "bonito", "moderno", "premium", "clean" ou "elegante". Qualidade deve ser avaliada por ordem, legibilidade, operabilidade, estados, responsividade, acessibilidade e aderencia aos contratos acima.

## Fora de escopo

- mockup pixel-perfect de todas as rotas;
- criacao de nova rota;
- regra financeira, soma ou conversao dentro do arquetipo;
- escolha ou troca de framework frontend;
- duplicacao de controller modal, tokens ou CSS estrutural por rota.

## Fontes relacionadas

- issue #605 e epic #590;
- `docs/DESIGN_SYSTEM.md`;
- `docs/UI_PRIMITIVES.md`;
- `docs/product/INTERFACE_INVENTORY.md`;
- `docs/EVOLUTION_STRATEGY.md`;
- ADR 0013 e ADR 0014.
