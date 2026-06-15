# [EPIC] IA financeira aplicada

**Fase:** MVP

## Contexto
SolverFin sera o controle financeiro inteligente da SolverIT, com foco em controle pessoal, MEI, profissional autonomo e pequenos negocios. O diferencial central e reduzir lancamentos manuais por meio de importacao, regras, IA de classificacao, conciliacao, mensagens bancarias e assistente financeiro.

## Objetivo
Criar camada de IA explicavel para extrair, classificar, conciliar e responder perguntas financeiras.

## Escopo
Abrange provider de IA, schemas estruturados, confianca, revisao, insights, anomalias e assistente financeiro.

## Fora de escopo
Nao cobrir funcionalidades fora do escopo descrito; nao antecipar integracoes externas sem ADR aprovada.

## Subissues planejadas
- [ ] `AI01` Criar abstracao de provedores de IA e politicas de uso
- [ ] `AI02` Definir schemas estruturados para extracao de lancamentos
- [ ] `AI03` Implementar parser de mensagens bancarias com IA e fallback por regras
- [ ] `AI04` Implementar categorizacao inteligente e aprendizado por correcao
- [ ] `AI05` Implementar fila de revisao de sugestoes da IA
- [ ] `AI06` Implementar assistente financeiro de perguntas e respostas
- [ ] `AI07` Implementar insights, anomalias e resumo mensal

## Artefatos esperados
- Codigo, testes e documentacao relacionados ao escopo desta issue.

## Criterios de aceite
- [ ] Toda sugestao da IA possui origem, confianca e possibilidade de revisao pelo usuario.

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
