# Produto - SolverFin

## Visao

SolverFin e um controle financeiro inteligente para transformar dados dispersos em organizacao, previsibilidade e decisoes acionaveis.

O produto deve atender pessoas, familias, MEIs, profissionais autonomos e pequenos negocios que precisam acompanhar entradas, saidas, contas, cartoes, vencimentos, categorias, metas e fluxo financeiro sem depender de lancamento manual excessivo.

## Proposta de valor

- Reduzir esforco manual por importacoes, regras, deduplicacao, conciliacao e IA explicavel.
- Dar clareza sobre saldo, gastos, receitas, proximos vencimentos e compromissos financeiros.
- Apoiar uso pessoal e profissional sem misturar contextos.
- Manter o usuario no controle de sugestoes e automacoes.
- Proteger dados financeiros por padrao, com consentimento e rastreabilidade.

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

## Principios de produto

- **Clareza antes de automacao:** uma automacao so e boa se o usuario entende e consegue revisar.
- **Privacidade por padrao:** dados financeiros sao sensiveis e devem ser minimizados, protegidos e auditaveis.
- **Separacao de contextos:** pessoal, familia, MEI e negocio nao devem se misturar sem acao explicita.
- **IA como assistente:** IA sugere, explica e acelera; nao deve tomar decisoes irreversiveis sozinha.
- **Rotina mobile-first:** fluxos diarios devem funcionar bem no celular.
- **MVP pragmatico:** priorizar controle financeiro essencial antes de integracoes sofisticadas.

## Escopo MVP

O MVP deve permitir:

- cadastro e manutencao de contas financeiras;
- categorias e subcategorias;
- receitas, despesas e transferencias;
- recorrencias e parcelamentos;
- cartoes de credito e faturas;
- contas a pagar e a receber;
- orcamentos, metas e alertas basicos;
- importacao inicial por CSV/OFX;
- inbox para textos de mensagens bancarias coladas ou compartilhadas;
- deduplicacao e conciliacao entre previsto, importado e realizado;
- regras automaticas configuraveis;
- sugestoes de IA revisaveis para extracao, classificacao e insights;
- dashboard e relatorios iniciais;
- separacao por usuario, tenant ou perfil financeiro;
- consentimento, auditoria e mascaramento de dados sensiveis.

## Fora do MVP inicial

- Integracao bancaria direta via Open Finance sem ADR e estudo tecnico.
- Automacao irreversivel sem revisao humana.
- App nativo completo antes da validacao da PWA.
- Funcionalidades de ERP avancado, folha, estoque ou contabilidade completa.
- Recomendacoes de investimento, credito ou consultoria financeira regulada.
- Uso de dados reais em exemplos, seeds, fixtures ou demonstracoes publicas.

## Regras para IA no produto

Sugestoes de IA devem conter, quando aplicavel:

- origem do dado analisado;
- acao sugerida;
- explicacao simples;
- nivel de confianca;
- estado de revisao;
- historico de aceite, edicao ou rejeicao;
- capacidade de desfazer ou auditar a decisao.

A IA nao deve:

- apagar dados financeiros de forma definitiva;
- esconder incerteza;
- criar lancamentos finais sem revisao quando a regra de negocio exigir confirmacao;
- expor mensagens bancarias brutas ou dados sensiveis sem necessidade clara.

## Experiencia esperada

A experiencia deve ser direta, calma e orientada a acao. Textos visiveis devem explicar o que o usuario pode revisar, corrigir, confirmar ou acompanhar, sem jargao tecnico.

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
- Pendencias de revisao ficam claras.
- Dados sensiveis nao aparecem em logs, exemplos ou telas indevidas.
- Novas issues conseguem apontar para contexto, escopo, validacao e riscos.
