# Troubleshooting para agentes de IA

Use este playbook para diagnosticar falhas comuns no SolverFin. Comandos destrutivos marcados como locais devem ser usados apenas em ambiente de desenvolvimento.

## Dependencias nao instaladas

Sintoma: `npm run validate` falha com pacote ausente ou comando nao encontrado.

Causa provavel: `npm install` nao foi executado ou a rede bloqueou acesso ao registry.

Correcao:

```bash
npm install
npm run validate
```

Validacao esperada: todos os workspaces executam lint, typecheck, test e build.

## Lockfile ou instalacao inconsistente

Sintoma: comportamento diferente entre local e CI.

Causa provavel: lockfile ausente, cache local antigo ou versao de Node/npm diferente.

Correcao local segura:

```bash
node --version
npm --version
rm -rf node_modules
npm install
npm run validate
```

Validacao esperada: comandos locais reproduzem a falha ou passam de forma consistente.

## Variavel de ambiente ausente

Sintoma: `npm run env:check` ou app futuro acusa variavel obrigatoria.

Causa provavel: `.env.example` incompleto ou `.env` local nao criado.

Correcao:

```bash
cp .env.example .env
npm run env:check
```

Validacao esperada: erro cita somente o nome da variavel, nunca seu valor.

## PostgreSQL local indisponivel

Sintoma: comandos Prisma ou testes futuros de integracao nao conectam no banco.

Causa provavel: Docker parado, porta ocupada ou `.env` com porta divergente.

Correcao:

```bash
docker compose up -d postgres
docker compose ps
```

Se a porta `5432` estiver ocupada, ajuste `POSTGRES_PORT` e `DATABASE_URL` no `.env` local.

Validacao esperada: servico `postgres` aparece como iniciado.

## Reset local de banco

Sintoma: schema local corrompido ou migrations de desenvolvimento fora de ordem.

Impacto: apaga o volume local de desenvolvimento. Nao usar em producao.

Correcao local:

```bash
docker compose down -v
docker compose up -d postgres
npm run db:setup
```

Validacao esperada: migrations e seed demo rodam novamente com dados ficticios.

## Prisma validate falhando

Sintoma: `npm run prisma:validate` falha.

Causa provavel: schema Prisma invalido, relacao inconsistente ou datasource sem configuracao.

Correcao:

```bash
npm run prisma:validate
```

Leia a primeira mensagem do Prisma, corrija o modelo relacionado e rode novamente.

Validacao esperada: schema valida sem alterar dados reais.

## Teste falhando por fixture

Sintoma: teste de dominio falha por tenant, categoria, periodo ou dado ausente.

Causa provavel: fixture nao respeita `organizationId`, `financialProfileId`, status ativo ou periodo esperado.

Correcao:

- confirme tenant e perfil financeiro em todos os objetos;
- use datas ISO `YYYY-MM-DD` e `YYYY-MM-DDTHH:mm:ss.sssZ`;
- mantenha fixtures pequenas e ficticias.

Validacao esperada: teste falha apenas quando a regra real falhar.

## CI falha em comando diferente do local

Sintoma: CI reprova em `format:check`, `lint`, `typecheck`, `test` ou `build`.

Causa provavel: comando local nao executado ou ambiente diferente.

Correcao:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Validacao esperada: comando local reproduz a etapa do CI.

## Quando parar e pedir decisao humana

Pare antes de prosseguir quando:

- a correcao exigir apagar dados fora do ambiente local;
- houver necessidade de segredo real, token ou credencial;
- uma regra fiscal, juridica ou contabil for decisiva;
- for preciso mudar stack, provedor externo ou arquitetura sem ADR;
- a falha indicar dados sensiveis reais em logs, seeds, fixtures ou screenshots.
