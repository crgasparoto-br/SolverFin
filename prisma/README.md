# Prisma

Esta pasta concentrara schema, migrations e seeds do SolverFin quando a persistencia for implementada.

Estado atual:

- PostgreSQL e Prisma foram definidos como direcao inicial em `docs/adr/0001-stack-inicial.md`.
- O banco local de desenvolvimento pode ser iniciado com `docker compose up -d postgres`.
- A conexao local padrao fica em `.env.example` como `DATABASE_URL`.
- O schema ainda nao foi criado porque a modelagem financeira pertence a issues futuras de dominio e persistencia.
- Seeds futuros devem usar apenas dados ficticios, minimizados e seguros.

Quando `schema.prisma` existir, documente aqui os comandos de migration, reset e seed usados pelo repositorio.
