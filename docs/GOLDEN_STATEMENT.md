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
  Sem JavaScript, o select nativo de tipo permanece visivel e acessivel. Com a melhoria
  progressiva ativa, Despesa/Receita/Transferencia usam um radiogroup com setas, Home/End,
  estado selecionado e bloqueios sincronizados. O select original continua como campo
  canonico do payload; transferencia, recorrencia e persistencia usam seus handlers.
  Validacao nativa invalida torna o select visivel novamente, sem campo focavel oculto.
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
a restauracao deve passar. No mobile, a regra e deliberadamente mais estreita:
a regiao **Movimentacoes** deve comecar ainda na primeira viewport em 390 x 844 e
320 x 740, sem exigir que a primeira movimentacao inteira fique visivel sem rolagem.
Isso rejeita o chrome vertical excessivo sem esconder conta, moeda, periodo ou busca.
Campos e valores permanecem acessiveis; o formulario mobile preserva alvos de
44 px e a acao de salvar usa um rodape aderente ao dialog.

## Remediacao visual da revisao GS703

A revisao `audit-rejection:solverfin-703-2b6e3f1-golden-screen` apontou defeitos
na composicao final, incluindo estilos legados executados depois do renderer.
O fechamento deve cobrir a aplicacao autenticada, e nao apenas a fonte do renderer.

### GS703-001: agrupamento legivel

O formulario final usa duas colunas para campos curtos no desktop e uma no mobile.
Valor efetivo, descricao e conta ocupam largura ampla. A camada de enhancement
reutiliza a moeda do SSR em vez de acrescentar uma segunda representacao.
Valor efetivo e um output de leitura que pode reflowar; os handlers continuam
atualizando o mesmo valor, sem mudar calculos, payloads ou regras financeiras.
A lista de membros mantem area minima legivel e acoes acessiveis.

### GS703-002: geometria observada, nao media

`form-geometry.mjs` observa todos os campos visiveis, inclusive um campo tardio
no DOM. Colunas sao contadas por linha real, sem a divisao quantidade/linhas.
Rotulos sao medidos por retangulos de texto e valores financeiros por conteudo
interno, independentemente do overflow do painel. Os controles Chrome injetam
colunas excedentes, campo tardio, moeda duplicada, corte de valor e escape de rotulo;
cada regressao deve reprovar e a restauracao precisa passar.

### GS703-003 e GS703-R01: mobile e cabecalho

`statement-golden-refinements.ts` agrupa categoria/tipo e data/saldo preservando
os nodes e seus handlers. O resumo de situacao e progressivo no desktop e no mobile,
permanece acessivel por teclado e preserva a escolha da pessoa durante o resize.
Conta, moeda, periodo, descricao e valores nao sao removidos.
A acao primaria vem primeiro na ordem de teclado, com as demais acoes subordinadas.
O titulo do dialog utiliza toda a largura do cabecalho; a reserva do botao Fechar
fica apenas na linha superior, sem estreitar o titulo longo.

`statement-refinements.mjs` roda no mesmo Chrome autenticado e publica
`statement-refinements.json`, com SHA, medidas, controles e capturas do topo,
das movimentacoes e do titulo em 320 px. A comparacao da densidade mobile usa
as medidas e a inspecao da composicao; nao cria uma exigencia universal de
primeira movimentacao visivel sem rolagem em todo celular.

### GS703-R02: fechamento individual e referencia ainda candidata

A-001 deve ligar a composicao geral as capturas desktop/mobile do mesmo SHA.
A-002 deve ligar descricao/valor e metadados as capturas das movimentacoes e
as medidas de prioridade tipografica. A-003 deve ligar contexto/resumo horizontal
as medidas de largura e densidade. A-004 deve ligar os filtros e o resumo
progressivo aos controles de teclado e preservacao de estado. A-005 deve ligar
estados, agrupamento, dialogs e regressao injetada aos respectivos relatorios.
A-006 deve registrar a observacao visual de cada um desses itens, separadamente
do fechamento tecnico do handoff. GS703-001 a GS703-003 e GS703-R01/R02 tambem
precisam de fechamento individual na remediacao.

O indice de evidencias nao equivale a homologacao. Uma CI verde ou um handoff
READY nao altera automaticamente `data-golden-screen-state="candidate"` nem
autoriza usar esta tela como referencia aprovada sem nova auditoria independente.

## Aplicacao do mockup do Extrato

A referencia anexada orienta a composicao, nao fornece dados nem novos contratos
financeiros. A implementacao mantem os tokens e o catalogo institucional do produto.
Conta e saldo atual compartilham o mesmo cabecalho no desktop; no mobile, a conta
precede o saldo. Receitas e despesas permanecem compactas abaixo desse cabecalho.
O titulo da colecao passa a ser Movimentacoes, sem repetir o nome completo da conta.

Com JavaScript, Novo lancamento e a acao primaria, conforme o mockup. Ela abre o formulario
canonico com despesa inicialmente selecionada; a pessoa pode escolher receita ou
transferencia no radiogroup. Transferir e Nova receita permanecem como atalhos em
Mais acoes, usando os mesmos botoes, listeners e formularios existentes.
A melhoria altera o rotulo do botao original sem substitui-lo. O fallback SSR
conserva o rotulo Nova despesa e o select de tipo, como compatibilidade temporaria.
O menu abre por teclado, fecha com Escape ou clique externo e devolve foco ao
acionador quando o dialog aberto por uma dessas acoes e fechado. Sem JavaScript,
os controles originais permanecem disponiveis. A situacao do periodo inicia
recolhida em ambos os layouts; expandir revela os contadores e valores originais.

A imagem nao autoriza renomear receitas/despesas como entradas/saidas incluindo
transferencias, inventar saldo inicial/final, fundir as datas financeiras ou tornar
categoria obrigatoria. Atalhos de sete dias, conciliacao por associacao e mover
para outra conta dependem de contratos funcionais proprios; nao sao adicionados
como controles decorativos ou como reinterpretacao de operacoes existentes.

`mockup-composition-contract.mjs` valida cabecalho horizontal, ordem mobile,
largura util e acoes progressivas. Ele e chamado por `statement-refinements.mjs`,
sem um segundo navegador ou novo workflow. O controle GS-MOCKUP-NC-HEADER rejeita
empilhamento indevido no desktop; GS-MOCKUP-ACTIONS-KEYBOARD abre a transferencia
pelo menu real e observa fechamento e retorno do foco. Os controles anteriores
de agrupamento, moeda, titulo, overflow e metadados continuam obrigatorios.

### Controles do formulario e aceite do mockup

`statement-mockup-controls.ts` melhora o mesmo formulario apos o DOM estar pronto.
Nao clona inputs financeiros nem acrescenta campos ao payload. Descricao precede
categoria; categoria e descricao usam largura completa. Cancelar e secundario e
fecha o dialog nativo. A consulta e agrupada com superficie discreta e os tokens
compartilhados; o shell global e as regras financeiras nao sao redesenhados.

A validacao Chrome de transferencia opera o radiogroup pelo teclado e confirma
valor do select canonico, foco e destino visivel. O controle de campo tardio usa
uma linha realmente composta de dois campos, injeta um terceiro no fim do DOM e
exige tres colunas sem colisao incidental. Depois restaura atributos e rolagem.
A aprovacao exige nova evidencia da aplicacao autenticada no SHA publicado. Uma
previa isolada ou patch local nao fecha GS703-001 a GS703-003 nem homologa a tela.


## Paridade visual com o mockup do Extrato

A Golden Screen do Extrato usa o mockup aprovado como referência estrutural, preservando as regras financeiras existentes. A composição deve manter: navegação e cabeçalho compactos, contexto de conta e saldo em bloco horizontal, quatro indicadores do período (saldo inicial, entradas, saídas e saldo final), filtros compactos, lista com descrição/valor dominantes e drawer lateral de lançamento com opções avançadas progressivas.

A paridade não autoriza tornar categoria obrigatória, fundir datas financeiras ou alterar payloads. Diferenças necessárias por contrato funcional devem ser explícitas e visualmente subordinadas.
