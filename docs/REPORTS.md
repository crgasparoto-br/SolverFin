# Relatorios do SolverFin

Este documento e a fonte funcional da area **Relatorios**. Ele registra o que esta disponivel no produto e o contrato planejado para novas visoes, sem substituir os contratos tecnicos das APIs.

## Objetivo

A area de relatorios deve transformar os lancamentos do perfil financeiro em consultas somente leitura, verificaveis e coerentes com Extrato, Dashboard, categorias, cartoes, parcelas e orcamentos.

Relatorios devem:

- respeitar organizacao e perfil financeiro;
- usar os registros financeiros canonicos como fonte de verdade;
- evitar dupla contagem de agrupamentos, parcelas, compras e faturas;
- preservar categorias arquivadas no historico;
- separar moedas diferentes, sem conversao implicita;
- apresentar filtros, periodo e regras de calculo de forma compreensivel;
- nunca alterar, conciliar ou excluir lancamentos.

## Estado atual

A rota `/relatorios` possui uma consulta de **Parcelas consolidadas**. A tela usa `GET /api/installments` e permite filtrar por mes, cartao, categoria e status.

O relatorio atual apresenta:

- parcelas abertas ou planejadas;
- parcelas postadas ou ligadas a faturas fechadas;
- parcelas vencidas;
- parcelas futuras;
- total mensal;
- agrupamentos por mes, cartao e categoria;
- lista das parcelas consideradas.

Essa visao permanece somente leitura e nao deve ser removida pela evolucao da area.

## Evolucao por categoria

**Status:** planejado na issue #542.

A visao **Evolucao por categoria** deve acompanhar receitas, despesas e resultado em uma matriz temporal semelhante a um demonstrativo financeiro por categoria.

A nova visao deve coexistir com **Parcelas consolidadas** dentro de `/relatorios`. A selecao da visao e os filtros devem permanecer na URL por parametros `GET`.

### Intervalos

A tela deve oferecer **Intervalo**, **Inicio**, **Periodo** e **Carregar**.

#### Mensal

- inicio em `AAAA-MM`;
- de 1 a 24 meses;
- padrao de 12 meses;
- uma coluna por mes consecutivo.

#### Anual

- inicio em `AAAA`;
- de 1 a 10 anos;
- padrao de 3 anos;
- uma coluna por ano-calendario.

#### Anual com inicio movel

- inicio em `AAAA-MM`;
- de 1 a 10 periodos anuais;
- padrao de 3 periodos;
- cada coluna cobre 12 meses consecutivos;
- o periodo seguinte inicia 12 meses depois do anterior.

Periodos sem movimento devem continuar visiveis com valor zero. Filtros invalidos nao podem disparar consulta ampla ou silenciosamente corrigida.

### Fonte de dados

A evolucao deve usar `Transaction` e `occurredOn` como fonte e data operacional.

Entram nos calculos:

- `income` com status `posted` ou `reconciled`;
- `expense` com status `posted` ou `reconciled`.

Nao entram:

- transferencias;
- lancamentos `planned`;
- lancamentos `suggested`;
- lancamentos `voided`.

Um lancamento elegivel deve ser considerado uma unica vez, mesmo quando for membro de `TransactionGroup`, estiver vinculado a parcela canonica, compra, fatura, recorrencia, importacao, sugestao revisada ou remuneracao de conta.

Agrupamentos de apresentacao, parcelas e faturas nao criam valores adicionais no relatorio.

### Agregacao

A agregacao deve ocorrer no servidor por contrato especifico de leitura. O frontend nao deve baixar todo o historico bruto para montar periodos extensos.

Quando o recorte possuir mais de uma moeda:

- cada moeda deve gerar um bloco independente;
- totais de moedas diferentes nao podem ser somados;
- nao deve haver conversao cambial implicita.

### Estrutura da matriz

A matriz deve conter:

1. coluna de descricao;
2. colunas dos periodos selecionados;
3. coluna **Media**;
4. coluna **Total**.

A ordem das linhas deve ser:

1. **Receitas**;
2. categorias e subcategorias de receita;
3. **Despesas**;
4. categorias e subcategorias de despesa;
5. **Resultado**.

Categorias principais consolidam lancamentos diretos e todos os descendentes. Subcategorias aparecem indentadas conforme a profundidade da hierarquia.

Regras adicionais:

- incluir categorias arquivadas quando houver movimento historico;
- usar **Sem categoria** para lancamentos nao classificados;
- ocultar categorias zeradas em todos os periodos do recorte;
- ordenar categorias irmas pelo total decrescente e depois pelo nome;
- evitar dupla contagem ao consolidar pais e descendentes.

### Calculos

- **Receitas:** soma dos lancamentos de receita.
- **Despesas:** soma dos lancamentos de despesa, exibida com sinal negativo.
- **Resultado:** receitas menos despesas.
- **Media:** total da linha dividido pela quantidade de periodos exibidos, incluindo periodos zerados.
- **Total:** soma da linha em todos os periodos.

Percentuais secundarios:

- categoria de receita: participacao no total de receitas do periodo;
- categoria de despesa: participacao no valor absoluto das despesas do periodo;
- linha **Despesas**: despesas divididas por receitas;
- linha **Resultado**: resultado dividido por receitas.

Quando o denominador for zero, a interface deve exibir `—`, nunca `NaN`, `Infinity` ou percentual enganoso.

Os percentuais de **Media** e **Total** devem usar numeradores e denominadores agregados no recorte, e nao a media simples dos percentuais de cada coluna.

### Experiencia e acessibilidade

- A matriz deve priorizar leitura densa sem copiar identidade visual de produtos externos.
- Tema, tokens e componentes devem seguir o SolverFin.
- Em desktop, cabecalho e primeira coluna devem permanecer legiveis durante rolagem horizontal quando a arquitetura permitir.
- Em telas menores, filtros devem quebrar em linhas e a matriz deve permitir rolagem horizontal.
- Valores nao podem depender apenas de verde e vermelho; sinal, texto e hierarquia devem manter o significado.
- Controles devem funcionar por teclado, com foco visivel e rotulos acessiveis.
- Estados de carregamento, vazio, filtro invalido e falha de API devem orientar a proxima acao.

## Contratos legados do frontend

A issue #44 criou contratos e calculos iniciais em `apps/web/src/reports/`, incluindo:

- gastos por categoria;
- previsto versus realizado;
- evolucao mensal de receitas, despesas e resultado;
- estados `loading`, `empty`, `error` e `ready`.

Esses modulos podem ser reaproveitados, mas usam nomes e estados anteriores ao contrato persistido atual. Antes de reutilizar, devem ser alinhados a `Transaction.kind`, `Transaction.status`, `amountMinor`, `occurredOn`, hierarquia atual de categorias e isolamento por perfil financeiro.

## Fora do primeiro corte da evolucao por categoria

- exportacao PDF, CSV ou Excel;
- impressao formatada;
- graficos adicionais;
- comparacao com orcamento ou meta;
- drill-down ate o lancamento individual;
- filtros avancados por conta, origem, usuario ou status;
- conversao cambial;
- alteracao de dados a partir do relatorio;
- persistencia de preferencias fora da URL.

## Testes esperados

A implementacao da issue #542 deve cobrir:

- geracao de periodos mensais, anuais e anuais moveis;
- totais, medias e percentuais, inclusive denominador zero;
- hierarquia com valores diretos no pai e em varios niveis de filhos;
- categorias arquivadas, **Sem categoria** e linhas totalmente zeradas;
- exclusao de transferencias e estados nao realizados;
- ausencia de dupla contagem com grupos, parcelas e faturas;
- isolamento por organizacao e perfil financeiro;
- separacao por moeda;
- estados e filtros da pagina;
- validacao visual desktop e mobile com dados ficticios.

## Referencias

- Issue #44: base inicial de contratos de relatorios.
- Issue #542: especificacao da evolucao por categoria.
- [`API_TRANSACTIONS.md`](./API_TRANSACTIONS.md): fonte e estados dos lancamentos.
- [`API_CATEGORIES.md`](./API_CATEGORIES.md): hierarquia e historico de categorias.
- [`STATUS_MATRIX.md`](./STATUS_MATRIX.md): estado observado da area no branch principal.
- [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md): regras de interface e acessibilidade.
