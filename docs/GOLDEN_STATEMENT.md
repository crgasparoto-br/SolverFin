# Extrato: candidato a Golden Screen

Este documento especifica o recorte de `/lancamentos` da issue #702 e da PR #703.
Ele complementa `DESIGN_SYSTEM.md`, `SCREEN_ARCHETYPES.md` e `VISUAL_VALIDATION.md`;
nao substitui seus contratos nem declara a referencia aprovada.

## Composicao

- Contexto da conta e resumo financeiro precedem a consulta e a lista.
- O resumo e horizontal no desktop; nao existe coluna lateral competindo com a lista.
- Saldo atual, receitas e despesas preservam exatamente os valores e a semantica do
  view-model existente. Transferencias nao se tornam receitas/despesas por conveniencia visual.
- A lista utiliza a largura disponivel. Descricao e valor dominam a primeira linha;
  categoria, tipo e saldo por movimento permanecem secundarios, sem remover informacao.
- Ordenacao e progressiva, com o estado ativo sempre visivel. Sem JavaScript, o formulario
  GET completo permanece disponivel. Filtros de contexto e busca nao sao apagados pela composicao.
- Criacao/edicao usa o dialog existente com duas colunas no desktop e uma no mobile.
  O select nativo de tipo permanece visivel e acessivel: payload, regras de transferencia,
  recorrencia, bloqueios e handlers de persistencia continuam pertencendo ao formulario.
- Logos continuam resolvidos pelo catalogo institucional compartilhado.

O mockup orienta acabamento, densidade e hierarquia, nao altera regras financeiras.
Os tres indicadores existentes nao sao rebatizados como entradas/saidas incluindo
transferencias. A propagacao para outras rotas permanece na epica #702.

## Evidencia e reprovacao

`transaction-group-layout.mjs`, ja integrado ao workflow visual, executa tambem
`golden-statement.mjs` sobre o aplicativo autenticado e suas fixtures ficticias.
`golden-statement.json` registra o SHA do checkout, cenarios, medidas e capturas.

O teste verifica desktop, mobile (390 e 320 px), conteudo longo, estado vazio,
ordenacao ativa, teclado e abertura do formulario de transferencia. Injecoes
reversiveis simulam a volta da coluna lateral e a perda de destaque do valor:
o contrato precisa rejeitar ambas e aprovar novamente depois da restauracao.
As verificacoes anteriores do agrupamento permanecem obrigatorias.

Essas medidas nao aprovam sozinhas o acabamento. A revisao deve inspecionar as
capturas do SHA candidato e comparar hierarquia, densidade, peso das acoes,
legibilidade, iconografia e dialogs com a referencia. Registrar cada achado
A-001 a A-006 individualmente; nao substituir esse fechamento por CI verde.
Uma fixture isolada de componente nao prova a integracao com o aplicativo.

### Contencao e sobreposicao

O layout nao deve criar rolagem horizontal desnecessaria. O campo legado
`hasLocalHorizontalScroll` agora registra uma prova de rolagem local com conteudo
largo temporario, removido ao final. `hasHorizontalOverflow` preserva a observacao
do conteudo real; `localScrollProbe` registra deslocamento e largura da pagina.
Uma tabela sem `overflow-x: auto|scroll`, incapaz de rolar ou que alargue a pagina
reprova. A posicao de rolagem e os filhos originais devem ser preservados.

No CDI, a categoria pode estar em uma segunda linha. Colisao exige intersecao
nos dois eixos, nao apenas que o texto termine a direita da categoria. O teste
Chrome verifica o conteudo recolhido e expandido em quatro larguras de desktop,
provoca uma colisao real por posicionamento temporario e exige deteccao e
restauracao. Os controles de overflow e legibilidade permanecem obrigatorios.

### Densidade na primeira tela

No cenario desktop 1366 x 768, a primeira movimentacao deve aparecer inteira
sem rolagem inicial. O resumo e os controles nao podem consumir todo o viewport.
`GS-NC-DENSITY` injeta espaco excessivo no resumo e exige que o contrato reprove;
a restauracao deve passar. A restricao de altura nao e aplicada ao reflow mobile.
Campos e valores permanecem acessiveis; o formulario mobile preserva alvos de
44 px e a acao de salvar usa um rodape aderente ao dialog.
