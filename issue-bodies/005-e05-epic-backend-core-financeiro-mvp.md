# [EPIC] Backend core financeiro MVP

**Fase:** MVP

## Contexto
SolverFin sera o controle financeiro inteligente da SolverIT, com foco em controle pessoal, MEI, profissional autonomo e pequenos negocios. O diferencial central e reduzir lancamentos manuais por meio de importacao, regras, IA de classificacao, conciliacao, mensagens bancarias e assistente financeiro.

## Objetivo
Implementar APIs do controle financeiro essencial.

## Escopo
Abrange CRUDs, regras de negocio, validacoes e contratos de API para o MVP.

## Fora de escopo
Nao cobrir funcionalidades fora do escopo descrito; nao antecipar integracoes externas sem ADR aprovada.

## Subissues planejadas
- [ ] `C01` Implementar API de contas financeiras
- [ ] `C02` Implementar API de categorias e subcategorias
- [ ] `C03` Implementar API de lancamentos financeiros
- [ ] `C04` Implementar recorrencias e parcelamentos
- [ ] `C05` Implementar cartoes de credito e faturas
- [ ] `C06` Implementar orcamentos, metas e alertas basicos
- [ ] `C07` Implementar contas a pagar e a receber

## Artefatos esperados
- Codigo, testes e documentacao relacionados ao escopo desta issue.

## Criterios de aceite
- [ ] Frontend consegue operar o fluxo financeiro basico usando APIs documentadas.

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
