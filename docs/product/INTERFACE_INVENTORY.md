# Inventario de interfaces - baseline da Fase 2

Este inventario registra o recorte navegavel revisado no fechamento da Fase 2. Ele nao substitui `apps/web/src/app-shell/routes.ts`, que continua sendo a fonte canonica de rotas e disponibilidade, nem os documentos donos dos contratos de cada dominio.

## Rotas disponiveis

| Rota | Interface | Acesso | Papel no baseline |
| --- | --- | --- | --- |
| `/login` | Entrar | Publico | Entrada e autenticacao |
| `/dashboard` | Dashboard | Perfil financeiro | Resumo e acompanhamento da rotina financeira |
| `/lancamentos` | Extrato da conta | Perfil financeiro | Lancamentos, recorrencias, parcelas e compromissos de conta |
| `/cartoes` | Cartoes de Credito | Perfil financeiro | Compras, faturas, recorrencias e compromissos de cartao |
| `/contas-cartoes` | Contas e Cartoes | Perfil financeiro | Cadastro mestre de instrumentos financeiros |
| `/remuneracao-contas` | Remuneracao pelo CDI | Perfil financeiro; oculta da navegacao | Compatibilidade/fluxo especializado preservado pelo contrato de rotas |
| `/categorias` | Categorias | Perfil financeiro | Organizacao de receitas, despesas e transferencias |
| `/orcamentos` | Orcamentos | Perfil financeiro | Planejamento por categoria |
| `/assistente` | Assistente financeiro | Perfil financeiro | Consultas somente leitura com evidencia deterministica |
| `/inbox` | Inbox | Perfil financeiro | Revisao de mensagens, importacoes e sugestoes |
| `/relatorios` | Relatorios | Perfil financeiro | Analises e acompanhamento somente leitura |
| `/configuracoes` | Configuracoes | Autenticado | Perfis, preferencias e controles relacionados |
| `/admin/instituicoes` | Admin - Instituicoes | Master | Catalogo global de instituicoes |
| `/admin/indices-financeiros` | Admin - Indices financeiros | Master | Operacao de indices e remuneracao |

Todas as rotas acima estavam marcadas como `available` no catalogo canonico no inicio da #569.

## Jornadas sem rota propria

Alguns fluxos fazem parte do baseline, mas deliberadamente nao possuem tela independente:

- recorrencias sao criadas e mantidas em `/lancamentos` ou `/cartoes`;
- parcelas aparecem incorporadas ao Extrato, Cartoes e Relatorios conforme o contexto;
- contas a pagar/receber nao voltam a ser uma jornada ativa; compromissos de conta ficam no Extrato e compromissos de cartao ficam em Cartoes;
- insights revisaveis participam da experiencia da Inbox e dos pontos de navegacao definidos pelo contrato do dominio.

Criar uma nova rota para esses casos exige issue/decisao propria e nao faz parte do fechamento da Fase 2.

## Estados e comportamentos a preservar

A regressao final deve preservar, quando aplicavel a cada interface:

- carregamento, vazio, sucesso, erro controlado e retry;
- navegacao por teclado, foco visivel e reflow em viewport reduzida/zoom;
- shell autenticado e requisitos de perfil financeiro;
- estados de concorrencia, idempotencia, cancelamento ou obsolescencia expostos de forma controlada;
- separacao de moedas quando o dominio nao executa conversao;
- textos orientados a acao, sem detalhes internos desnecessarios;
- ausencia de dados sensiveis em HTML, logs, fixtures e evidencias visuais.

## Evidencia visual

O gate visual canonico e `.github/workflows/statement-visual-validation.yml`. A suite existente em `scripts/statement-visual/` cobre o Extrato, selecao/acoes, parcelas, relatorios, Inbox, configuracoes, interfaces de contas/cartoes, insights e assistente, alem dos cenarios complementares executados diretamente pelo workflow.

A aprovacao do baseline da Fase 2 exige que o workflow visual conclua com sucesso no mesmo SHA candidato usado para a entrega de #569 e publique o artefato `statement-visual-evidence-<sha>`.

## Fontes relacionadas

- `apps/web/src/app-shell/routes.ts`: catalogo canonico de rotas.
- `docs/APP_SHELL.md`: shell, navegacao e contrato de estilos SSR.
- `docs/DESIGN_SYSTEM.md`: regras visuais e provedores de estilo.
- `docs/STATUS_MATRIX.md`: estado funcional por area.
- `docs/RUNBOOK.md`: procedimento do gate final da Fase 2.
- `docs/PRODUCT.md`: jornadas, principios de produto e limites do MVP.