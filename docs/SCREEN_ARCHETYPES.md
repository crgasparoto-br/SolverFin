# Arquetipos reutilizaveis de tela

Este documento define o contrato de composicao das principais classes de tela do SolverFin.
Ele complementa `docs/DESIGN_SYSTEM.md` e usa as primitives de `docs/UI_PRIMITIVES.md`.

A escolha do arquetipo parte da tarefa dominante do usuario. Nome de rota, volume de dados ou
preferencia estetica nao criam um arquetipo novo.

## Regras comuns

### Escolha e composicao

1. Identificar a decisao ou tarefa dominante.
2. Escolher um unico arquetipo primario.
3. Usar padroes de outro arquetipo apenas em regioes subordinadas.
4. Preservar ordem, estados e comportamento responsivo do arquetipo primario.
5. Tratar como lacuna da fundacao requisito que nao caiba nas primitives existentes.

Uma lista dentro do detalhe de um master-detail continua subordinada ao master-detail. Isso nao
cria excecao ad hoc nem um setimo arquetipo.

A estrutura usa, quando aplicavel, `renderPageContainer`, `renderPageHeader`, `renderFilterBar`,
`renderSummaryGrid`, `renderDetailLayout` e `renderFormLayout`.

Cards ficam reservados a agrupamentos semanticos ou poucos indicadores que alterem decisao.
Listas, tabelas, secoes, definicoes e pares label/valor podem aparecer diretamente.

### Acoes

Cada escopo visual possui no maximo uma acao primaria evidente. Acoes secundarias ficam proximas
do contexto que afetam. Telas somente leitura nao inventam uma acao primaria. Acoes destrutivas
ficam separadas da manutencao comum.

### Estados

Quando aplicavel, toda tela representa:

- loading, mantendo titulo e contexto suficientes para orientar a pessoa;
- vazio, distinguindo ausencia real de dados de filtro sem resultado;
- erro recuperavel, preservando contexto e oferecendo retry quando possivel;
- sucesso, por estado visivel, mensagem inline ou `renderToast`;
- indisponibilidade e permissao, sem converter falha de acesso em vazio;
- dados parciais, identificando explicitamente o que esta indisponivel.

A interface nao exibe vazio intermediario enquanto ainda esta carregando.

### Desktop e mobile

A ordem semantica e a mesma em desktop e mobile. Mobile pode empilhar regioes, reduzir densidade,
transformar detalhe lateral em drawer/pagina e usar overflow controlado em tabelas. Contexto,
status, moeda e acao necessaria nao podem desaparecer por causa do viewport.

Conteudo longo deve reflowar sem sobrepor acoes. Foco, teclado e alvos interativos seguem o
design system e as primitives.

### Dialog, drawer e pagina

- Dialog: acao curta, foco unico e poucos dados.
- Drawer: inspecao ou edicao contextual em que manter a lista ou mestre ajuda a tarefa.
- Pagina: tarefa longa, varias secoes, URL propria ou operacao de maior risco.

No mobile, dialog e drawer usam o comportamento responsivo e de foco das primitives existentes.
Nao criar controller modal especifico por rota.

### Valores financeiros e moeda

Todo valor monetario usa `Money` com moeda explicita. Ausencia de moeda nao vira BRL e valor
indisponivel nao vira zero. Moedas distintas ficam separadas, salvo quando uma conversao explicita
do dominio for fornecida. O arquetipo nao soma, converte nem recalcula valores financeiros.

## A1 - Cockpit / dashboard

**Quando usar:** entender situacao, mudanca, horizonte e necessidade de acao. Exemplos:
`/dashboard` e `/orcamentos` quando o foco e acompanhamento operacional.

**Hierarquia:** titulo/periodo/contexto; filtros globais; poucos indicadores decisivos; tendencia
ou comparacao; alertas e excecoes; detalhe; exportacao/metodologia como secundarias.

**Acoes:** a principal corresponde ao proximo passo dominante. Drilldown e contextual.
Exportacao e configuracao permanecem secundarias.

**Filtros e busca:** filtros globais aparecem antes do conjunto que afetam. Filtro local fica
junto da visualizacao. Busca aparece somente quando existe colecao pesquisavel relevante.

**Estados:** loading preserva periodo/contexto; vazio distingue ausencia de dados de filtro sem
resultado; erro mantem filtros; dado parcial mostra blocos validos e identifica o que faltou.

**Desktop/mobile:** desktop pode usar `renderSummaryGrid` para poucos indicadores. Mobile empilha
as regioes na mesma ordem de decisao e nao esconde alertas ou acoes essenciais.

**Detalhe:** drilldown curto pode usar drawer; analise extensa usa pagina ou rota canonica; dialog
fica reservado a acao curta.

**Moeda:** indicadores monetarios exibem moeda explicita. Totais de moedas diferentes ficam
separados. Nao produzir saldo geral unico sem conversao de dominio.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderFilterBar`,
`renderSummaryGrid`, `renderMetricCard`, `renderAlert`, `renderDataTable` e `renderDrawer`.

**Exemplo ficticio:** "Perfil Exemplo" mostra periodo, saldos BRL e USD separados, variacao,
compromissos proximos e alerta que navega ao Extrato filtrado.

**Criterios de uso:** situacao e acao aparecem antes do detalhe; o mesmo valor nao e repetido sem
funcao diferente; moedas nao sao somadas implicitamente; cards nao viram layout universal.

## A2 - Listagem / extrato

**Quando usar:** localizar, filtrar, comparar e agir sobre registros repetitivos. Exemplo:
`/lancamentos`.

**Hierarquia:** titulo/contexto/conta/moeda; acao primaria; busca/filtros/ordenacao; lista ou
tabela; paginacao ou agrupamento; acoes de linha/massa; detalhe contextual.

**Acoes:** criacao ou registro pode ser primaria. Acoes de linha e massa ficam ligadas ao item ou
selecao e nao competem com a acao principal da pagina.

**Filtros e busca:** `renderFilterBar` fica junto da lista. Filtros ativos permanecem visiveis e
limpaveis. Ordenacao relevante deve ser previsivel e reproduzivel.

**Estados:** loading nao inventa linhas finais; vazio distingue "nenhum registro" de "nenhum
resultado"; erro preserva filtros e oferece retry; sucesso fica evidente antes de limpar contexto.

**Desktop/mobile:** desktop prioriza leitura compacta. Mobile usa lista responsiva ou overflow
controlado quando colunas forem essenciais. Data, status, valor/moeda e acao nao desaparecem.

**Detalhe:** inspecao ou edicao curta usa drawer quando manter a lista ajuda; dialog confirma acao
curta; tarefa extensa ou com URL propria usa pagina.

**Moeda:** contexto da conta e moeda de cada valor ficam inequivocos. Subtotal de moedas
diferentes nao e combinado sem conversao explicita.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderFilterBar`, `renderDataTable`,
`renderBadge`, `renderDrawer`, `renderDialog`, botoes e estados compartilhados.

**Exemplo ficticio:** o Extrato da "Conta Exemplo BRL" mostra periodo, busca, filtros ativos e
lancamentos por data; o detalhe abre sem perder filtros ou contexto.

**Criterios de uso:** registros permanecem escaneaveis; filtros/contexto sobrevivem a detalhe e
retry; vazio por filtro nao vira ausencia total; cards grandes nao substituem a colecao.

## A3 - Master-detail

**Quando usar:** selecionar recurso mestre e trabalhar com dados ou filhos relacionados sem perder
o contexto. Exemplos: `/cartoes` e `/contas-cartoes`.

**Hierarquia:** titulo/colecao mestre; seletor de mestres; mestre selecionado e acoes; resumo;
detalhe/filhos; historico e zona destrutiva. Em Cartoes: `cartao -> fatura -> compras`.
Pagamento da fatura e liquidacao da fatura, nao uma segunda compra.

**Acoes:** a principal depende do mestre selecionado. Criar mestre pode ser acao da colecao.
Acoes destrutivas ficam separadas da manutencao comum.

**Filtros e busca:** busca do mestre fica na regiao mestre. Filtros de filhos ficam no detalhe e
nao alteram silenciosamente a selecao do mestre.

**Estados:** loading da colecao e do detalhe sao distintos; colecao vazia orienta criacao quando
permitida; mestre sem filhos e vazio local; erro do detalhe nao apaga o mestre.

**Desktop/mobile:** desktop usa `renderDetailLayout` quando houver largura. Mobile colapsa para
uma coluna e mantem a selecao identificavel. A relacao nao depende apenas da posicao lado a lado.

**Detalhe:** o detalhe faz parte do arquetipo. Edicao curta pode usar drawer/dialog; formulario
longo ou operacao de maior risco usa pagina.

**Moeda:** moeda do mestre financeiro aparece antes dos valores de detalhe. Fatura, compras,
limites e saldos nao herdam moeda implicita.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderDetailLayout`,
`renderDataTable`, `renderTabs`, `renderBadge`, `renderDrawer`, `renderDialog` e
`renderFormLayout`.

**Exemplo ficticio:** "Cartao Exemplo USD" fica selecionado; o detalhe mostra fatura atual,
fechamento, vencimento e compras; trocar a fatura mantem o cartao identificado.

**Criterios de uso:** mestre selecionado permanece inequivoco; erro/vazio em filhos nao apaga o
mestre; acoes pertencem ao nivel correto; relacao mestre-filho continua clara no mobile.

## A4 - Cadastro / configuracao

**Quando usar:** criar, editar ou configurar dados e preferencias. Exemplos existentes:
`/configuracoes` e `/categorias`.

**Hierarquia:** titulo/consequencia; navegacao por categoria quando real; identificacao; campos
principais; opcoes secundarias; revisao; salvar/cancelar ou feedback; zona de risco.

**Acoes:** salvar/aplicar e primaria quando a mudanca nao for imediata. Se cada controle persistir
imediatamente, o estado de salvamento fica visivel e nao existe botao sem efeito real.

**Filtros e busca:** busca aparece somente para catalogo grande. Navegacao por categoria nao e
chamada de filtro quando muda o escopo da configuracao.

**Estados:** loading preserva categoria; erro de campo fica junto do controle; erro de submissao
nao esconde erro local; sucesso confirma persistencia; permissao negada nao vira formulario vazio.

**Desktop/mobile:** formulario segue uma ordem unica. Duas colunas servem apenas a campos curtos e
independentes. Campos longos, ajuda e erros refluem em uma coluna.

**Detalhe:** dialog serve a cadastro curto; drawer a edicao contextual; configuracao extensa,
multipla categoria ou risco elevado usa pagina.

**Moeda:** configuracao com valor financeiro exige moeda explicita. Preferencia de exibicao nao
substitui a moeda do dado de dominio.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderFormLayout`, `renderTabs`,
controles existentes, `renderAlert`, `renderDialog`, `renderDrawer`, botoes e `renderToast`.

**Exemplo ficticio:** "Perfil Exemplo" agrupa campos relacionados e informa se a mudanca e
imediata; uma zona de risco separada concentra a acao destrutiva.

**Criterios de uso:** campos sao agrupados por significado; dependencias aparecem antes do campo
dependente; feedback informa persistencia; zona de risco nao se mistura com manutencao rotineira.

## A5 - Analise / relatorio

**Quando usar:** compreender tendencia, comparacao, composicao ou resultado antes do detalhe
bruto. Exemplo: `/relatorios`.

**Hierarquia:** titulo/periodo/escopo; filtros reproduziveis; resumo ou conclusao; visualizacao;
destaques/excecoes; matriz/tabela detalhada; metodologia/exportacao como secundarias.

**Acoes:** aplicar filtros pode ser primaria quando necessario para gerar o resultado. Drilldown e
exportacao sao secundarios. Relatorio somente leitura nao ganha mutacao artificial.

**Filtros e busca:** filtros permanecem identificaveis e reproduziveis. Busca pertence ao detalhe
tabular quando ajuda a localizar uma linha.

**Estados:** loading preserva parametros; vazio explica a combinacao sem dados; erro preserva
filtros; dado parcial identifica a secao ausente; sucesso e o resultado atualizado.

**Desktop/mobile:** visualizacoes refluem sem largura fixa. Tabela usa headers semanticos e
overflow controlado. Mobile empilha resumo, visualizacao e detalhe na mesma ordem logica.

**Detalhe:** drilldown curto pode usar drawer; exploracao extensa usa rota/filtro canonico; dialog
pode explicar metodologia curta sem esconder dado essencial.

**Moeda:** analise monetaria separa blocos por moeda. Consolidacao cambial aparece somente quando
o dominio fornece conversao e distingue valor nativo de convertido.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderFilterBar`,
`renderSummaryGrid`, `renderAlert`, `renderDataTable`, `renderDrawer`, `renderDialog` e `Money`.

**Exemplo ficticio:** um Relatorio Exemplo mostra filtros aplicados, resumos BRL e USD separados,
comparacao temporal e depois a tabela de categorias que sustenta a leitura.

**Criterios de uso:** matriz nao vem primeiro quando existe resumo util; filtros sao reproduziveis;
visualizacao responde pergunta analitica; moedas ficam separadas sem conversao implicita.

## A6 - Revisao / inbox

**Quando usar:** triar itens pendentes, examinar evidencia e tomar decisao humana. Exemplo:
`/inbox`.

**Hierarquia:** titulo/contagem; filtros/ordenacao; fila compacta; item selecionado e evidencia;
acao primaria de decisao; acoes secundarias, historico e justificativas.

**Acoes:** decisao do item fica junto da evidencia. Acoes de fila, selecao em massa e filtros
ficam separadas da decisao do item.

**Filtros e busca:** filtros pertencem a fila e mantem estado visivel. Busca aparece quando ajuda a
localizar item. Trocar filtro nao aplica decisao ao item aberto.

**Estados:** loading da fila e da evidencia sao distintos; fila vazia informa ausencia de
pendencias no recorte; item obsoleto/concorrente usa estado proprio; falha de evidencia nao
autoriza decisao que dependa dela.

**Desktop/mobile:** desktop pode usar fila e painel de revisao. Mobile usa uma coluna, drawer ou
pagina. Status, origem, evidencia e decisao continuam acessiveis por teclado e sem hover
obrigatorio.

**Detalhe:** drawer atende revisao contextual curta; pagina atende evidencia ou historico extensos;
dialog fica restrito a confirmacao curta e nao substitui a superficie de evidencia.

**Moeda:** evidencia financeira mostra valor e moeda explicitos. Itens em moedas diferentes nao
aparecem como equivalentes sem conversao de dominio.

**Primitives:** `renderPageContainer`, `renderPageHeader`, `renderFilterBar`, `renderDataTable`,
`renderDetailLayout`, `renderBadge`, `renderAlert`, `renderDrawer`, `renderDialog` e botoes.

**Exemplo ficticio:** a Inbox de "Importacoes Exemplo" mostra origem, evidencia e status do item;
se ele ficar obsoleto durante a revisao, a tela solicita recarregar em vez de confirmar.

**Criterios de uso:** fila, evidencia e decisao sao distinguiveis; obsolescencia nao vira sucesso;
decisao nao fica disponivel sem evidencia obrigatoria; fluxo segue operavel por teclado/mobile.

## Mapeamento das telas-piloto

- `/dashboard` (#608): A1 Cockpit/dashboard. Listas e drilldowns ficam subordinados.
- `/lancamentos` (#609): A2 Listagem/extrato. Drawer e formularios curtos sao locais.
- `/cartoes` (#610): A3 Master-detail. Compras ficam no contexto cartao/fatura.
- `/relatorios` (#611): A5 Analise/relatorio. Tabela e drilldown sao subordinados.
- `/contas-cartoes` (#612): A3 Master-detail. Cadastro e edicao podem ser contextuais.
- `/orcamentos` (#613): A1 Cockpit/dashboard. Lista, drilldown e cadastro ficam locais.
- `/inbox` (#614): A6 Revisao/inbox. O item pode usar master-detail responsivo.

Esse mapeamento nao depende da conclusao das issues #608-#614. Ele define o contrato que essas
migracoes devem consumir. A4 ja se aplica a `/configuracoes` e `/categorias`, sem nova rota.

## Implementabilidade com as primitives

- Container e gutters: `renderPageContainer`.
- Titulo, contexto e acoes: `renderPageHeader`.
- Filtros e busca: `renderFilterBar` e controles existentes.
- Poucos resumos: `renderSummaryGrid` e `renderMetricCard`.
- Registros repetitivos: `renderDataTable` ou lista responsiva composta.
- Mestre e detalhe: `renderDetailLayout`.
- Cadastro e edicao: `renderFormLayout` e controles existentes.
- Status e alerta: `renderBadge` e `renderAlert`.
- Loading: `renderLoading`.
- Vazio: `renderEmptyState`.
- Erro recuperavel: `renderRecoverableError`.
- Indisponibilidade: `renderUnavailableState`.
- Permissao: `renderPermissionState`.
- Feedback de sucesso: `renderToast` ou feedback inline.
- Acao curta: `renderDialog`.
- Detalhe ou edicao contextual: `renderDrawer`.
- Categorias reais: `renderTabs`.
- Valor financeiro: `Money` com `currency` explicita.

Nenhum arquetipo exige primitive estrutural nova. Requisito futuro que nao caiba nesse conjunto
deve evoluir a fundacao em vez de duplicar markup ou CSS por rota.

## Criterios de uso e anti-padroes verificaveis

Uma tela esta conforme quando:

- possui arquetipo primario identificavel pela tarefa dominante;
- ordem, estados e comportamento mobile seguem esse arquetipo;
- primitives compartilhadas expressam a estrutura recorrente;
- valores monetarios tem moeda explicita e nao ha soma multi-moeda implicita;
- cards sao usados por agrupamento semantico, nao como layout universal;
- dialog, drawer e pagina sao escolhidos pela extensao e contexto da tarefa;
- exemplos, fixtures e evidencias usam dados ficticios.

"Bonito", "moderno", "premium", "clean" e "elegante" nao sao criterios de conformidade.
Qualidade deve ser avaliada por ordem, legibilidade, operabilidade, estados, responsividade,
acessibilidade e aderencia aos contratos acima.

## Fora de escopo

- Mockup pixel-perfect de todas as rotas.
- Criacao de nova rota.
- Regra financeira, soma ou conversao dentro do arquetipo.
- Escolha ou troca de framework frontend.
- Duplicacao de controller modal, tokens ou CSS estrutural por rota.

## Fontes relacionadas

- Issue #605 e epic #590.
- `docs/DESIGN_SYSTEM.md`.
- `docs/UI_PRIMITIVES.md`.
- `docs/product/INTERFACE_INVENTORY.md`.
- `docs/EVOLUTION_STRATEGY.md`.
- ADR 0013 e ADR 0014.
