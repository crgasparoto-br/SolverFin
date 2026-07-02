# Scripts

Esta pasta deve guardar scripts auxiliares do repositorio, como setup local, verificacoes de qualidade, manutencao e automacoes seguras.

Regras:

- scripts devem ser idempotentes quando possivel;
- nao devem exigir segredos reais para validacoes locais;
- nao devem imprimir tokens, dados financeiros ou mensagens bancarias sensiveis;
- comandos relevantes devem ser expostos pelo `package.json` raiz ou documentados no README.

## Scripts atuais

- `validate-env-example.mjs`: valida se `.env.example` contem as variaveis obrigatorias com placeholders seguros e sem padroes aparentes de secrets reais. Rode via `npm run env:check`.
- `run-compiled-tests.mjs`: descobre e executa arquivos de teste JavaScript ja compilados por workspace, em ordem deterministica. Rode indiretamente pelos scripts `test` e `test:integration` dos workspaces.
- `seed-demo.mjs`: aplica dados ficticios e seguros para demonstracao local, incluindo perfis pessoal, MEI e negocio, categorias, contas, orcamentos e transacoes coerentes para dashboards. Rode via `npm run db:seed` depois de aplicar as migrations.
- `seed-default-categories.mjs`: repara a arvore inicial editavel de categorias padrao para perfis ativos, usando a fonte canonica de `packages/domain`. O script adiciona apenas categorias padrao ausentes, reaproveita equivalentes por tipo, pai e nome normalizado, preserva categorias editadas/arquivadas pelo usuario e pode ser executado repetidamente sem duplicar registros. Rode via `npm run db:repair:default-categories`.
- `seed-default-categories-for-user.mjs`: aplica o mesmo reparo idempotente para os perfis ativos de um usuario informado por email. O script nao exclui nem substitui categorias existentes. Rode via `npm run db:repair:default-categories:user -- email@example.com`.
- `dev-web.mjs`: compila a aplicacao web uma vez, mantem o TypeScript em modo watch e reinicia o servidor local com o watch nativo do Node quando `apps/web/dist` muda. Rode via `npm run dev:web`.

## Descoberta de testes compilados

Os workspaces continuam compilando testes TypeScript com `tsc -p tsconfig.test.json` para `../../.tmp-tests/<workspace>` antes da execucao.

Depois da compilacao, `run-compiled-tests.mjs` percorre recursivamente o diretorio compilado, ordena os caminhos lexicograficos e executa cada arquivo com Node. Antes de cada arquivo, o script imprime `[test] caminho/relativo.test.js`, facilitando identificar qual teste falhou.

Convencoes atuais:

- testes unitarios usam arquivos terminados em `.test.ts`, que compilam para `.test.js`;
- testes de integracao da API usam arquivos terminados em `.integration.test.ts`, que compilam para `.integration.test.js`;
- `apps/api` executa `.test.js` excluindo `.integration.test.js` no script `test`;
- `apps/api` executa somente `.integration.test.js` no script `test:integration`;
- `apps/web` e `packages/domain` executam todos os `.test.js` compilados;
- arquivos em subdiretorios, como `dashboard/availability.test.js` ou `dev-server/transactions-page.test.js`, entram automaticamente quando seguem a convencao da suite.

Se nenhum arquivo corresponder ao padrao informado, o runner falha com mensagem clara. Se qualquer teste falhar, a execucao para nesse arquivo e propaga o exit code de falha.

## Seed de demonstracao

O seed usa identificadores fixos e `ON CONFLICT` para poder ser executado mais de uma vez sem duplicar os dados demo.

Os dados foram criados apenas para demonstracao e usam nomes, descricoes, valores e email ficticios. Nao inclua dados reais de pessoas, empresas, bancos, cartoes ou mensagens financeiras neste script.

Por seguranca, o seed exige `DATABASE_URL` e bloqueia execucao com `NODE_ENV=production`, exceto quando `SOLVERFIN_ALLOW_DEMO_SEED=true` for informado de forma explicita.

## Reparo de categorias padrao

A arvore padrao fica centralizada em `packages/domain/src/default-categories.ts` e inclui despesas, receitas e transferencias visiveis ao usuario. Transferencias usam a raiz `Transferências`, com subcategorias para transferencias entre contas proprias, aplicacoes, resgates e pagamento de cartao.

O reparo usa a chave logica:

```text
organizationId + financialProfileId + kind + parentCategoryId normalizado + nome normalizado
```

O nome normalizado ignora acentos, diferencas de caixa e espacos extras. Categorias com o mesmo nome em pais diferentes ou tipos diferentes continuam permitidas quando fizerem sentido.

Os scripts de reparo preservam categorias criadas, editadas ou arquivadas pelo usuario. Uma categoria arquivada equivalente impede a criacao automatica de outra categoria igual e nao e reativada automaticamente.
