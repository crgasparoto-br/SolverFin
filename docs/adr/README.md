# ADRs - Architecture Decision Records

ADRs registram decisoes arquiteturais relevantes do SolverFin.

Use ADR quando uma decisao:

- muda stack, framework, banco, provedor ou padrao duradouro;
- cria boundary arquitetural;
- afeta privacidade, LGPD, tenant, auditoria ou dados financeiros;
- define contrato publico, schema, integracao externa ou estrategia de IA;
- pode gerar retrabalho se ficar implicita.

## Formato

Cada ADR deve ter:

- titulo;
- status;
- data;
- contexto;
- decisao;
- consequencias;
- alternativas consideradas quando fizer sentido.

## Status possiveis

- `Proposto`
- `Aceito`
- `Substituido`
- `Depreciado`

## Lista

- `0001-stack-inicial.md` - Stack inicial e arquitetura de alto nivel.
- `0002-mvp-web-runtime-and-session.md` - Runtime web e sessao local do MVP.
- `0003-epic-133-mvp-consolidation.md` - Consolidacao do MVP navegavel da epica #133.
