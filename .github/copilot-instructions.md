# GitHub Copilot repository instructions - SolverFin

SolverFin e um produto financeiro para uso pessoal, familiar, MEI, profissional autonomo e pequenos negocios. Priorize seguranca, rastreabilidade, LGPD, clareza de produto e isolamento entre contextos financeiros.

O produto e multi-moedas. Nunca trate moeda apenas como formatacao: ela faz parte do contrato financeiro e deve permanecer explicita em persistencia, calculos, APIs, view-models e interface.

## Antes de implementar

Leia, nesta ordem:

1. a issue em andamento;
2. README.md;
3. AGENTS.md;
4. docs/PRODUCT.md;
5. docs/EVOLUTION_STRATEGY.md quando o recorte tocar core financeiro, multi-moedas ou interface;
6. docs/ARCHITECTURE.md;
7. ADRs em docs/adr/ relacionadas a mudanca;
8. docs/BRAND.md e docs/DESIGN_SYSTEM.md quando houver interface ou texto visivel.

## Escopo

- Faca mudancas pequenas e vinculadas a issue.
- Nao implemente funcionalidades financeiras fora da issue.
- Nao crie integracoes externas sem ADR ou issue dedicada.
- Nao altere stack, arquitetura, contratos publicos ou modelo de dados sem atualizar documentacao e ADR quando aplicavel.
- Em migracoes de interface, diferencie estado atual, arquitetura-alvo e compatibilidade temporaria; nao faca reescrita big-bang sem ADR propria.

## Produto e dominio

- Mantenha contextos pessoal, familia, MEI e negocio separados.
- Todo registro financeiro persistente deve pertencer a usuario, tenant ou perfil financeiro quando essas entidades existirem.
- Sugestoes de IA devem ser revisaveis, explicaveis e auditaveis.
- Prefira regras deterministicas antes de IA quando forem suficientes.
- Nao delete dados financeiros de forma destrutiva sem requisito explicito.
- Nunca some moedas diferentes sem conversao explicita. Na ausencia de cambio, particione totais por moeda.
- Nao introduza hardcode de BRL em contratos genericos.
- Calculos de saldo, fatura, orcamento, cambio e projecao devem permanecer fora da camada de apresentacao e do provider de IA.

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
- Prefira tokens, primitivas e componentes estruturados reutilizaveis em vez de CSS/markup duplicado por rota.
- Novas features nao devem adicionar pos-processamento por regex/string sobre o HTML final como mecanismo normal de composicao.
- Pos-processadores existentes sao legado de migracao e devem permanecer cobertos somente ate a rota correspondente migrar.
- Componentes financeiros devem receber moeda explicitamente; um componente de valor monetario nao deve inferir BRL.
- Preserve SSR, acessibilidade, teclado, foco, reflow, zoom e validacao visual durante a migracao.

## Validacao

Use comandos documentados no README ou no proprio projeto. Enquanto nao houver stack tecnica, valide documentacao por consistencia, links internos, ausencia de contradicoes e ausencia de dados sensiveis.

Quando a stack existir, registre na PR os comandos executados, como lint, typecheck, testes, build e validacao de migrations.

Em mudancas financeiras, inclua casos multi-moedas quando houver agregacao/filtro/projecao e valide ausencia de dupla contabilizacao quando o fluxo tocar compras de cartao ou liquidacao de fatura.

Em mudancas visuais, valide estados relevantes, desktop/mobile quando a composicao mudar, teclado/foco e o contrato SSR ou cobertura equivalente.

## Texto visivel ao usuario

Textos de interface devem ser claros, diretos e orientados a acao. Explique o que a pessoa pode revisar, corrigir, confirmar ou acompanhar. Evite termos de implementacao, jargao tecnico e promessas absolutas sobre IA.
