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
- `seed-default-categories.mjs`: cria uma arvore inicial editavel de categorias padrao para perfis ativos, com despesas e receitas comuns. Usa identificadores determinísticos por perfil e caminho da categoria, e evita duplicidade ao rodar novamente.
- `dev-web.mjs`: compila a aplicacao web uma vez, mantem o TypeScript em modo watch e reinicia o servidor local com o watch nativo do Node quando `apps/web/dist` muda. Rode via `npm run dev:web`.

## Descoberta de testes compilados

Os workspaces continuam compilando testes TypeScript com `tsc -p tsconfig.test.json` para `../../.tmp-tests/<workspace>` antes da execucao.

Depois da compilacao, `run-compiled-tests.mjs` percorre recursivamente o diretorio compilado, ordena os caminhos lexicograficamente e executa cada arquivo com Node. Antes de cada arquivo, o script imprime `[test] caminho/relativo.test.js`, facilitando identificar qual teste falhou.

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
