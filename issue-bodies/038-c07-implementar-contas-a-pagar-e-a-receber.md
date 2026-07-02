# Implementar contas a pagar e a receber

**Parent epic:** `E05` - [EPIC] Backend core financeiro MVP
**Fase:** MVP

## Status historico

Esta issue body pertence ao backlog inicial. A implementacao original criou o dominio/API `PayableReceivable`, mas a decisao posterior da #284 substituiu a tela operacional dedicada por fluxos em **Extrato da conta** e **Cartoes de Credito**.

Para novas implementacoes:

- use `Transaction` para receitas, despesas, transferencias e compromissos previstos de conta;
- use `Invoice` e compras de cartao para compromissos de cartao;
- trate `PayableReceivable` como legado de compatibilidade ate a transicao tecnica da #290;
- nao recrie uma tela ativa em `/pagar-receber` sem nova decisao explicita.

## Contexto
SolverFin sera o controle financeiro inteligente da SolverIT, com foco em controle pessoal, MEI, profissional autonomo e pequenos negocios. O diferencial central e reduzir lancamentos manuais por meio de importacao, regras, IA de classificacao, conciliacao, mensagens bancarias e assistente financeiro.

## Objetivo original
Suportar controle simples de vencimentos.

## Escopo original
Criar entidades/fluxos para pagar/receber, status, vencimento e conciliacao com lancamentos.

## Fora de escopo
Nao cobrir funcionalidades fora do escopo descrito; nao antecipar integracoes externas sem ADR aprovada.

## Artefatos esperados
- Codigo, testes e documentacao relacionados ao escopo desta issue.

## Criterios de aceite originais
- [ ] Conta marcada como paga/recebida gera ou vincula lancamento financeiro.

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
