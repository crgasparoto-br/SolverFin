# Estrategia de evolucao - core multi-moedas e arquitetura de interface

## Objetivo

Este documento define a direcao de evolucao do SolverFin a partir do baseline atual. Ele nao declara funcionalidades futuras como implementadas; separa explicitamente o estado observado do produto da arquitetura-alvo e da ordem de entrega.

As issues abertas no GitHub continuam sendo a fonte de verdade operacional do planejamento. Este documento registra os principios, dependencias e criterios que devem orientar essas issues.

## Decisoes de direcao

1. O SolverFin e um sistema **multi-moedas**. Moeda nao e apenas formatacao de tela: faz parte do contrato financeiro, de persistencia, agregacao, filtros, relatorios, projecoes e assistente.
2. Nenhum agregado financeiro pode somar valores de moedas diferentes silenciosamente.
3. Consolidacao entre moedas somente pode existir quando houver politica explicita de conversao, moeda de referencia e metadados da cotacao usada.
4. A qualidade visual deve ser corrigida na arquitetura da interface, e nao por uma sequencia indefinida de ajustes locais de CSS ou pos-processamentos de HTML.
5. A migracao da interface sera incremental. O SSR, acessibilidade, responsividade e gates visuais atuais devem permanecer protegidos enquanto cada rota migra.
6. Nao ha decisao de adotar React, Vue, Svelte ou outro framework neste ciclo. Componentizacao, view-models e contratos de interface devem melhorar independentemente dessa escolha futura.
7. Regras e calculos financeiros permanecem fora da camada de apresentacao. A UI recebe modelos preparados e nao redefine semantica contabil, moeda, saldo ou fatura.

## Estado atual que motiva a estrategia

O baseline atual possui boa cobertura funcional, tenant/perfil financeiro, persistencia real, testes, acessibilidade e validacao visual. Ao mesmo tempo, a camada web acumulou renderers extensos, CSS especifico por pagina e pos-processadores de HTML ligados ao despacho HTTP. Esse desenho foi util para evoluir o MVP, mas aumenta o custo de manter hierarquia visual, responsividade e consistencia entre telas.

No dominio financeiro, entidades ja possuem moeda em diferentes contratos, e relatorios ja preservam separacao por moeda em alguns fluxos. Entretanto, qualquer resumo, saldo, insight ou projecao que exponha um unico numero precisa provar que os valores pertencem a uma mesma moeda ou que houve conversao explicita.

## Invariantes multi-moedas

- Todo valor monetario deve possuir moeda conhecida no boundary em que e persistido, calculado ou exibido.
- A moeda deve usar identificador canonico compativel com ISO 4217 quando aplicavel.
- Operacoes aritmeticas entre moedas diferentes sao invalidas sem uma etapa explicita de conversao.
- Agregacoes padrao devem ser particionadas por moeda.
- Uma moeda de referencia do perfil pode ser introduzida por issue propria, mas nao autoriza conversao implicita.
- Quando houver conversao, a resposta deve manter moeda de origem, moeda de destino, taxa, instante/data de referencia e origem da cotacao suficientes para auditoria e reproducao.
- Dashboard, relatorios, orcamentos, metas, projecoes, insights e assistente devem preservar a moeda do calculo e nunca rotular como BRL um agregado misto.
- Testes devem incluir perfis com pelo menos duas moedas para impedir regressao de somas cruzadas.

A decisao arquitetural detalhada fica na ADR 0013.

## Arquitetura-alvo da interface

A interface deve evoluir para quatro camadas claras:

```text
shell/
  AppShell
  Sidebar
  TopBar
  ProfileContext

ui/
  Button
  IconButton
  Card
  MetricCard
  DataTable
  EmptyState
  Alert
  Dialog
  Drawer
  Tabs
  Badge
  Money

layout/
  PageHeader
  PageContainer
  FilterBar
  SummaryGrid
  DetailLayout
  FormLayout

features/
  dashboard/
  statement/
  cards/
  accounts/
  budgets/
  reports/
  inbox/
  assistant/
```

Os nomes representam responsabilidades, nao obrigatoriamente diretorios finais. A implementacao deve escolher o menor desenho coerente com o repositorio e preservar SSR.

### Regras da nova fundacao

- Componentes estruturais devem possuir API explicita e estados verificaveis.
- Tokens de espacamento, tipografia, raio, elevacao, tamanhos, grid, breakpoints e densidade devem ser compartilhados.
- Componentes financeiros, especialmente `Money`, devem receber valor e moeda explicitamente.
- Renderers devem consumir view-models preparados para a tela; logica financeira nao deve ser duplicada na apresentacao.
- Novas features nao devem introduzir pos-processamento por regex/string sobre HTML final como padrao arquitetural.
- Pos-processadores existentes sao legado de migracao: permanecem cobertos ate a rota correspondente ser substituida por composicao estruturada.
- Estados de loading, vazio, erro, sucesso, indisponibilidade, permissao, teclado, foco, contraste e overflow devem fazer parte dos componentes/padroes quando aplicaveis.
- O gate SSR continua sendo preservado durante a transicao e deve evoluir junto com a nova composicao, sem criar janela sem cobertura.

A decisao arquitetural detalhada fica na ADR 0014.

## Arquetipos de tela

Novas telas e migracoes devem partir de um dos seguintes arquetipos, evitando reinventar estrutura por rota:

1. **Cockpit/dashboard**: situacao atual, mudanca, horizonte, alertas e acoes priorizadas.
2. **Listagem/extrato**: contexto financeiro, filtros, busca, agrupamento, ordenacao e acoes contextuais.
3. **Master-detail**: recurso principal, resumo, itens relacionados e painel/drawer de detalhe.
4. **Cadastro/configuracao**: formulario com disclosure progressivo e contexto preservado.
5. **Analise/relatorio**: conclusao/resumo, visualizacao, destaques e detalhe tabular.
6. **Revisao/inbox**: fila priorizada, evidencia, decisao e proximo item.

## Telas-piloto

### Dashboard

Deve evoluir de um conjunto de metricas para um cockpit de decisao que responda rapidamente:

- Como estou?
- O que mudou?
- O que vai acontecer?
- Preciso agir?

Elementos prioritarios: saldos por moeda, valor livre para gastar quando houver contrato financeiro valido, compromissos, horizonte de caixa, estado de orcamentos e no maximo os principais insights/alertas acionaveis.

### Extrato

Deve manter conta e moeda sempre claras, favorecer busca/filtros, agrupamento temporal e acoes contextuais, e aproximar-se da ergonomia esperada de internet banking sem perder rastreabilidade, recorrencias, parcelas e conciliacao.

### Cartoes de Credito

A hierarquia deve ficar explicita: **cartao -> fatura -> compras**. O topo deve priorizar fatura atual, fechamento, vencimento, limite/uso e acoes principais. Compra em cartao e pagamento da fatura devem possuir semantica financeira distinta para impedir dupla contabilizacao.

### Relatorios

A hierarquia deve ser **resumo/conclusao -> grafico/visualizacao -> destaques -> matriz/tabela detalhada**. Relatorios multi-moedas devem separar moedas por padrao; consolidacao convertida exige contrato de cambio explicito.

## Fase 3 - Integridade financeira e fundacao de interface

### Trilha A - Integridade financeira e multi-moedas

Prioridade mais alta. Corrigir semantica financeira que afeta saldos e gastos, estabelecer contrato de agregacao multi-moedas, formalizar datas e proteger invariantes com testes ponta a ponta.

Epica operacional: #589.

### Trilha B - Fundacao de interface

Criar design system operacional, componentes estruturais executaveis, primitiva `Money`, view-models e estrategia de retirada gradual dos pos-processadores de HTML.

Epica operacional: #590.

### Trilha C - Migracao das telas centrais

Migrar primeiro Dashboard, Extrato e Cartoes; usar o aprendizado dessas rotas para consolidar padroes antes de migrar Relatorios e demais superficies.

Epica operacional: #591.

## Fase 4 - Decisao financeira e previsibilidade

### Trilha A - Previsibilidade financeira e planejamento

Depois que o core financeiro e as telas-base estiverem estabilizados, consolidar compromissos futuros, projecao 30/60/90 dias, livre para gastar, orcamentos operacionais, recorrencias e insights priorizados.

Epica operacional: #592.

A Fase 4 reutiliza a semantica financeira da #589, as primitives/view-models da #590 e as superficies migradas da #591. Ela nao deve antecipar conversao cambial implicita nem criar recomendacao financeira regulada.

## Dependencias entre fases e trilhas

```text
Fase 3A - Integridade financeira + multi-moedas (#589)
             |
             +--------------------------+
             |                          |
             v                          v
Fase 3B - Fundacao de interface   Contratos financeiros corretos
             |                          |
             v                          |
Fase 3C - Migracao de telas <-----------+
             |
             v
Fase 4A - Previsibilidade e planejamento (#592)
```

A fundacao visual pode avancar em paralelo a correcoes de dominio, mas uma tela nao deve cristalizar um numero agregado cuja semantica financeira ou moeda ainda esteja indefinida.

## Backlog operacional

O backlog aberto no GitHub e a fonte de verdade do trabalho em execucao. O recorte criado para esta estrategia e:

- **#589 - Fase 3A: Integridade financeira e multi-moedas**
  - #593 a #599;
- **#590 - Fase 3B: Fundacao de interface e arquitetura UI**
  - #600 a #607;
- **#591 - Fase 3C: Migracao e redesign das telas centrais**
  - #608 a #615;
- **#592 - Fase 4A: Previsibilidade financeira e planejamento**
  - #616 a #621.

As epicas mantem checklists e dependencias detalhadas. Este documento nao replica criterios completos das issues para evitar duas fontes de verdade operacionais.

## Expansoes posteriores

Metas, reserva de emergencia, dividas, simulacao de quitacao, carteira de investimentos, patrimonio, Open Finance, especializacoes MEI/negocio e colaboracao familiar continuam relevantes, mas devem ser construidas sobre os contratos acima. Open Finance, em especial, nao deve anteceder a correcao das semanticas de saldo, liquidacao e multi-moedas.

## Criterios transversais de aceite

Toda issue desta estrategia deve, quando aplicavel:

- preservar isolamento por organizacao/perfil financeiro;
- explicitar moeda de entrada, calculo e saida;
- rejeitar ou separar agregacoes de moedas diferentes sem conversao;
- manter calculos financeiros deterministas fora de provider de IA e fora da apresentacao;
- preservar acessibilidade, teclado, foco, reflow e mobile;
- cobrir loading, vazio, erro e sucesso quando a interface for alterada;
- preferir cenarios de fluxo real a testes baseados apenas em transformacao textual de HTML;
- atualizar documentacao/ADR quando estabelecer novo precedente;
- evitar big-bang de frontend e manter o produto navegavel durante a migracao.

## Definicao de concluido da Fase 3

A Fase 3 estrutural pode ser considerada concluida quando:

1. nenhum resumo financeiro soma moedas diferentes sem conversao explicita;
2. compras de cartao e liquidacao de fatura nao geram dupla despesa/saldo incorreto;
3. existe uma fundacao visual executavel e reutilizada pelas telas centrais;
4. novos fluxos nao dependem de regex/string sobre HTML final como mecanismo normal de composicao;
5. Dashboard, Extrato e Cartoes usam os novos padroes e preservam cobertura visual/acessivel;
6. Relatorios e demais superficies prioritarias apresentam hierarquia consistente e moeda explicita;
7. a documentacao viva e as issues representam o estado real da migracao.

## Definicao de concluido da Fase 4A

A primeira trilha da Fase 4 pode ser considerada concluida quando:

1. existe uma fonte canonica de compromissos futuros sem dupla contagem;
2. existe projecao 30/60/90 dias verificavel e separada por moeda;
3. o valor livre para gastar possui formula deterministica e drilldown;
4. orcamentos distinguem realizado, comprometido, disponivel e projetado;
5. recorrencias futuras sao acionaveis dentro das jornadas existentes;
6. insights priorizados possuem ciclo de vida e evidencia navegavel.

## Governanca

- `docs/PRODUCT.md` continua dono da visao de produto e das fases.
- `docs/ARCHITECTURE.md` continua dono da arquitetura observada e das regras tecnicas gerais.
- `docs/DESIGN_SYSTEM.md` continua dono das regras visuais executaveis.
- `docs/APP_SHELL.md` continua dono do shell e do contrato SSR atual durante a transicao.
- ADR 0013 registra a decisao multi-moedas.
- ADR 0014 registra a estrategia de migracao da interface.
- Issues e epicas no GitHub sao a fonte de verdade do trabalho aberto.
