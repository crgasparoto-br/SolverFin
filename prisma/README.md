# Prisma

Esta pasta concentra schema, migrations e futuramente seeds do SolverFin.

## Estado atual

- PostgreSQL e Prisma foram definidos como direcao inicial em `docs/adr/0001-stack-inicial.md`.
- O banco local de desenvolvimento pode ser iniciado com `docker compose up -d postgres`.
- A conexao local padrao fica em `.env.example` como `DATABASE_URL`.
- `schema.prisma` materializa o modelo financeiro inicial descrito em `docs/DOMAIN_MODEL.md`.
- A migration inicial fica em `prisma/migrations/20260615205000_initial_financial_domain/`.
- Seeds futuros devem usar apenas dados ficticios, minimizados e seguros.

## Comandos

Validar o schema sem conectar no banco:

```bash
npm run prisma:validate
```

Gerar Prisma Client localmente:

```bash
npm run prisma:generate
```

Subir o PostgreSQL local:

```bash
docker compose up -d postgres
```

Aplicar migrations em desenvolvimento:

```bash
npm run db:migrate
```

Aplicar migrations em ambiente ja provisionado:

```bash
npm run db:deploy
```

Resetar o banco local e reaplicar migrations:

```bash
npm run db:reset
```

Atencao: `npm run db:reset` apaga os dados locais do banco configurado em
`DATABASE_URL`. Use apenas em ambiente de desenvolvimento.

## Notas de modelagem

- Entidades financeiras carregam `organizationId` e `financialProfileId`.
- Indices iniciais priorizam tenant/contexto, datas, status, conta, cartao,
  categoria e origem de importacao.
- Constraints de banco cobrem valores positivos, periodos validos, dias de
  cartao e transferencias com contas de origem/destino diferentes.
- Anexos e auditoria usam referencia polimorfica por `entityKind`/`entityId`;
  regras de autorizacao devem validar tenant/contexto na camada de aplicacao.
