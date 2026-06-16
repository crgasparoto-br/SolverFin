# Prisma

Esta pasta concentra a definicao inicial do banco relacional do SolverFin.

## Arquivos

- `schema.prisma`: modelos, enums, relacoes e indices iniciais do dominio financeiro.
- `migrations/`: historico de migrations versionadas para evolucao do schema.
- `prisma.config.ts`: configuracao do Prisma 7, com carregamento explicito do `.env`.

## Comandos

Validar o schema:

```sh
npm run prisma:validate
```

Gerar o Prisma Client:

```sh
npm run prisma:generate
```

Criar/aplicar migrations em ambiente local:

```sh
npm run db:migrate
```

Aplicar migrations em ambientes controlados:

```sh
npm run db:deploy
```

Aplicar dados ficticios de demonstracao local:

```sh
npm run db:seed
```

Preparar uma base local com migrations e seed:

```sh
npm run db:setup
```

Resetar uma base local e reaplicar migrations:

```sh
npm run db:reset
```

Depois do reset, rode `npm run db:seed` se quiser recriar os dados ficticios de demonstracao.

## Seed de demonstracao

O seed fica em `scripts/seed-demo.mjs` e cria uma organizacao, usuario, perfis financeiros, contas, categorias, orcamentos e transacoes com dados ficticios para validar telas e dashboards iniciais.

Ele e idempotente para os registros demo porque usa identificadores fixos e `ON CONFLICT`. Pode ser executado novamente para restaurar os valores esperados dos dados de demonstracao.

Por seguranca, o seed:

- exige `DATABASE_URL`;
- bloqueia execucao quando `NODE_ENV=production`, a menos que `SOLVERFIN_ALLOW_DEMO_SEED=true` seja informado explicitamente;
- nao deve conter dados reais, sensiveis, bancarios, fiscais ou de clientes.

## Observacoes

- Valores monetarios usam centavos em campos `*Minor`, mantendo `currency` como codigo ISO, por exemplo `BRL`.
- Entidades principais incluem `organizationId` para preservar isolamento multi-tenant.
- `Transaction` suporta lancamentos manuais, importados e sugeridos, alem de status planejado, efetivado, cancelado e conciliado.
- A primeira migration foi criada para capturar o modelo inicial; novas alteracoes devem entrar em migrations adicionais.
