# AGENTS.md - SolverFin

## Contexto do produto

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O objetivo e reduzir lancamentos manuais por meio de importacao, regras deterministicas, IA explicavel, conciliacao, captura de mensagens financeiras e assistente financeiro. O usuario deve manter controle sobre sugestoes, automacoes e dados sensiveis.

O produto e multi-moedas. Moeda faz parte do contrato financeiro e nao pode ser tratada apenas como formatacao de tela. Agregacoes entre moedas diferentes exigem conversao explicita e auditavel; na ausencia dela, os totais devem permanecer separados por moeda.

## Fonte de verdade

Antes de implementar, leia:

- a issue em andamento;
- `README.md`;
- `docs/PRODUCT.md`;
- `docs/EVOLUTION_STRATEGY.md`, quando a issue tocar core financeiro, multi-moedas, arquitetura web, dashboard, extrato, cartoes, relatorios, orcamentos ou projecoes;
- `docs/ARCHITECTURE.md`;
- `docs/BRAND.md`, quando houver interface ou texto visivel;
- `docs/DESIGN_SYSTEM.md`, quando houver interface;
- `docs/adr/README.md` e ADRs relacionados;
- `.github/copilot-instructions.md`, quando trabalhar no GitHub/Copilot.

Se houver conflito entre issue, documentacao e codigo, explicite o conflito na PR e siga a alternativa mais consistente com o repositorio atual, salvo orientacao explicita em contrario.

## Regras obrigatorias

1. Implemente apenas o escopo da issue.
2. Nao antecipe funcionalidades futuras sem issue ou ADR dedicada.
3. Prefira PRs pequenos, revisaveis e rastreaveis.
4. Preserve privacidade, LGPD, isolamento por tenant/perfil financeiro e rastreabilidade.
5. Nao exponha dados financeiros reais, segredos, tokens, numeros completos de cartao/conta ou mensagens bancarias sensiveis em logs, seeds, fixtures, screenshots ou documentacao.
6. Toda entidade financeira deve pertencer a um usuario, tenant ou perfil financeiro quando o dominio for implementado.
7. Toda sugestao de IA deve ser revisavel, auditavel e explicavel, com origem e estado de revisao.
8. Nao remova dados financeiros de forma destrutiva sem requisito explicito; prefira exclusao logica e trilha de auditoria.
9. Use validacao de entrada, tipos explicitos e erros padronizados quando houver codigo.
10. Atualize documentacao e ADRs quando mudar arquitetura, modelo de dados, contrato publico, fluxo relevante ou decisao duradoura.
11. Em telas com criacao ou edicao de registros, priorize pop-up/modal sempre que possivel, mantendo a listagem ou contexto atual visivel.
12. Mantenha telas clean: poucos textos explicativos, poucos cards informativos permanentes e uso de icones acessiveis para acoes recorrentes quando o contexto for claro.
13. Nunca some valores de moedas diferentes sem uma etapa explicita de conversao. Preserve moeda em dominio, API, view-model e UI; sem conversao, agregue por moeda.
14. Nao introduza hardcode de BRL em contratos genericos. Um fluxo especificamente BRL deve declarar essa restricao no contrato e validacao.
15. Regras de saldo, fatura, orcamento, cambio, projecao e demais calculos financeiros devem permanecer deterministicas fora da camada de apresentacao e fora do provider de IA.
16. Para novas interfaces, prefira componentes/primitivas estruturadas e view-models. Nao adicione transformacao por regex/string sobre HTML final como mecanismo normal de composicao.
17. Pos-processadores HTML existentes sao legado de transicao: preserve cobertura enquanto existirem e remova-os gradualmente quando a rota correspondente migrar.
18. Preserve SSR, acessibilidade, responsividade e evidencia visual durante a migracao da arquitetura de interface. Nao faca big-bang do frontend sem ADR propria.

## Padrao de trabalho

- Leia o contexto antes de editar muitos arquivos.
- Localize arquivos existentes antes de criar novos.
- Preserve convencoes locais de nomeacao, estilo e organizacao.
- Evite refactors globais fora do objetivo da issue.
- Registre decisoes arquiteturais em ADR quando criarem precedente relevante.
- Quando a issue for ampla demais, entregue uma parte coesa e documente o que ficou pendente.
- Se houver ambiguidade nao bloqueante, escolha a alternativa mais simples e segura, e registre a suposicao na PR.
- Em migracoes de interface, diferencie explicitamente mecanismo atual, mecanismo-alvo e compatibilidade temporaria.
- Em cenarios multi-moedas, inclua ao menos um caso com moedas distintas quando a operacao puder agregar, filtrar, projetar ou exibir totais.

## Validacao

Descubra os comandos no proprio repositorio. Quando existirem, execute as validacoes relevantes, por exemplo:

- instalacao de dependencias;
- lint;
- typecheck;
- testes unitarios, integracao e e2e;
- build;
- migracoes e validacao de schema;
- checks de acessibilidade, performance ou seguranca quando aplicavel.

Para mudancas financeiras, valide invariantes de moeda e ausencia de dupla contabilizacao quando o fluxo tocar cartoes, faturas, transferencias ou liquidacoes.

Para mudancas visuais, valide estados relevantes, teclado/foco, mobile/reflow e o contrato SSR ou sua cobertura equivalente durante a migracao.

Enquanto o projeto ainda nao tiver stack tecnica, valide documentacao por consistencia, links, ausencia de contradicoes e ausencia de dados sensiveis.

## Checklist final

Antes de finalizar uma tarefa, confirme:

- [ ] A issue foi interpretada e atendida no escopo combinado.
- [ ] Mudancas fora do escopo foram evitadas ou justificadas.
- [ ] Testes foram adicionados/atualizados quando aplicavel.
- [ ] Validacoes disponiveis foram executadas e registradas.
- [ ] Documentacao relacionada foi atualizada.
- [ ] ADR foi criado/atualizado quando houve decisao arquitetural.
- [ ] Valores multi-moedas nao foram agregados implicitamente.
- [ ] Interfaces novas nao aprofundaram dependencia de pos-processamento textual de HTML sem justificativa explicita.
- [ ] Acessibilidade, responsividade e estados visuais foram preservados quando aplicavel.
- [ ] Nenhum dado sensivel foi introduzido.
- [ ] Riscos, limitacoes e pendencias foram descritas na PR.
