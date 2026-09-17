# Produto - SolverFin

## Visao

SolverFin e um controle financeiro inteligente para transformar dados dispersos em organizacao, previsibilidade e decisoes acionaveis.

O produto deve atender pessoas, familias, MEIs, profissionais autonomos e pequenos negocios que precisam acompanhar entradas, saidas, contas, cartoes, vencimentos, categorias, metas e fluxo financeiro sem depender de lancamento manual excessivo.

O SolverFin e multi-moedas. Valores, saldos, relatorios e projecoes devem preservar a moeda nativa; consolidacoes entre moedas somente podem existir com conversao explicita, auditavel e compreensivel para o usuario.

## Proposta de valor

- Reduzir esforco manual por importacoes, regras, deduplicacao, conciliacao e IA explicavel.
- Dar clareza sobre saldo, gastos, receitas, proximos vencimentos e compromissos financeiros.
- Apoiar uso pessoal e profissional sem misturar contextos.
- Apoiar multiplas moedas sem produzir totais silenciosamente incorretos.
- Transformar o dashboard e as telas operacionais em superficies de decisao, nao apenas cadastros e listas.
- Manter o usuario no controle de sugestoes e automacoes.
- Proteger dados financeiros por padrao, com consentimento e rastreabilidade.
- Evoluir da captura de dados para analise e decisao sem criar silos paralelos por canal, formato ou persona.

## Publico-alvo

### Pessoa fisica organizada

Quer entender para onde o dinheiro vai, acompanhar gastos recorrentes e evitar surpresas no fim do mes.

### Familia ou casal

Precisa dividir visoes por conta, cartao, categoria e responsabilidade, mantendo privacidade e clareza.

### MEI

Precisa separar receitas pessoais e profissionais, acompanhar limite de faturamento, despesas, contas a receber e informacoes uteis para contador.

### Profissional autonomo

Precisa registrar receitas por atendimento, servico ou cliente, controlar custos, vencimentos e previsibilidade mensal.

### Pequeno negocio

Precisa de uma visao simples de fluxo financeiro, contas, recebiveis, categorias e pendencias sem complexidade de ERP.

## Jornadas principais do MVP

### Organizar base financeira

O usuario cria contas, cartoes, categorias, contexto financeiro e preferencias basicas para separar vida pessoal, familia, MEI ou negocio.

A area **Contas e Cartoes** e o cadastro mestre de instrumentos financeiros. Ela concentra contas bancarias, dinheiro, aplicacoes, contas de pagamento e cartoes usados nos lancamentos.

Para cartoes de credito, o cadastro mestre usa o modelo de **cartao agrupador/fatura** com **instrumentos internos**. O agrupador representa o contrato e a fatura; os instrumentos representam os meios de uso, como fisico titular, virtual titular, fisico adicional e virtual adicional. O documento `docs/CARDS.md` e a referencia de produto/tecnica para esse modelo.

A area **Cartoes** fica reservada para a rotina operacional: compras, faturas, fechamento e pagamento de cartao. Cadastro de novos cartoes nao deve ser a acao principal dessa area.

No MVP local, `/contas-cartoes` e a rota do cadastro mestre de contas e cartoes. A rota `/cartoes` permanece dedicada a rotina operacional de compras e faturas.

### Registrar e revisar movimentacoes

O usuario registra receitas, despesas e transferencias manualmente ou por importacao. Sugestoes automaticas ficam pendentes de revisao quando houver incerteza.

### Importar e conciliar

O usuario importa CSV/OFX ou cola textos de mensagens bancarias. SolverFin normaliza dados, identifica possiveis duplicidades e sugere conciliacao com lancamentos previstos.

### Acompanhar rotina mensal

O usuario acompanha saldo, proximos vencimentos, faturas, lancamentos previstos, orcamentos, metas e alertas basicos. Compromissos de conta corrente ficam no **Extrato da conta**; compromissos de cartao ficam em **Cartoes de Credito**.

Quando um perfil operar em mais de uma moeda, a experiencia deve deixar a moeda do saldo, compromisso, fatura, orcamento e total sempre explicita. Na ausencia de conversao cambial contratada, os totais permanecem separados por moeda.

### Usar IA com controle

O usuario recebe sugestoes de extracao, classificacao, conciliacao e insights, sempre com explicacao, origem e estado de revisao.

O usuario tambem pode usar o **Assistente financeiro** (`/assistente`) para fazer consultas somente leitura sobre o perfil financeiro ativo. O assistente resolve periodo, moeda e filtros antes de responder, usa calculos deterministas do backend como fonte dos valores e apresenta periodo, filtros, premissas, fontes internas, limitacoes e confianca. Quando o provider de IA esta habilitado e existe consentimento ativo, ele pode retornar somente a diretiva fechada `DIRECT` ou `CONTEXTUAL`; o backend aplica apenas copy controlada pelo SolverFin, sem incorporar texto livre do provider. O assistente nao cria, edita, exclui, concilia, paga ou aprova registros financeiros e nao oferece recomendacao profissional de investimento, credito, juridica, fiscal ou contabil.

## Principios de produto

- **Clareza antes de automacao:** uma automacao so e boa se o usuario entende e consegue revisar.
- **Privacidade por padrao:** dados financeiros sao sensiveis e devem ser minimizados, protegidos e auditaveis.
- **Separacao de contextos:** pessoal, familia, MEI e negocio nao devem se misturar sem acao explicita.
- **Multi-moedas por contrato:** moeda acompanha o valor em todo o fluxo; agregacoes entre moedas diferentes exigem conversao explicita.
- **IA como assistente:** IA sugere, explica e acelera; nao deve tomar decisoes irreversiveis sozinha.
- **Entrada unica, canais multiplos:** arquivo, Open Finance, mensagem, WhatsApp ou API devem convergir para contratos normalizados, deduplicacao, conciliacao e revisao comuns, em vez de criar motores financeiros paralelos.
- **Dimensoes antes de modulos paralelos:** categoria, rateio, centro, projeto, contato e tags devem formar uma base analitica reutilizavel para pessoa, familia, MEI e negocio.
- **Colaboracao com menor privilegio:** acesso compartilhado deve ser explicito por organizacao/perfil e permitir evolucao de papeis e permissoes sem quebrar isolamento.
- **Gestao empresarial sem virar ERP:** oferecer analise gerencial, planejamento e exportacoes uteis sem antecipar folha, estoque, fiscal ou contabilidade legal completa.
- **Rotina mobile-first:** fluxos diarios devem funcionar bem no celular.
- **MVP pragmatico:** priorizar controle financeiro essencial antes de integracoes sofisticadas.
- **Interface enxuta:** telas devem priorizar dados, acoes e revisao, evitando textos longos e cards explicativos desnecessarios.
- **Hierarquia para decisao:** telas financeiras devem destacar situacao, mudanca, horizonte e acao antes do detalhe bruto.
- **Consistencia antes de customizacao local:** componentes e padroes reutilizaveis devem prevalecer sobre layouts inventados por rota.
- **CRUD rapido:** cadastros e edicoes devem usar pop-up/modal sempre que possivel, mantendo o usuario na tela atual.

## Escopo MVP

O MVP deve permitir:

- cadastro e manutencao de contas financeiras e cartoes em **Contas e Cartoes**;
- categorias e subcategorias;
- receitas, despesas e transferencias;
- recorrencias e parcelamentos;
- rotina operacional de cartoes de credito e faturas em **Cartoes**;
- compromissos financeiros futuros em **Extrato da conta** e **Cartoes de Credito**, sem tela dedicada de contas a pagar/receber;
- orcamentos, metas e alertas basicos;
- importacao inicial por CSV/OFX;
- inbox para textos de mensagens bancarias coladas ou compartilhadas;
- deduplicacao e conciliacao entre previsto, importado e realizado;
- regras automaticas configuraveis;
- sugestoes de IA revisaveis para extracao, classificacao e insights;
- assistente financeiro conversacional somente leitura, persistente e isolado por perfil financeiro;
- dashboard e relatorios iniciais;
- separacao por usuario, tenant ou perfil financeiro;
- preservacao de moeda em valores e separacao de agregados multi-moedas quando nao houver conversao explicita;
- consentimento, auditoria e mascaramento de dados sensiveis.

## Fases de evolucao

### Fase 1 - Core financeiro

Implementar dominio, persistencia, autenticacao, multi-tenant, APIs essenciais e PWA com fluxos principais.

### Fase 2 - Automacao e IA aplicada

Evoluir importacao, deduplicacao, conciliacao, inbox, regras automaticas, schemas de IA, fila de revisao e consultas conversacionais somente leitura.

O baseline desta fase esta consolidado em `docs/STATUS_MATRIX.md`.

### Fase 3 - Integridade financeira, multi-moedas e fundacao de interface

Priorizar a corretude do modelo financeiro e a qualidade estrutural da experiencia antes de ampliar fortemente o escopo funcional:

1. corrigir semantica de compra de cartao, liquidacao de fatura e saldo disponivel para impedir dupla contabilizacao;
2. tornar multi-moedas um contrato ponta a ponta, sem agregacao implicita;
3. formalizar datas financeiras e invariantes de calculo relevantes;
4. criar design system operacional, componentes estruturais e view-models;
5. retirar gradualmente pos-processamentos textuais de HTML como mecanismo normal de composicao;
6. migrar Dashboard, Extrato e Cartoes como telas-piloto;
7. consolidar Relatorios e demais superficies sobre os novos padroes.

O plano detalhado fica em `docs/EVOLUTION_STRATEGY.md`, com ADRs 0013 e 0014.

### Fase 4A - Previsibilidade financeira e planejamento

Concluir a trilha operacional ja organizada na epica #592, sem interrompe-la por expansoes competitivas posteriores:

- consolidar compromissos futuros;
- oferecer projecao 30/60/90 dias;
- calcular valor realmente livre para gastar por moeda/contrato valido;
- tornar orcamentos operacionais e recorrencias mais acionaveis;
- priorizar insights e alertas com evidencia navegavel.

A Fase 4A continua sendo a prioridade funcional imediata depois dos pre-requisitos da Fase 3 e da extensao cross-currency #668.

### Fase 4B - Automacao de entrada e conectividade

Reduzir radicalmente o esforco de alimentar o SolverFin, reaproveitando a Inbox e os motores de revisao existentes:

- avaliar e implementar Open Finance **somente leitura** via parceiro/agregador, com ADR, consentimento, revogacao, observabilidade e fallback manual;
- comparar provedores por cobertura, qualidade dos dados, custo, sandbox, webhooks, renovacao de consentimento e SLA, sem fixar fornecedor no roadmap;
- adicionar importacao de PDF e XLSX, inclusive extratos e faturas quando houver parser homologado, usando o mesmo pipeline de preview, normalizacao, deduplicacao, conciliacao e revisao;
- tornar anexos existentes acessiveis nas jornadas operacionais para comprovantes, faturas, extratos, recibos e contratos;
- oferecer exportacoes CSV, XLSX e PDF com filtros e moeda reproduziveis;
- criar fundacao de notificacoes in-app/push/e-mail para eventos financeiros deterministas;
- introduzir WhatsApp em etapas: primeiro consulta/captura; depois propostas revisaveis; nenhuma mutacao financeira irreversivel ocorre sem confirmacao e contrato proprio.

O Assistente financeiro atual permanece somente leitura. Canais externos que capturem uma intencao de alteracao devem produzir proposta/revisao pelo contrato apropriado, nao transformar o assistente em executor silencioso.

### Fase 4C - Dimensoes analiticas e colaboracao

Criar a fundacao analitica que permite aumentar profundidade sem multiplicar modulos por persona:

- suportar rateio de um lancamento em mais de uma categoria/alocacao, preservando a soma exata do valor e a moeda;
- criar dimensoes reutilizaveis para tags, centros, projetos e contatos;
- tratar clientes e fornecedores como papeis de um cadastro de contato/contraparte reutilizavel;
- permitir relatorios e filtros por categoria, centro, projeto, contato, tag, conta, cartao, instrumento e responsavel;
- evoluir organizacao/perfil para membros adicionais com papeis e permissoes explicitas, inicialmente em modelo simples como owner/admin/editor/viewer;
- permitir acesso compartilhado familiar e empresarial sem misturar perfis nao autorizados;
- aproveitar instrumentos de cartao para analises por titular/instrumento, preservando a fatura unica do agrupador.

Qualquer modelo de rateio deve manter uma unica identidade financeira do lancamento e impedir dupla contabilizacao entre cabecalho e alocacoes.

### Fase 4D - Metas, reservas e rotina financeira

Sobre a previsibilidade da Fase 4A e os canais da Fase 4B:

- criar dominio explicito de metas e reservas, sem desconto implicito de caixa antes da configuracao do usuario;
- permitir metas pessoais, familiares e de negocio com valor alvo, prazo e progresso;
- evoluir dividas e simulacao de quitacao sem transformar simulacao em recomendacao regulada;
- detectar assinaturas/servicos recorrentes a partir de recorrencias e dados importados, sempre com evidencia e possibilidade de correcao;
- criar fechamento mensal/retrospectiva com receitas, despesas, variacoes, faturas, orcamentos, compromissos e destaques deterministas;
- usar a fundacao de notificacoes para vencimentos, fechamento de fatura, limite/orcamento, saldo projetado e consentimentos expirando;
- permitir objetivos compartilhados quando o modelo de colaboracao da Fase 4C estiver disponivel.

### Fase 5 - Gestao empresarial e MEI

Aprofundar o uso profissional sem transformar o SolverFin em ERP ou sistema contabil legal completo:

- oferecer visoes gerenciais por regime de caixa e competencia sobre os contratos de datas existentes;
- criar DRE gerencial e DFC deterministicas;
- oferecer posicao patrimonial/balanco gerencial somente quando o modelo de ativos e passivos suportar o calculo sem aproximacoes silenciosas;
- criar KPIs e ponto de equilibrio com formulas documentadas e drilldown;
- permitir planejamento por cenarios, por exemplo base/otimista/conservador, separado do realizado;
- analisar resultado e margem por cliente, projeto, centro e outras dimensoes da Fase 4C;
- oferecer exportacoes para contador e relatorios essenciais de MEI/autonomo;
- avaliar integracoes contabeis e artefatos como Carne-Leao somente em issues proprias, com revisao fiscal/juridica adequada.

Folha, estoque, emissao fiscal completa e contabilidade oficial permanecem fora do escopo padrao.

### Fase 6 - Patrimonio e investimentos

Expandir para patrimonio somente depois que captura, dimensoes e previsibilidade estiverem maduras:

- consolidar patrimonio por classe de ativo/passivo preservando moedas nativas;
- evoluir contas de investimento para posicoes/ativos com historico e eventos rastreaveis;
- reutilizar Open Finance quando o parceiro contratado fornecer investimentos com qualidade suficiente;
- adicionar benchmarks e indices financeiros com fonte/data auditaveis;
- suportar importacao de notas de corretagem e eventos corporativos por contratos dedicados;
- evoluir suporte a IR/apuracoes apenas com escopo e validacao proprios;
- nunca oferecer recomendacao regulada de investimento como consequencia automatica da carteira.

### Fase 7 - Plataforma e ecossistema

Abrir o produto apenas depois que os contratos publicos e controles de autorizacao estiverem maduros:

- disponibilizar API publica versionada com escopos, rate limits e auditoria;
- oferecer MCP inicialmente somente leitura e com as mesmas fronteiras de tenant/perfil do produto;
- permitir integracoes externas por adapters sem expor o dominio a dependencias de fornecedor;
- avaliar aplicativo nativo e widgets somente quando a PWA demonstrar limitacao real de experiencia ou distribuicao;
- tratar gamificacao, missoes e streaks como experimentos de retencao opcionais, nunca como requisito do core financeiro.

As Fases 4B em diante sao direcao estrategica. Cada capacidade so entra no backlog operacional quando possuir epica/issue propria, dependencias, contrato e criterios de aceite. `docs/EVOLUTION_STRATEGY.md` define a ordem e os gates para essa promocao.

## Fora do MVP inicial

- Integracao bancaria direta via Open Finance permanece fora do MVP inicial; sua evolucao esta direcionada para a Fase 4B e exige ADR, parceiro/agregador e contrato de consentimento antes de producao.
- Conversao cambial implicita ou sem fonte/taxa/data auditaveis.
- Automacao irreversivel sem revisao humana.
- App nativo completo antes da validacao da PWA; eventual avaliacao pertence a Fase 7.
- Funcionalidades de ERP avancado, folha, estoque ou contabilidade completa.
- Recomendacoes de investimento, credito ou consultoria financeira regulada.
- Uso de dados reais em exemplos, seeds, fixtures ou demonstracoes publicas.

## Perguntas abertas de produto

- Qual persona tera prioridade no primeiro corte utilizavel do MVP?
- Quais operacoes exigirao revisao humana obrigatoria antes de persistir efeitos financeiros?
- Por quanto tempo mensagens bancarias brutas poderao ser mantidas apos normalizacao?
- Quais relatorios MEI serao essenciais antes de integracoes com contador?
- Qual politica de moeda de referencia e conversao sera adotada quando o produto passar a oferecer consolidados cambiais?
- Qual parceiro/agregador atende melhor cobertura, custo, consentimento, SLA e qualidade de Open Finance quando a Fase 4B iniciar?
- Quais intencoes capturadas por WhatsApp podem apenas consultar, quais podem gerar proposta e quais exigem confirmacao reforcada?
- Qual e o menor modelo de rateio/dimensoes que atende pessoa, familia, MEI e negocio sem criar taxonomias paralelas?
- Qual granularidade de permissao e necessaria alem de owner/admin/editor/viewer para familia e pequeno negocio?
- Quais relatorios empresariais serao estritamente gerenciais e quais exigirao validacao contabil/fiscal externa?

## Regras para IA no produto

Sugestoes de IA devem conter, quando aplicavel:

- origem do dado analisado;
- acao sugerida;
- explicacao simples;
- nivel de confianca;
- estado de revisao;
- historico de aceite, edicao ou rejeicao;
- capacidade de desfazer ou auditar a decisao.

Respostas conversacionais do assistente devem ser somente leitura, indicar o recorte financeiro usado e manter valores e fatos sob responsabilidade dos calculos deterministas do SolverFin. A participacao opcional do provider limita-se a selecionar `DIRECT` ou `CONTEXTUAL`; qualquer outro texto externo e descartado e nao altera a resposta deterministica.

A IA nao deve:

- apagar dados financeiros de forma definitiva;
- esconder incerteza;
- criar lancamentos finais sem revisao quando a regra de negocio exigir confirmacao;
- expor mensagens bancarias brutas ou dados sensiveis sem necessidade clara;
- executar mutacoes financeiras pelo assistente conversacional;
- agregar moedas diferentes ou inventar cotacao cambial;
- oferecer recomendacao profissional de investimento, credito, juridica, fiscal ou contabil.

## Experiencia esperada

A experiencia deve ser direta, calma e orientada a acao. Textos visiveis devem explicar o que o usuario pode revisar, corrigir, confirmar ou acompanhar, sem jargao tecnico.

A experiencia de manutencao de registros deve evitar trocas de pagina desnecessarias. Sempre que o escopo permitir, criar e editar contas, cartoes, categorias, lancamentos, recorrencias, orcamentos e cadastros auxiliares por modal ou pop-up contextual.

Recorrencias nao tem tela propria: sao criadas e geridas dentro da tela onde a conta ou o cartao de origem ja e gerenciado (Extrato da conta para recorrencias de conta, Cartoes de Credito para recorrencias de cartao).

Contas a pagar e a receber tambem nao tem tela operacional propria no produto ativo. Receitas, despesas e transferencias previstas devem ser criadas e acompanhadas no **Extrato da conta**; compras, faturas e pagamentos de cartao devem ser criados e acompanhados em **Cartoes de Credito**. Qualquer compatibilidade tecnica com registros antigos deve preservar historico sem reintroduzir uma jornada separada para o usuario.

Telas operacionais devem ser clean: listas, filtros, acoes rapidas, estados vazios compactos e icones acessiveis devem ter prioridade sobre cards explicativos, banners permanentes e blocos longos de texto.

Dashboard e telas analiticas devem priorizar hierarquia: primeiro situacao e decisao; depois visualizacao e destaque; por ultimo o detalhe tabular. Em perfis multi-moedas, moeda e parte dessa hierarquia e deve permanecer visivel.

Exemplos de tom adequado:

- "Revise esta sugestao antes de confirmar."
- "Encontramos uma possivel duplicidade."
- "Este lancamento parece pertencer a Alimentacao."
- "Resumo do mes atualizado com os lancamentos revisados."

Evitar promessas absolutas como "controle total", "IA sem erro" ou "riqueza garantida".

## Indicadores de sucesso do MVP

- Usuarios conseguem registrar e revisar lancamentos com menos esforco manual.
- Importacoes e sugestoes reduzem retrabalho sem perder confianca.
- Contextos pessoais e profissionais permanecem separados.
- Perfis multi-moedas nao exibem totais cruzados sem conversao explicita.
- Pendencias de revisao ficam claras.
- Dados sensiveis nao aparecem em logs, exemplos ou telas indevidas.
- Telas centrais compartilham padroes visuais e de interacao em vez de depender de ajustes isolados por rota.
- Novas issues conseguem apontar para contexto, escopo, validacao e riscos.
