# Identidade visual - SolverFin

Este documento define a direcao de identidade visual do SolverFin para orientar logotipo, interface, documentacao, materiais de apresentacao e geracao de assets por IA.

## Essencia da marca

**SolverFin** e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, autonomos e pequenos negocios. A marca deve transmitir organizacao financeira, confianca, clareza, privacidade e apoio inteligente sem parecer banco tradicional, corretora agressiva ou ferramenta corporativa fria.

### Promessa central

Transformar dados financeiros dispersos em decisoes claras, seguras e acionaveis, com automacao por IA sempre revisavel pelo usuario.

### Personalidade

- **Confiavel:** dados financeiros exigem seguranca, previsibilidade e transparencia.
- **Clara:** linguagem simples, visual limpo e foco em reduzir ansiedade financeira.
- **Inteligente:** IA aplicada como assistente explicavel, nao como caixa-preta.
- **Proxima:** produto acessivel para uso pessoal, MEI, autonomo e pequeno negocio.
- **Controlada:** automacoes devem sugerir, classificar e conciliar, mas manter o usuario no comando.

## Conceito criativo

### Ideia matriz

**Clareza que organiza o fluxo financeiro.**

A identidade deve combinar tres ideias visuais:

1. **Fluxo financeiro:** entradas, saidas, recorrencias, conciliacao e movimento.
2. **Resolucao inteligente:** IA, padroes, conexoes e sugestoes explicaveis.
3. **Protecao e controle:** privacidade, tenant, consentimento, auditoria e revisao humana.

### Metaforas visuais recomendadas

- Grafico de linha ascendente ou curva de fluxo.
- Letra **S** formada por trilha, circuito, fluxo ou caminho financeiro.
- Check discreto ou ponto de confirmacao para representar conciliacao revisavel.
- Escudo sutil, sem excesso, para privacidade e seguranca.
- Grade modular ou cards para remeter a organizacao de dados.

Evitar moedas literais, cifroes genericos, porquinhos, predios bancarios, mascotes infantis ou visual de criptomoeda especulativa.

## Direcao de logotipo

### Tipo de marca recomendado

Um **simbolo abstrato + wordmark SolverFin**.

O simbolo deve funcionar sozinho em favicon/app icon e tambem junto ao nome. A melhor direcao e um monograma abstrato com a letra **S**, usando fluxo, curva ou circuito para sugerir IA financeira.

### Atributos do simbolo

- Geometrico, simples e memoravel.
- Cantos levemente arredondados.
- Legivel em tamanho pequeno.
- Sem muitos detalhes internos.
- Capaz de funcionar em modo claro e escuro.

### Wordmark

- Tipografia sans-serif moderna, humana e tecnica.
- Peso medium ou semibold.
- Boa legibilidade em dashboard, mobile e documentacao.
- Preferir formas arredondadas e abertas, evitando fontes bancarias excessivamente serias.

## Paleta de cores

### Cores principais

| Papel | Cor | Hex | Uso |
| --- | --- | --- | --- |
| Primaria | Azul petroleo profundo | `#0F3D4C` | Confianca, seguranca, base institucional |
| Secundaria | Verde financeiro inteligente | `#16A34A` | Saude financeira, progresso, confirmacao |
| Destaque | Ciano tecnologico | `#22D3EE` | IA, automacao, estados ativos e highlights |
| Fundo claro | Branco gelo | `#F8FAFC` | Interfaces limpas e documentacao |
| Texto principal | Grafite azulado | `#0F172A` | Leitura e hierarquia |

### Cores de suporte

| Papel | Cor | Hex | Uso |
| --- | --- | --- | --- |
| Alerta | Ambar | `#F59E0B` | Avisos, pendencias, revisao |
| Erro | Vermelho controlado | `#DC2626` | Falhas, riscos, inconsistencias |
| Sucesso suave | Verde claro | `#DCFCE7` | Estados positivos de baixo ruido |
| Superficie escura | Azul noite | `#061923` | Dark mode, hero, materiais premium |

## Direcao de UI

A interface deve ser **mobile-first**, limpa e orientada a rotina diaria. O usuario precisa entender rapidamente saldo, proximas contas, lancamentos sugeridos, pendencias de conciliacao e insights.

### Principios visuais

- Layout com bastante respiro, hierarquia clara e superficies discretas.
- Usar cards apenas quando organizarem dados ou acoes; evitar cards explicativos em excesso.
- Hierarquia clara para saldo, fluxo, pendencias e acoes rapidas.
- Estados de IA sempre marcados como sugestao, com origem, confianca e botao de revisar.
- Graficos simples: linhas, barras e donuts apenas quando ajudarem decisao.
- Contraste forte para acessibilidade.
- Microcopy direta, sem jargao bancario.
- Toda acao visivel deve incluir um icone reconhecivel e semanticamente coerente, sem depender apenas do texto ou da cor para comunicar sua finalidade.

### Padrao obrigatorio de icones

- Use o catalogo central `icon(...)` de `apps/web/src/dev-server/icons.ts`, baseado nos desenhos Lucide e com `currentColor` para herdar o tema.
- Quando um icone necessario nao existir, adicione-o ao catalogo central; nao replique SVG em componentes, templates ou estilos isolados.
- Nao use emoji, simbolos Unicode, fontes de icones ou desenhos ad hoc como substitutos de icones da interface.
- Botoes primarios, acoes destrutivas, acoes pouco frequentes e comandos com risco de ambiguidade devem combinar **icone + texto**.
- Acoes recorrentes e compactas podem usar somente icone quando o contexto for inequivoco, mantendo `aria-label`, `title` ou tooltip, alvo interativo adequado e foco visivel.
- Icones decorativos devem usar `aria-hidden="true"`; icon-only buttons devem possuir nome acessivel que descreva a acao, nao o desenho.
- Mantenha tamanho, espessura, alinhamento e espacamento consistentes entre acoes equivalentes. O tamanho padrao e 16 x 16 px, salvo hierarquia visual documentada.
- Estados como ativo, selecionado, erro, sucesso e desabilitado nao podem depender apenas da cor; combine estilo, texto acessivel e estado semantico.

### Padrao de telas e CRUD

- Telas de listagem devem ser limpas, objetivas e orientadas a acao.
- Evitar blocos longos de texto introdutorio, cards educativos e explicacoes permanentes quando a acao for autoexplicativa.
- Preferir estados vazios compactos com uma frase curta e uma acao principal.
- Criacao e edicao de registros devem acontecer em **pop-up/modal sempre que possivel**, sem navegar para outra pagina.
- Use pagina dedicada apenas quando o formulario for longo, exigir comparacao ampla, envolver fluxo guiado em varias etapas ou precisar de contexto visual extenso.
- O botao principal de criacao deve ficar em local consistente da tela e usar o icone de adicionar acompanhado do rotulo da acao.
- Acoes por linha, como editar, duplicar, arquivar, excluir ou visualizar, devem usar icones do catalogo central com tooltip e nome acessivel.
- Selecao de itens em listas e tabelas deve usar o marcador circular padrao do sistema, com alvo interativo de 24 x 24 px, foco visivel e estados marcado, desmarcado e desabilitado claramente distinguiveis.
- Checkbox quadrado deve ficar reservado a opcoes booleanas de formulario; o marcador circular padrao representa selecao operacional de linhas ou itens.
- Confirmacoes destrutivas devem usar modal curto, com titulo direto, impacto claro e acao primaria segura.
- Modais devem ter titulo objetivo, campos agrupados por necessidade real, botoes claros, fechamento por cancelar/esc e foco acessivel.
- Em mobile, modais podem se comportar como bottom sheet ou tela sobreposta, preservando a sensacao de fluxo rapido.

### Densidade e conteudo

- Cada tela deve mostrar primeiro os dados e acoes mais importantes para a rotina financeira.
- Textos auxiliares devem ser curtos e aparecer perto do campo ou estado que explicam.
- Evitar repetir instrucoes que o usuario ja entende pelo rotulo, icone ou posicionamento.
- Preferir tabelas, listas compactas e filtros simples a paineis explicativos.
- Indicadores e badges devem ser usados para status, pendencias e alertas, nao como decoracao.

## Tom de voz visual e verbal

- Falar como um assistente financeiro organizado, nao como gerente de banco.
- Preferir: "Revise esta sugestao", "Possivel duplicidade", "Resumo do mes", "Tudo certo com estes lancamentos".
- Evitar promessas absolutas como "controle total", "riqueza garantida" ou "IA sem erro".

## Prompt Midjourney para logotipo

Use o prompt abaixo como ponto de partida:

```text
modern fintech logo for "SolverFin", abstract geometric monogram letter S formed by a flowing financial path and subtle AI circuit nodes, symbol suggesting clarity, smart reconciliation, privacy and control, trustworthy yet approachable, deep petroleum blue and intelligent green with small cyan technology accent, clean vector style, rounded corners, minimal, scalable app icon plus wordmark, modern humanist sans-serif typography, white background, high contrast, premium SaaS identity, no dollar sign, no coins, no bank building, no piggy bank, no crypto style --ar 1:1 --v 6.1 --style raw
```

### Variacao para explorar apenas o simbolo

```text
abstract app icon for SolverFin, geometric letter S made from connected financial flow lines and subtle AI nodes, small check mark hidden in the curve to represent reviewed reconciliation, deep petroleum blue background, green and cyan gradient accent, minimal vector mark, rounded square icon, trustworthy fintech, privacy-first, clean, scalable, no text, no dollar sign, no coins, no bank building, no crypto style --ar 1:1 --v 6.1 --style raw
```

### Variacao horizontal com wordmark

```text
horizontal brand logo for SolverFin, minimal abstract S symbol formed by smooth financial flow and intelligent circuit nodes, paired with modern rounded sans-serif wordmark "SolverFin", deep petroleum blue, intelligent green, cyan accent, clean fintech SaaS identity, friendly and secure, vector, white background, balanced spacing, professional startup logo, no dollar sign, no coins, no bank building, no piggy bank, no crypto style --ar 3:1 --v 6.1 --style raw
```

## Checklist de aprovacao do logo

Antes de aprovar uma opcao, validar:

- Funciona em favicon e app icon.
- Continua legivel em 24px.
- Nao depende de gradiente para ser reconhecido.
- Nao parece banco tradicional, exchange cripto ou app de apostas.
- Comunica confianca sem parecer frio.
- Pode ser aplicado em modo claro, escuro e monocromatico.
- Tem relacao clara com fluxo financeiro, IA e controle humano.
