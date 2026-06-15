# [EPIC] Fundacao documental e operacao por IA

**Fase:** MVP

## Contexto
SolverFin sera o controle financeiro inteligente da SolverIT, com foco em controle pessoal, MEI, profissional autonomo e pequenos negocios. O diferencial central e reduzir lancamentos manuais por meio de importacao, regras, IA de classificacao, conciliacao, mensagens bancarias e assistente financeiro.

## Objetivo
Criar a base documental que permita que agentes de IA implementem o projeto com minimo retrabalho, maximo contexto e criterios claros.

## Escopo
Abrange documentacao de produto, arquitetura, regras para agentes, templates, ADRs e padrao de PR.

## Fora de escopo
Nao cobrir funcionalidades fora do escopo descrito; nao antecipar integracoes externas sem ADR aprovada.

## Subissues planejadas
- [ ] `D01` Criar README principal orientado a produto e IA
- [ ] `D02` Criar docs/PRODUCT.md com visao, personas e escopo MVP
- [ ] `D03` Criar docs/ARCHITECTURE.md e decisao inicial de stack
- [ ] `D04` Criar AGENTS.md com regras globais para agentes de IA
- [ ] `D05` Criar .github/copilot-instructions.md
- [ ] `D06` Criar templates de issue e pull request para tarefas de IA
- [ ] `D07` Criar estrutura de ADRs e ADR-0001

## Artefatos esperados
- `AGENTS.md`
- `.github/copilot-instructions.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`

## Criterios de aceite
- [ ] Todas as subissues de fundacao foram concluidas ou explicitamente reagendadas.
- [ ] Repositorio possui instrucoes de IA, templates e documentos centrais.

## Padrao para implementacao por IA
- Antes de codar, leia `AGENTS.md`, `.github/copilot-instructions.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` e ADRs relacionados.
- Trabalhe em PR pequeno, focado e rastreavel a esta issue.
- Nao faca refatoracoes globais fora do escopo.
- Inclua testes automatizados ou justifique claramente quando nao forem aplicaveis.
- Atualize documentacao quando alterar fluxo, contrato de API, modelo de dados ou decisao arquitetural.
- Nao introduza dependencias sem registrar motivo e impacto.
- Preserve privacidade, LGPD, isolamento por tenant e rastreabilidade de dados financeiros.

## Validacao obrigatoria
- [ ] Implementacao atende aos criterios de aceite.
- [ ] Testes automatizados relevantes foram adicionados/atualizados.
- [ ] Lint/typecheck/build executam sem erro.
- [ ] Documentacao relacionada foi criada ou atualizada.
- [ ] Logs, erros e estados vazios foram considerados.
- [ ] Nao ha dados sensiveis em logs, seeds, fixtures ou screenshots.

## Checklist para o PR
- [ ] PR referencia esta issue.
- [ ] Alteracoes sao pequenas e focadas.
- [ ] Evidencias de validacao foram anexadas no PR.
- [ ] Riscos ou limitacoes foram documentados.
