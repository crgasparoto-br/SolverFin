# Modelar entidades financeiras principais

**Parent epic:** `E03` - [EPIC] Dominio financeiro e persistencia
**Fase:** MVP
**Depende de:** `D03`, `D07`

## Contexto
SolverFin sera o controle financeiro inteligente da SolverIT, com foco em controle pessoal, MEI, profissional autonomo e pequenos negocios. O diferencial central e reduzir lancamentos manuais por meio de importacao, regras, IA de classificacao, conciliacao, mensagens bancarias e assistente financeiro.

## Objetivo
Definir modelo conceitual e tecnico do core financeiro.

## Escopo
Modelar Usuario, Organizacao, PerfilFinanceiro, Conta, Cartao, Categoria, Lancamento, Recorrencia, Parcela, Fatura, Orcamento, Importacao, SugestaoIA, Anexo e Auditoria.

## Fora de escopo
Nao cobrir funcionalidades fora do escopo descrito; nao antecipar integracoes externas sem ADR aprovada.

## Artefatos esperados
- Codigo, testes e documentacao relacionados ao escopo desta issue.

## Criterios de aceite
- [ ] Modelo diferencia receita, despesa e transferencia.
- [ ] Modelo suporta status previsto, realizado, conciliado e sugerido.

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
