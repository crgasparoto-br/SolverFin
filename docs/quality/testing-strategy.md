# Estrategia inicial de testes

Esta estrategia orienta humanos e agentes ao adicionar ou revisar funcionalidades do SolverFin.

## Camadas

| Camada | Quando usar | Exemplos atuais | Comando |
| --- | --- | --- | --- |
| Unitario de dominio | Regras financeiras puras, tenant, privacidade, exportacao e calculos | `packages/domain/src/*.test.ts` | `npm run test --workspace @solverfin/domain` |
| API/contrato | Autenticacao, erros, correlation id e autorizacao | `apps/api/src/*.test.ts` | `npm run test --workspace @solverfin/api` |
| UI/PWA | Manifest, share target, acessibilidade e estados | `apps/web/src/**/*.test.ts` | `npm run test --workspace @solverfin/web` |
| Compartilhado | Utilitarios usados por mais de uma camada | `packages/shared/src/*.test.ts` | `npm run test --workspace @solverfin/shared` |
| Integracao/e2e | Fluxos com banco, navegador ou servicos reais | Pendente ate bootstrap da stack executavel | A definir em issue futura |

## Comandos padrao

- `npm run test`: executa testes de todos os workspaces com script.
- `npm run lint`: valida estilo e regras de TypeScript/ESLint.
- `npm run typecheck`: valida tipos sem emitir build.
- `npm run build`: valida build TypeScript atual.
- `npm run validate`: executa a validacao completa documentada no README.

## Regras para fixtures

- Usar dados ficticios e minimizados.
- Nunca usar CPF, cartao, conta, email ou mensagem bancaria de pessoa real.
- Todo dado financeiro deve carregar `organizationId` e `financialProfileId` quando passar por regras de tenant.
- Preferir valores pequenos e nomes explicitos como `org-demo`, `profile-demo`, `account-demo`.

## Que teste adicionar

- Mudanca em regra financeira: teste unitario no pacote `domain`.
- Mudanca em API, autenticacao ou erro: teste no app `api`.
- Mudanca em UI, navegacao ou PWA: teste no app `web` e validacao manual quando houver tela real.
- Mudanca em utilitario compartilhado: teste no pacote `shared`.
- Mudanca documental: validar links, coerencia com produto/arquitetura e ausencia de dados sensiveis.

## CI

O workflow atual executa instalacao, ambiente, formatacao, lint, typecheck, testes e build. Quando banco, migrations e e2e forem implementados, o CI deve ganhar jobs separados para diagnostico claro.

## Pendencias assumidas

- E2E com navegador real fica pendente ate existir app executavel.
- Testes de integracao com PostgreSQL ficam pendentes ate migrations estabilizadas.
- Meta de cobertura numerica ainda nao foi definida; o MVP prioriza cobertura de contratos criticos.
