# Scripts

Esta pasta deve guardar scripts auxiliares do repositorio, como setup local, verificacoes de qualidade, manutencao e automacoes seguras.

Regras:

- scripts devem ser idempotentes quando possivel;
- nao devem exigir segredos reais para validacoes locais;
- nao devem imprimir tokens, dados financeiros ou mensagens bancarias sensiveis;
- comandos relevantes devem ser expostos pelo `package.json` raiz ou documentados no README.

## Scripts atuais

- `validate-env-example.mjs`: valida se `.env.example` contem as variaveis obrigatorias com placeholders seguros e sem padroes aparentes de secrets reais. Rode via `npm run env:check`.
- `seed-demo.mjs`: aplica dados ficticios e seguros para demonstracao local, incluindo perfis pessoal, MEI e negocio, categorias, contas, orcamentos e transacoes coerentes para dashboards. Rode via `npm run db:seed` depois de aplicar as migrations.

## Seed de demonstracao

O seed usa identificadores fixos e `ON CONFLICT` para poder ser executado mais de uma vez sem duplicar os dados demo.

Os dados foram criados apenas para demonstracao e usam nomes, descricoes, valores e email ficticios. Nao inclua dados reais de pessoas, empresas, bancos, cartoes ou mensagens financeiras neste script.

Por seguranca, o seed exige `DATABASE_URL` e bloqueia execucao com `NODE_ENV=production`, exceto quando `SOLVERFIN_ALLOW_DEMO_SEED=true` for informado de forma explicita.
