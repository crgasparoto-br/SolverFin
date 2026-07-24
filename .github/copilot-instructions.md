# GitHub Copilot repository instructions - SolverFin

SolverFin e um produto financeiro para uso pessoal, familiar, MEI, profissional autonomo e pequenos negocios. Priorize seguranca, rastreabilidade, LGPD, clareza de produto e isolamento entre contextos financeiros.

## Antes de implementar

Leia, nesta ordem:

1. a issue em andamento;
2. README.md;
3. AGENTS.md;
4. docs/PRODUCT.md;
5. docs/ARCHITECTURE.md;
6. ADRs em docs/adr/ relacionadas a mudanca;
7. docs/BRAND.md quando houver interface ou texto visivel.

## Escopo

- Faca mudancas pequenas e vinculadas a issue.
- Nao implemente funcionalidades financeiras fora da issue.
- Nao crie integracoes externas sem ADR ou issue dedicada.
- Nao altere stack, arquitetura, contratos publicos ou modelo de dados sem atualizar documentacao e ADR quando aplicavel.

## Produto e dominio

- Mantenha contextos pessoal, familia, MEI e negocio separados.
- Todo registro financeiro persistente deve pertencer a usuario, tenant ou perfil financeiro quando essas entidades existirem.
- Sugestoes de IA devem ser revisaveis, explicaveis e auditaveis.
- Prefira regras deterministicas antes de IA quando forem suficientes.
- Nao delete dados financeiros de forma destrutiva sem requisito explicito.

## Privacidade e seguranca

Nunca inclua em codigo, fixtures, logs, prints ou documentacao:

- dados financeiros reais;
- mensagens bancarias reais;
- tokens, chaves ou secrets;
- numeros completos de cartao, conta ou documento;
- dados que identifiquem uma pessoa real.

Use exemplos ficticios, minimizados e seguros.

## Padroes de interface

- Para criacao e edicao de registros, use pop-up ou modal sempre que possivel, evitando navegar para outra tela quando o formulario couber em fluxo contextual.
- Mantenha telas limpas, com foco em dados e acoes; evite textos longos, banners permanentes e cards explicativos sem necessidade operacional.
- Prefira icones para acoes recorrentes quando o contexto for claro, mantendo tooltip, nome acessivel ou texto equivalente.
- Use pagina dedicada apenas para formularios longos, fluxos guiados, comparacoes amplas ou quando o contexto visual for indispensavel.

## Validacao

Use comandos documentados no README ou no proprio projeto. Enquanto nao houver stack tecnica, valide documentacao por consistencia, links internos, ausencia de contradicoes e ausencia de dados sensiveis.

Quando a stack existir, registre na PR os comandos executados, como lint, typecheck, testes, build e validacao de migrations.

## Texto visivel ao usuario

Textos de interface devem ser claros, diretos e orientados a acao. Explique o que a pessoa pode revisar, corrigir, confirmar ou acompanhar. Evite termos de implementacao, jargao tecnico e promessas absolutas sobre IA.
