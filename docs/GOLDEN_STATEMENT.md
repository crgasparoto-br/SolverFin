# Extrato: Golden Screen aprovada visualmente

Este documento especifica a Golden Screen do Extrato (`/lancamentos`) da epica #702,
com fechamento tecnico pela issue #714 e pela PR #713, baseada em `develop`. A PR #703
e o marco historico inicial, ja incorporado a `develop`, nao a referencia material atual.
Ele complementa `DESIGN_SYSTEM.md`, `SCREEN_ARCHETYPES.md` e `VISUAL_VALIDATION.md`.

**Estado:** aceite visual de produto concedido em 14/10/2026 e registrado na #702.
**Referencia visual de produto:** SHA material
`366e02072ee39116cfc50a7bc602273902e516fc` na PR #713, com modais de novo,
editar e clonar centralizados. O aceite visual nao equivale a certificado de handoff,
auditoria tecnica independente, integracao na `develop` ou liberacao de release.
Antes de propagar alteracoes em codigo nas issues #715–#719, consultar o marco tecnico
publicado apos a integracao regular da #713; a #714, isoladamente, nao implementa
qualquer tela de propagacao.

## Composicao

- Contexto da conta e resumo financeiro precedem a consulta e a lista.
- O resumo e horizontal no desktop; nao existe coluna lateral competindo com a lista.
- Saldo atual e os quatro indicadores preservam os valores do view-model existente:
  Saldo inicial usa `openingMinor`, Entradas usa `incomeMinor`, Saidas usa
  `expenseMinor` em magnitude positiva e Saldo final usa `effectiveBalanceMinor`.
  **Conta individual:** Entradas inclui receitas e transferencias recebidas; Saidas
  inclui despesas e transferencias enviadas, sempre na moeda nativa da conta
  (`destinationAmountMinor` para a perna recebida quando houver cambio).
  **Todas as contas (`accountId=all`):** agregar somente contas da moeda filtrada;
  transferencias internas entre contas dessa mesma moeda permanecem na listagem,
  mas nao inflam Entradas/Saidas, enquanto transferencias cambiais entram nos cards
  pela perna da moeda selecionada, sem conversao implicita. Isso nao reclassifica
  transferencia como receita/despesa no cadastro ou na API. Lancamentos previstos
  preservam a distincao entre saldo projetado e efetivo; anulados ficam excluidos.
  A ADR 0018 governa essas diferencas por modo.
- A lista utiliza a largura disponivel. Descricao e valor dominam a primeira linha;
  categoria, tipo e saldo por movimento permanecem secundarios, sem remover informacao.
- Categoria, Tipo, Status e Conciliacao ficam diretamente disponiveis na barra
  compacta desktop. No mobile, os filtros sao progressivos e filtros ativos abrem
  o painel inicialmente; Aplicar/Limpar permanecem disponiveis quando ele esta fechado.
  Ordenacao e progressiva, com o estado ativo sempre visivel. Sem JavaScript, o
  formulario GET completo permanece disponivel. Conta e periodo pertencem ao
  contexto financeiro, preservando o vinculo nativo com o formulario de consulta.
- Cadastro (novo lancamento), clonagem e edicao usam o mesmo dialog nativo, sempre
  centralizado horizontal e verticalmente na viewport, sem ancoragem na borda direita
  como drawer ou painel lateral. O formulario mantem duas colunas no desktop e uma
  no mobile; o dialog respeita margens seguras e rola internamente quando necessario.
  Sem JavaScript, o select nativo de tipo permanece visivel e acessivel. Com a melhoria
  progressiva ativa, Despesa/Receita/Transferencia usam um radiogroup com setas, Home/End,
  estado selecionado e bloqueios sincronizados. O select original continua como campo
  canonico do payload; transferencia, recorrencia e persistencia usam seus handlers.
  Validacao nativa invalida torna o select visivel novamente, sem campo focavel oculto.
- Logos continuam resolvidos pelo catalogo institucional compartilhado.

## Componentes de escolha e confirmacao

A Golden Screen inclui os estados interativos dos botoes e nao somente
suas posicoes. Opcoes alternativas de escopo, categoria, situacao e outras
escolhas em dialog devem usar controles neutros compartilhados, sem botao
primario preselecionado. As opcoes possuem fundo branco, borda sutil e
texto azul-petroleo legivel; hover e foco adotam os tokens neutros
compartilhados, sem transformar um botao em superficie azul-escura.
Apenas a confirmacao final de uma acao usa a variante primaria.

Ao criar novos dialogos e menus, auditar a precedencia de
`button:hover:not(:disabled)` do shell frente aos seletores locais.
Conferir fundo, texto, borda, foco visivel e contraste para mouse e teclado
em desktop e mobile. Evitar classes locais de botao que reimplementem
cores e estados com menor especificidade do que a regra global. Consulte
`docs/DESIGN_SYSTEM.md` para o contrato obrigatorio.

O mockup orienta acabamento, densidade e hierarquia, nao altera regras financeiras.
A propagacao para outras rotas permanece na epica #702, posterior a aprovacao
independente da referencia.

## Evidencia e reprovacao

`transaction-group-layout.mjs`, ja integrado ao workflow visual, executa tambem
`golden-statement.mjs` sobre o aplicativo autenticado e suas fixtures ficticias.
`golden-statement.json` registra o SHA do checkout, cenarios, medidas e capturas.

O teste verifica desktop, mobile (390 e 320 px), conteudo longo, estado vazio,
ordenacao ativa, teclado e abertura do formulario de transferencia. Injecoes
reversiveis simulam a volta da coluna lateral e a perda de destaque do valor:
o contrato precisa rejeitar ambas e aprovar novamente depois da restauracao.
As verificacoes anteriores do agrupamento permanecem obrigatorias.

`statement-contextual-surfaces.mjs`, chamado pelo mesmo cenario de agrupamento,
registra `statement-contextual-surfaces.json` com SHA, rota, viewport, geometria,
foco, controles negativos e capturas de novo lancamento, edicao, detalhes do grupo,
mais acoes e conciliacao em 1366x768, 390x844 e 320x740. Cada superficie rejeita
uma ancoragem fora da viewport e passa novamente apos restauracao. A conciliacao
percorre `posted -> reconciled -> posted` pelos controles reais, com releitura do
estado renderizado apos persistencia. Os detalhes sao do grupo canonico; o produto
nao possui drawer separado de detalhes de um lancamento individual nem dialogo de
conciliacao por associacao. O registro dessas diferencas nao autoriza criar fluxos
decorativos. As capturas devem ser comparadas com as cinco superficies do mockup
antes de afirmar paridade visual; medidas verdes nao fazem essa comparacao.

`statement-alternative-states.mjs` registra `statement-alternative-states.json`
e capturas nos mesmos tres viewports para vazio por busca sem correspondencia e
erro de sessao rejeitada pela API real. O vazio preserva a conta e o resumo;
o erro nao expoe linhas financeiras e mantem a acao de recuperacao. Controles
negativos ocultam cada mensagem e exigem deteccao e restauracao. O cookie da
sessao demo e restaurado em memoria e nunca entra nas evidencias. As arvores de
acessibilidade das cinco superficies contextuais tambem ficam nos artefatos
`statement-contextual-<estado>-<viewport>-ax.json`, ligados ao mesmo SHA.

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

Em larguras de ate 360 px, os indicadores usam linhas com rotulo e valor
completos, e o periodo separa a navegacao mensal da acao Mes atual. A busca e
as acoes Aplicar/Limpar continuam visiveis; a ordenacao nativa permanece no
grupo expansivel Filtros e ordenacao. No dialog, Despesa e Receita dividem a
primeira linha, Transferencia ocupa a segunda, e Cancelar/Salvar usam a largura
disponivel. O teste verifica cada palavra dos botoes por `Range` e injeta uma
largura insuficiente para provar a deteccao de palavras partidas.

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

### GS703-R02: fechamento individual do candidato historico (antes do aceite de 14/10)

A-001 deve ligar a composicao geral as capturas desktop/mobile do mesmo SHA.
A-002 deve ligar descricao/valor e metadados as capturas das movimentacoes e
as medidas de prioridade tipografica. A-003 deve ligar contexto/resumo horizontal
as medidas de largura e densidade. A-004 deve ligar os filtros e o resumo
progressivo aos controles de teclado e preservacao de estado. A-005 deve ligar
estados, agrupamento, dialogs e regressao injetada aos respectivos relatorios.
A-006 deve registrar a observacao visual de cada um desses itens, separadamente
do fechamento tecnico do handoff. GS703-001 a GS703-003 e GS703-R01/R02 tambem
precisam de fechamento individual na remediacao.

**Historico da validacao anterior ao aceite de 14/10/2026:** o indice de evidencias
nao equivalia a homologacao e CI/handoff READY nao alteravam automaticamente o
estado interno `data-golden-screen-state="candidate"`. Essa cautela nao revoga o
aceite visual expresso registrado na #702, mas o estado visual aprovado tambem nao
comprova o gate tecnico independente, o handoff valido ou o merge da PR #713.

## Aplicacao do mockup do Extrato

A referencia anexada orienta a composicao, nao fornece dados nem novos contratos
financeiros. A implementacao mantem os tokens e o catalogo institucional do produto.
Conta e saldo atual compartilham o mesmo cabecalho no desktop; no mobile, a conta
precede o saldo. Os quatro indicadores permanecem compactos abaixo desse cabecalho.
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

O mockup nao altera a regra financeira por modo: transferencias entram nos cards
individuais e transferencias cambiais entram nos cards de `Todas` na moeda escolhida;
apenas transferencias internas da mesma moeda nao inflam o consolidado (ADR 0018).
A imagem nao autoriza reclassificar transferencias como receita/despesa,
inventar saldo inicial/final, fundir as datas financeiras ou tornar
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

A Golden Screen visualmente aprovada do Extrato usa o mockup como referência estrutural,
preservando as regras financeiras existentes. A composição deve manter: navegação
e cabeçalho compactos, contexto de conta e saldo em bloco horizontal, quatro
indicadores do período (saldo inicial, entradas, saídas e saldo final), filtros
compactos, lista com descrição/valor dominantes e dialog centralizado para
cadastro, clonagem e edição de lançamentos, com opções avançadas progressivas.

Por decisão posterior ao mockup, a geometria de painel lateral ilustrada para
novo lançamento não é normativa: `POST` (novo e clonar) e `PATCH` (editar) devem
abrir centralizados. Não transformar o diálogo de criação em drawer à direita.
Preservar foco, Escape, tecla de retorno ao acionador, alvos de toque e rolagem
interna do formulário, inclusive em 1366x768, 390x844 e 320x740.

A paridade não autoriza tornar categoria obrigatória, fundir datas financeiras
ou alterar payloads. Diferenças necessárias por contrato funcional devem ser
explícitas e visualmente subordinadas.

## Visão consolidada na mesma Golden Screen (decisão de 2026-10-14)

A opção **Todas as contas** em `/lancamentos?accountId=all&currency=BRL&month=AAAA-MM` preserva o mesmo layout da conta individual, identifica a conta sob a descrição e soma saldos **somente de contas da moeda selecionada**. Na conta individual, transferências recebidas compõem Entradas e enviadas compõem Saídas (na moeda da conta). No modo consolidado, as transferências internas da mesma moeda não compõem os cards, mas as **transferências cambiais permanecem** como entradas/saídas na moeda filtrada, sem alterar a projeção do saldo. As previstas não entram no saldo efetivo, e o menu Ações permite editar, clonar, conciliar/desconciliar e excluir lançamentos existentes com a conta de origem real identificada (além de Ver na conta). Novo lançamento sem conta selecionada não pode ser salvo. O filtro de moeda é obrigatório nesse modo. Para regras, controles negativos e razão da decisão, consulte [ADR 0018](./adr/0018-golden-statement-consolidated-by-currency.md).

## Ultima conta selecionada entre sessoes

No Extrato (`/lancamentos`), ao escolher uma conta individual ou `Todas as contas`,
a ultima selecao e lembrada no mesmo navegador, inclusive depois de encerrar a sessao
e autenticar-se novamente. O identificador e salvo em `localStorage`, no escopo
da combinacao **usuario autenticado + perfil financeiro ativo** (sem token, credencial,
saldo ou informacao de lancamentos). Um usuario ou perfil diferente nunca reutiliza
a selecao do anterior.

Um link com `accountId` explicito prevalece sobre a preferencia local e passa a
ser a nova selecao quando pertencer as contas disponiveis no perfil. Na entrada
sem `accountId`, restaurar apenas uma conta disponivel no seletor ou a opcao
`all`. Se a conta foi arquivada/removida, limpar a preferencia invalida e manter
o fallback da tela. Um filtro `currency` explicito nao deve ser substituido por
conta de outra moeda. Preservar mes, filtros e parametros ja informados na URL.
Falhas da API de identidade/perfil ou indisponibilidade do armazenamento local
nao impedem usar os filtros e formulario GET do Extrato.

A preferencia e **local ao navegador/dispositivo**; sincronizacao entre dispositivos
nao esta neste requisito. Logout invalida somente credenciais/sessao, sem apagar
essa escolha.

## Atalhos de período — Hoje e intervalos relativos (17/10/2026)

Na Golden Screen do Extrato, **Hoje** consulta o dia civil de São Paulo (`America/Sao_Paulo`), independentemente do relógio UTC da VPS, e atualiza conjuntamente `month` e `day`. Os atalhos de 7/30 dias definem limites reais `from`/`to` e exibem o período efetivo; atalhos não podem manter um dia ou intervalo antigo nem perder `profileId`, `accountId`, moeda, pesquisa ou demais filtros.

A consulta de transações do Extrato deve filtrar pelo **dia efetivamente exibido** (`effectiveOn ?? plannedOn ?? occurredOn`, cutoff `statementTo`) e não somente por `occurredOn`; o servidor mantém os filtros de ocorrência existentes para outros consumidores. O saldo inicial depende das transações anteriores ao começo do intervalo e os saldos da tabela devem respeitar a mesma data canônica. O formulário GET não deve duplicar o campo `day`: o campo é renderizado pelo servidor dentro do formulário original, com ou sem JavaScript; o script apenas atualiza limites, limpa o dia e aplica o filtro.

## Extrato por dia e densidade da tabela — PR #720 (17/10/2026)

O seletor **Dia do mês** faz parte do HTML do filtro, inclusive quando o JavaScript não carrega.
Seu `min` e `max` são o primeiro e o último dia do mês selecionado, permitindo filtrar
exatamente um dia, sem consultar datas de outro mês. O botão **Mês completo** remove apenas
o dia, preservando conta, perfil, moeda e os demais filtros. Mudar de mês limpa um dia
anterior. O período, totais e saldos usam as mesmas datas efetivas exibidas na tabela.

Com ordenação por data (ascendente ou descendente), as movimentações aparecem em **grupos
diários abertos por padrão**. Cada cabeçalho mostra data, quantidade, entradas e saídas
do dia; clique, Enter ou Espaço sobre o cabeçalho recolhe/expande somente aquele dia,
sem remover filtros ou alterar cálculo financeiro. Transferências contam com o sinal
da conta exibida. Em ordenações globais por valor ou descrição, as linhas permanecem
sem agrupamento para não alterar o resultado da ordenação escolhida.

No desktop, o Extrato usa uma única linha para cada movimento, com **Valor** e
**Saldo** em colunas distintas, alinhadas à direita. A categoria já comunica
o tipo com sua cor e ícone; o texto duplicado de Tipo não deve ocupar uma nova linha.
A grade respeita a Golden Screen, mantendo ícone de situação interativo, ações,
checkbox e acessibilidade; em telas estreitas, há reflow sem truncar valores.
O agrupamento visual não modifica a natureza dos grupos financeiros persistidos.

### Contrato visual obrigatório para novos filtros (PR #720)

Toda alteração em telas deve passar pela Skill `design-interface` do repositório
`crgasparoto-br/skill` (branch `develop`), consultando também os tokens e a Golden
Screen vigente **antes** de editar CSS/HTML. Não é suficiente renderizar o componente:
as dimensões e o alinhamento precisam ser conferidos no Chrome no mesmo SHA.

Campos curtos, como **Dia do mês**, não podem herdar spans de buscas ou tabelas.
No desktop (largura a partir de 1340px), o filtro fica na mesma linha de Busca,
Tipo, Status, Conciliação, Categoria e Aplicar, com largura máxima de `11.5rem`
(~184px), enquanto Busca mantém espaço flexível; os atalhos ocupam linha anterior.
De 1101px a 1339px, a grade faz reflow sem aumentar o seletor de dia; em tablet
o dia permanece compacto e em celulares pode ocupar a largura disponível.
O controle nativo de calendário e a ação de limpar dia devem permanecer utilizáveis.

A aceitação exige observação real de proporções, alturas, foco, contraste e ausência
de overflow em 1366x768, 1665x900 e nos breakpoints mobile. Toda alteração de
padrão deve atualizar os testes e evidências da Golden Screen, não apenas o CSS.

## Situacao da ocorrencia recorrente no Extrato — PR #720

O menu acessivel do icone de situacao deve habilitar `Marcar como conciliado`
para ocorrencia recorrente materializada em estado **Previsto** ou **Efetivado**,
independentemente do indicador visual de recorrencia; um item conciliado oferece
`Desconciliar`. A operacao afeta somente a ocorrencia selecionada e usa o mesmo
menu neutro ja aprovado pela Golden Screen. Os bloqueios de compras no cartao,
grupos financeiros e remuneracoes continuam validos. Nenhum botao novo ou modal
concorrente deve ser criado apenas para reconciliar itens recorrentes.
