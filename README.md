# SolverFin

SolverFin e o controle financeiro inteligente da SolverIT para pessoas, familias, MEIs, profissionais autonomos e pequenos negocios.

O produto combina organizacao financeira, importacao de dados, regras deterministicas e IA explicavel para reduzir lancamentos manuais, apoiar conciliacao e transformar informacoes financeiras em decisoes claras. A automacao deve sempre preservar revisao humana, privacidade, LGPD, rastreabilidade e separacao entre contextos pessoais, profissionais e empresariais.

## Status do repositorio

O MVP core esta navegavel de ponta a ponta com persistencia real: `apps/api` roda um servidor HTTP em Node `http`, aplica regras de `packages/domain` e persiste em PostgreSQL via `pg`; `apps/web` roda um servidor SSR que consome a API real.

Fluxos ja ligados ao banco real incluem autenticacao demo local, dashboard, contas, categorias, lancamentos, cartoes/faturas, orcamentos, recorrencias/parcelas, importacao CSV e OFX com preview e revisao humana, Inbox de mensagens bancarias, fila de sugestoes revisaveis e regras automaticas.

A rotina operacional atual esta consolidada assim:

- receitas, despesas, transferencias e compromissos previstos de conta corrente ficam no **Extrato da conta** (`/lancamentos`);
- compras, faturas, fechamento e pagamento de cartao ficam em **Cartoes de Credito** (`/cartoes`);
- cartoes de credito usam o modelo de **cartao agrupador/fatura** com **instrumentos internos**, documentado em `docs/CARDS.md`;
- `PayableReceivable` permanece como dominio/API legado de compatibilidade, documentado em `docs/PAYABLES_RECEIVABLES.md` e no plano de transicao `docs/PAYABLES_RECEIVABLES_TRANSITION.md`.

Parcelas canonicas aparecem incorporadas ao Extrato e as compras da fatura. A manutencao direta de parcelas de conta e conservadora: somente descricao, observacao e categoria podem mudar quando o backend confirma elegibilidade; valor, vencimento, situacao e redistribuicao permanecem fora desse fluxo. O fluxo OFX operacional cobre o subconjunto documentado em `docs/IMPORTS.md`, sempre com preview e revisao humana. Conciliacao ampla, automacoes avancadas e provedor real de IA ainda evoluem por issues dedicadas.

## Requisitos locais

- Node.js 22 ou superior;
- npm 10 ou superior;
- Docker com Docker Compose v2 para o banco local.

Instalar dependencias de forma reprodutivel:

```bash
npm ci
```

Executar validacao raiz:

```bash
npm run validate
```

Comandos principais:
