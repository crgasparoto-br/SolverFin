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

## Provider de IA desativado

Sintoma: a selecao retorna `status: "disabled"` e nenhuma chamada externa ocorre.

Causa provavel: `AI_PROVIDER` esta ausente ou definido como `disabled`.

Comportamento esperado: local, testes e ambientes sem ativacao deliberada devem permanecer assim. Use `FakeAiProvider` para validar fluxos sem rede.

Para um ambiente protegido que deva usar o adapter real, configure todas as variaveis documentadas em `docs/ai/providers.md` e valide apenas a configuracao com `inspectAiProviderConfiguration`.

## Configuracao de IA invalida

Sintoma: `AiProviderConfigurationError` ou health check com `status: "invalid"`.

Causa provavel: provider desconhecido, endpoint sem HTTPS, credencial/modelo ausentes ou limites fora da faixa aceita.

Correcao:

1. verifique somente os nomes listados em `issues` ou `variableNames`;
2. nao copie valores de secrets para logs, issues ou comentarios;
3. confirme `AI_PROVIDER=openai` apenas no ambiente que possui configuracao protegida;
4. execute `npm run env:check` e os testes de `@solverfin/ai`.

Validacao esperada: `inspectAiProviderConfiguration` retorna `ready` sem fazer chamada remota e sem expor a credencial.

## Timeout, rate limit ou indisponibilidade de IA

Sintoma: `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_RATE_LIMITED` ou `AI_PROVIDER_UNAVAILABLE`.

Causa provavel: limite de tempo, HTTP 429 ou HTTP 5xx do provider.

Diagnostico seguro:

- confira provider, modelo, tarefa, correlation id, tentativa, duracao e codigo;
- nao registre prompt, campos, corpo bruto, resposta bruta ou credencial;
- confirme `maxRetries`, `timeoutMs` e limites ambientais da finalidade;
- preserve o fallback deterministico do fluxo.

`runAiTask` e o unico executor de retry. Nao adicione probe ou segunda chamada dentro do adapter para diagnosticar a falha.

## Resposta de IA invalida

Sintoma: `AI_PROVIDER_INVALID_RESPONSE`.

Causa provavel: corpo vazio, JSON invalido, envelope sem texto ou confianca fora de `0..1`.

Correcao: mantenha a falha terminal, preserve o fallback e ajuste o contrato do adapter ou do modelo em issue propria. Nao copie a resposta bruta para logs ou fixtures.

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
