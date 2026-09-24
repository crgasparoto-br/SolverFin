# Estrategia de evolucao do SolverFin

## Objetivo

Este documento define a direcao de evolucao do SolverFin a partir do baseline atual. Ele nao declara funcionalidades futuras como implementadas; separa explicitamente o estado observado do produto da arquitetura-alvo e da ordem de entrega.

As issues abertas no GitHub continuam sendo a fonte de verdade operacional do planejamento. Este documento registra os principios, dependencias e criterios que devem orientar essas issues. As fases futuras descritas aqui so se tornam backlog operacional quando ganham epica/issue propria.

## Decisoes de direcao

1. O SolverFin e um sistema **multi-moedas**. Moeda nao e apenas formatacao de tela: faz parte do contrato financeiro, de persistencia, agregacao, filtros, relatorios, projecoes e assistente.
2. Nenhum agregado financeiro pode somar valores de moedas diferentes silenciosamente.
3. Consolidacao entre moedas somente pode existir quando houver politica explicita de conversao, moeda de referencia e metadados da cotacao usada.
4. A qualidade visual deve ser corrigida na arquitetura da interface, e nao por uma sequencia indefinida de ajustes locais de CSS ou pos-processamentos de HTML.
5. A migracao da interface sera incremental. O SSR, acessibilidade, responsividade e gates visuais atuais devem permanecer protegidos enquanto cada rota migra.
6. Nao ha decisao de adotar React, Vue, Svelte ou outro framework neste ciclo. Componentizacao, view-models e contratos de interface devem melhorar independentemente dessa escolha futura.
7. Regras e calculos financeiros permanecem fora da camada de apresentacao. A UI recebe modelos preparados e nao redefine semantica contabil, moeda, saldo ou fatura.
8. Novos canais de entrada devem reutilizar normalizacao, deduplicacao, conciliacao, consentimento e revisao existentes; Open Finance, PDF, XLSX, WhatsApp e API nao criam motores financeiros paralelos.
9. Profundidade analitica deve vir de uma fundacao generica de rateio e dimensoes antes de modulos isolados por persona.
10. Colaboracao deve evoluir por membros, papeis e menor privilegio, preservando isolamento entre organizacoes e perfis financeiros.
11. Capacidades empresariais devem permanecer gerenciais por padrao; folha, estoque, emissao fiscal completa e contabilidade legal exigem decisoes independentes e nao sao consequencia automatica do roadmap.
12. Investimentos e patrimonio so devem expandir depois que captura, integridade, previsibilidade e autorizacao estiverem maduros; nenhum portfolio autoriza recomendacao regulada por IA.

## Estado atual que motiva a estrategia

O baseline atual possui boa cobertura funcional, tenant/perfil financeiro, persistencia real, testes, acessibilidade e validacao visual. Ao mesmo tempo, a camada web acumulou renderers extensos, CSS especifico por pagina e pos-processadores de HTML ligados ao despacho HTTP. Esse desenho foi util para evoluir o MVP, mas aumenta o custo de manter hierarquia visual, responsividade e consistencia entre telas.

No dominio financeiro, entidades ja possuem moeda em diferentes contratos, e relatorios ja preservam separacao por moeda em alguns fluxos. Entretanto, qualquer resumo, saldo, insight ou projecao que exponha um unico numero precisa provar que os valores pertencem a uma mesma moeda ou que houve conversao explicita.

O produto ja possui Inbox, importacao revisavel, deduplicacao, conciliacao, regras, auditoria e assistente somente leitura. Essa fundacao permite planejar automacao de entrada mais ampla sem abrir mao de rastreabilidade. Por outro lado, o modelo operacional ainda e centrado em uma categoria por lancamento e em um owner por perfil, o que limita rateio, analise por projeto/cliente/centro e colaboracao. Essas lacunas devem ser resolvidas antes de aprofundar gestao empresarial.

## Invariantes multi-moedas

- Todo valor monetario deve possuir moeda conhecida no boundary em que e persistido, calculado ou exibido.
- A moeda deve usar identificador canonico compativel com ISO 4217 quando aplicavel.
- Operacoes aritmeticas entre moedas diferentes sao invalidas sem uma etapa explicita de conversao.
- Agregacoes padrao devem ser particionadas por moeda.
- Uma moeda de referencia do perfil pode ser introduzida por issue propria, mas nao autoriza conversao implicita.
- Quando houver conversao, a resposta deve manter moeda de origem, moeda de destino, taxa, instante/data de referencia e origem da cotacao suficientes para auditoria e reproducao.
- Uma transferencia entre contas de moedas diferentes deve preservar os dois valores nativos como efeitos vinculados da mesma operacao; ela nao pode reutilizar um unico valor em duas moedas nem ser simulada como receita/despesa.
- Dashboard, relatorios, orcamentos, metas, projecoes, insights e assistente devem preservar a moeda do calculo e nunca rotular como BRL um agregado misto.
- Testes devem incluir perfis com pelo menos duas moedas para impedir regressao de somas cruzadas.

A decisao arquitetural detalhada fica na ADR 0013. O contrato operacional de transferencia cross-currency e evoluido pela issue #668 sem introduzir provider de cambio.

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

Epica operacional original: #589.

A issue #668 implementa a extensão posterior dessa integridade para transferencias entre contas de moedas diferentes com dois valores nativos vinculados à mesma identidade. Ela permanece o contrato financeiro que a agenda/projecao da Fase 4A deve reutilizar.

### Trilha B - Fundacao de interface

Criar design system operacional, componentes estruturais executaveis, primitiva `Money`, view-models e estrategia de retirada gradual dos pos-processadores de HTML.

Epica operacional: #590.

### Trilha C - Migracao das telas centrais

Migrar primeiro Dashboard, Extrato e Cartoes; usar o aprendizado dessas rotas para consolidar padroes antes de migrar Relatorios e demais superficies.

Estado observado: `/orcamentos` foi migrada pela #613 para a fundacao compartilhada, com `Money` e view-model explicitos e acompanhamento de planejado x realizado por categoria, periodo e moeda. Os estados `committed`, `projected`, `available` e `overBudget`, assim como o bucket `Sem categoria`, permanecem fora desse recorte e continuam pertencendo a #619.

Epica operacional: #591.

## Fase 4A - Previsibilidade financeira e planejamento

Depois que o core financeiro e as telas-base estiverem estabilizados, consolidar compromissos futuros, projecao 30/60/90 dias, livre para gastar, orcamentos operacionais, recorrencias e insights priorizados.

A #616 estabelece a agenda backend canonica em `GET /api/future-commitments`, com identidade logica separada de efeitos monetarios e precedencia entre `Transaction`, `Invoice`, projecoes de `Recurrence` e fallback legado. #617, #619 e consumidores de Dashboard devem reutilizar essa fronteira em vez de reconstruir compromissos.

Epica operacional: #592.

A Fase 4A reutiliza a semantica financeira da #589, as primitives/view-models da #590 e as superficies migradas da #591. Ela nao deve antecipar conversao cambial implicita nem criar recomendacao financeira regulada.

Com a representação de #668, uma transferencia `planned` cross-currency mantém uma única identidade com dois efeitos nativos. #616 deve consumir essa identidade na agenda; #617 aplica cada efeito somente à série da respectiva moeda; #618 deriva o valor livre dessas séries. Orcamentos continuam tratando transferencia como movimento de caixa, nao consumo economico.

A conclusao da #592 permanece a prioridade funcional atual. As fases competitivas posteriores nao devem interromper essa cadeia nem antecipar contratos que #616-#621 ainda precisam estabelecer.

## Fase 4B - Automacao de entrada e conectividade

Objetivo: reduzir o trabalho manual para obter e transportar dados ao SolverFin sem criar caminhos financeiros alternativos.

### Ordem recomendada

1. **Open Finance read-only via parceiro/agregador**: escolher fornecedor por ADR e estudo comparativo de cobertura, custo, sandbox, consentimento, refresh/webhooks, qualidade e SLA. Tokens e payloads brutos permanecem fora do dominio financeiro puro.
2. **PDF e XLSX**: adicionar parsers homologados para extratos/faturas e planilhas, convergindo para o mesmo preview, lote, deduplicacao, conciliacao, revisao e auditoria de CSV/OFX.
3. **Anexos na jornada operacional**: expor a fundacao `Attachment` para comprovantes, recibos, faturas, extratos e contratos, com retencao e mascaramento apropriados.
4. **Exportacoes**: CSV, XLSX e PDF reproduziveis a partir de filtros, periodo e moeda conhecidos.
5. **Notificacoes**: fundacao de entrega in-app/push/e-mail para eventos deterministas, sem provider de IA decidir severidade financeira.
6. **WhatsApp**: iniciar por consulta e captura; depois permitir intencoes que produzam propostas revisaveis. O assistente canonico continua read-only e nenhuma mutacao irreversivel ocorre sem confirmacao/contrato explicito.

### Invariantes

- Todo dado importado passa por identidade, normalizacao e deduplicacao antes de gerar efeito financeiro.
- Open Finance nao dispensa isolamento por perfil nem consentimento especifico/revogavel.
- Falha de parceiro preserva CSV/OFX/inbox como fallback.
- Um canal externo nunca recebe permissao maior do que o contexto autenticado e o escopo concedido.
- A escolha do fornecedor nao pode vazar para contratos de dominio; adapters devem ser substituiveis.

## Fase 4C - Dimensoes analiticas e colaboracao

Objetivo: criar uma representacao analitica reutilizavel para pessoa, familia, MEI e pequeno negocio antes de construir relatorios empresariais profundos.

### Fundacao de rateio

- Um fato financeiro continua possuindo uma unica identidade e um unico valor monetario canonico.
- Rateios podem distribuir esse valor entre categorias/alocacoes, mas a soma deve ser exatamente igual ao valor do fato na mesma moeda.
- O cabecalho e as alocacoes nao podem ser somados como eventos independentes.
- Migracao deve preservar lancamentos atuais com uma categoria como caso simples de uma unica alocacao, quando o contrato escolhido assim definir.

### Dimensoes reutilizaveis

Introduzir de forma incremental:

- tags;
- centros para custo/lucro ou recortes pessoais equivalentes;
- projetos com periodo/status e orcamento opcional quando houver contrato;
- contatos/contrapartes com papeis como cliente, fornecedor ou ambos;
- filtros e relatorios por dimensao, conta, cartao, instrumento e responsavel.

Evitar criar tabelas/fluxos diferentes para cada persona quando o mesmo conceito analitico puder ser compartilhado.

### Colaboracao

- Introduzir membros de organizacao/perfil com papeis claros, inicialmente um conjunto pequeno como owner/admin/editor/viewer.
- Autorizacao deve ser deny-by-default fora dos recursos explicitamente compartilhados.
- Usuario adicional nao implica acesso automatico a todos os perfis da organizacao.
- Historico/auditoria identifica o ator que criou, revisou ou alterou o fato.
- Instrumentos de cartao ja existentes podem sustentar analise de gastos por titular/instrumento sem quebrar a fatura unica do agrupador.

## Fase 4D - Metas, reservas e rotina financeira

Objetivo: transformar previsibilidade em acompanhamento continuo e acionavel.

Capacidades prioritarias:

- metas e reservas com valor alvo, prazo, progresso e moeda explicita;
- reservas protegidas somente afetam indicadores como `freeToSpend` quando houver contrato deliberado e configuracao do usuario;
- dividas e simulacoes de quitacao deterministicas, sem recomendacao regulada;
- deteccao de assinaturas/servicos recorrentes com evidencia, correcao e supressao de falsos positivos;
- fechamento mensal/retrospectiva com receitas, despesas, variacoes, faturas, orcamentos, compromissos e destaques verificaveis;
- notificacoes para vencimentos, fechamento de fatura, limites/orcamentos, risco de saldo e consentimentos expirando;
- metas compartilhadas quando a autorizacao da Fase 4C estiver disponivel.

A Fase 4D deve reutilizar #617-#621 para horizonte e evidencia; ela nao cria uma segunda projecao financeira.

## Fase 5 - Gestao empresarial e MEI

Objetivo: aprofundar analise profissional com semantica gerencial clara, mantendo o SolverFin abaixo da complexidade de um ERP completo.

### Capacidades

- visoes por regime de caixa e competencia baseadas nos contratos de datas canonicos;
- DRE gerencial deterministica;
- DFC deterministica;
- posicao patrimonial/balanco gerencial apenas quando ativos/passivos estiverem modelados com dados suficientes;
- KPIs documentados e drilldown, incluindo ponto de equilibrio quando entradas necessarias estiverem definidas;
- planejamento por cenarios, separando claramente base, otimista/conservador e realizado;
- resultado/margem por cliente, projeto, centro e demais dimensoes;
- exportacoes e pacotes para contador;
- relatorios essenciais para MEI/autonomo;
- avaliacao de integracoes contabeis e artefatos como Carne-Leao em issues proprias com revisao fiscal/juridica.

### Limites

- nao antecipar folha, estoque, emissao fiscal completa ou contabilidade oficial;
- nao rotular relatorio gerencial como demonstracao contabil legal sem requisitos proprios;
- calculos permanecem deterministas e multi-moedas seguem ADR 0013.

## Fase 6 - Patrimonio e investimentos

Objetivo: oferecer visao patrimonial e de carteira somente depois que o core de captura/analise estiver estavel.

Capacidades candidatas:

- ativos e passivos por classe e moeda;
- posicoes de investimento e historico de movimentacoes;
- dados de investimento vindos de Open Finance quando o parceiro contratado os suportar com qualidade;
- indices e benchmarks com fonte/data auditaveis;
- eventos corporativos;
- importacao de notas de corretagem;
- relatorios de rentabilidade e patrimonio com formulas documentadas;
- suporte fiscal/IR apenas em escopo dedicado e validado.

Ficam proibidos como consequencia implicita desta fase: recomendacao de compra/venda, suitability, credito ou aconselhamento regulado.

## Fase 7 - Plataforma e ecossistema

Objetivo: abrir contratos do SolverFin sem reduzir seguranca ou criar acoplamento irreversivel.

Capacidades candidatas:

- API publica versionada com scopes, rate limits, idempotencia quando aplicavel e auditoria;
- MCP inicialmente somente leitura, respeitando tenant/perfil e os mesmos limites do assistente;
- adapters para integracoes externas e contabeis;
- aplicativo nativo e widgets apenas se a PWA demonstrar limitacao real de distribuicao/experiencia;
- gamificacao, missoes e streaks somente como experimento opcional de retencao, sem bloquear ou distorcer rotinas financeiras.

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
             |                          |
             |                    #668 - transferencias cross-currency
             |                          |
             +--------------------------+
                         |
                         v
Fase 4A - Previsibilidade e planejamento (#592)
                         |
                         v
Fase 4B - Automacao de entrada e conectividade
                         |
             +-----------+-----------+
             |                       |
             v                       v
Fase 4C - Dimensoes            Fase 4D - Metas/rotina
  e colaboracao                      |
             |                       |
             v                       |
Fase 5 - Gestao empresarial          |
             |                       |
             +-----------+-----------+
                         |
                         v
Fase 6 - Patrimonio e investimentos
                         |
                         v
Fase 7 - Plataforma e ecossistema
```

A fundacao visual pode avancar em paralelo a correcoes de dominio, mas uma tela nao deve cristalizar um numero agregado cuja semantica financeira ou moeda ainda esteja indefinida.

Depois da Fase 4A, trabalhos de baixo acoplamento da 4B, como exportacoes ou exposicao de anexos existentes, podem ser antecipados por issue propria se nao desviarem a cadeia financeira critica. Fases 4C e 4D podem avancar parcialmente em paralelo depois da 4B; a Fase 5 depende principalmente da fundacao analitica da 4C, e a Fase 6 se beneficia da conectividade da 4B e dos objetivos/patrimonio da 4D.

## Backlog operacional

O backlog aberto no GitHub e a fonte de verdade do trabalho em execucao. O recorte operacional atual e:

- **#589 - Fase 3A: Integridade financeira e multi-moedas**
  - #593 a #599 (concluidas no ciclo original);
  - #668 como extensao posterior para transferencia cross-currency;
- **#590 - Fase 3B: Fundacao de interface e arquitetura UI**
  - #600 a #607;
- **#591 - Fase 3C: Migracao e redesign das telas centrais**
  - #608 a #615;
- **#592 - Fase 4A: Previsibilidade financeira e planejamento**
  - pre-requisito: #668 antes de #616/#617;
  - #616 a #621.

Ordem estrutural da cadeia financeira da Fase 4A:

```text
#668 -> #616 -> #617 -> #618
                 |       |
                 +-----> #619 (tambem depende de #613)
                 |
                 +-----> #620
#617 ------------------> #621 (alem das decisoes de produto proprias da #621)
```

As epicas mantem checklists e dependencias detalhadas. Este documento nao replica criterios completos das issues para evitar duas fontes de verdade operacionais.

As Fases 4B, 4C, 4D, 5, 6 e 7 **ainda nao sao backlog operacional por simples presenca neste documento**. Antes de iniciar uma delas, criar epica e subissues proporcionais ao risco, fechar decisoes de produto bloqueantes e criar/atualizar ADRs quando houver provider, modelo persistente, autorizacao ou contrato publico novo.

## Priorizacao das melhorias competitivas

A ordem acima aplica tres filtros antes de promover uma capacidade:

1. **Valor imediato para o usuario:** reduzir entrada manual e melhorar decisao vem antes de amplitudes como carteira completa de investimentos.
2. **Reuso da arquitetura existente:** novas entradas reutilizam Inbox/importacao/revisao; novas analises reutilizam dimensoes; novos canais reutilizam autorizacao e auditoria.
3. **Custo de irreversibilidade:** mudancas de modelo, autorizacao, provider externo ou contrato publico exigem ADR e testes discriminantes antes de virar dependencia de outras fases.

Consequentemente:

- Open Finance, PDF/XLSX, exportacoes e notificacoes possuem prioridade alta depois da #592;
- rateio/dimensoes e colaboracao sao fundacao obrigatoria antes de DRE/DFC e analise empresarial profunda;
- metas, reservas, assinaturas e fechamento mensal reutilizam previsibilidade em vez de criarem motor paralelo;
- investimentos amplos, app nativo e gamificacao permanecem posteriores por custo/escopo e menor urgencia para o core.

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
- evitar big-bang de frontend e manter o produto navegavel durante a migracao;
- para integracoes externas, provar consentimento, revogacao, retry/fallback, minimizacao e observabilidade segura;
- para rateio/dimensoes, provar ausencia de dupla contabilizacao e preservacao exata do valor/moeda;
- para colaboracao, provar autorizacao negativa entre perfis/usuarios nao permitidos;
- para canais conversacionais, manter correlacao, idempotencia e confirmacao quando houver mutacao proposta.

## Definicao de concluido da Fase 3

A Fase 3 estrutural pode ser considerada concluida quando:

1. nenhum resumo financeiro soma moedas diferentes sem conversao explicita;
2. compras de cartao e liquidacao de fatura nao geram dupla despesa/saldo incorreto;
3. existe uma fundacao visual executavel e reutilizada pelas telas centrais;
4. novos fluxos nao dependem de regex/string sobre HTML final como mecanismo normal de composicao;
5. Dashboard, Extrato e Cartoes usam os novos padroes e preservam cobertura visual/acessivel;
6. Relatorios e demais superficies prioritarias apresentam hierarquia consistente e moeda explicita;
7. a documentacao viva e as issues representam o estado real da migracao.

A extensão #668 complementa o ciclo original da Fase 3 sem reabrir a épica #589 e passa a integrar a base de integridade reutilizada pela cadeia financeira da Fase 4A.

## Definicao de concluido da Fase 4A

A primeira trilha da Fase 4 pode ser considerada concluida quando:

1. transferencias cross-currency planejadas preservam a identidade e os dois efeitos nativos definidos por #668, sem conversao implicita;
2. existe uma fonte canonica de compromissos futuros sem dupla contagem;
3. existe projecao 30/60/90 dias verificavel e separada por moeda;
4. o valor livre para gastar possui formula deterministica e drilldown;
5. orcamentos distinguem realizado, comprometido, disponivel e projetado;
6. recorrencias futuras sao acionaveis dentro das jornadas existentes;
7. insights priorizados possuem ciclo de vida e evidencia navegavel.

## Gates para iniciar fases posteriores

### Fase 4B

- #592 concluida ou dependencias da capacidade antecipada explicitamente independentes;
- ADR de Open Finance antes de selecionar provider/producao;
- pipeline de importacao/revisao permanece fonte unica de normalizacao financeira.

### Fase 4C

- contrato de rateio e identidade financeira aprovado antes de migrar schema;
- autorizacao de colaboracao definida antes de compartilhar perfis;
- estrategia de compatibilidade para lancamentos existentes.

### Fase 4D

- #617/#618 disponiveis para qualquer indicador que use horizonte/livre para gastar;
- fundacao de notificacao disponivel para canais externos quando a feature depender deles;
- metas/reservas nao alteram caixa sem contrato explicito.

### Fase 5

- dimensoes da 4C suficientes para cliente/projeto/centro;
- definicao documentada de caixa versus competencia;
- limite entre relatorio gerencial e obrigacao contabil/fiscal explicito.

### Fase 6

- modelo patrimonial aprovado por ADR/issue propria;
- qualquer dado externo de investimento preserva fonte, data e moeda;
- nenhuma recomendacao regulada e inferida da existencia da carteira.

### Fase 7

- contratos publicos versionados e autorizacao madura;
- API/MCP com scopes e auditoria;
- app nativo somente mediante evidencia de necessidade alem da PWA.

## Governanca

- `docs/PRODUCT.md` continua dono da visao de produto e das fases.
- `docs/ARCHITECTURE.md` continua dono da arquitetura observada e das regras tecnicas gerais.
- `docs/DESIGN_SYSTEM.md` continua dono das regras visuais executaveis.
- `docs/APP_SHELL.md` continua dono do shell e do contrato SSR atual durante a transicao.
- `docs/integrations/open-finance.md` permanece como estudo tecnico de referencia; uma decisao de provider/producao exige ADR atualizada na Fase 4B.
- ADR 0013 registra a decisao multi-moedas.
- ADR 0014 registra a estrategia de migracao da interface.
- Issues e epicas no GitHub sao a fonte de verdade do trabalho aberto.
