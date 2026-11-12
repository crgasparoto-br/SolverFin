# Convencoes de codigo - SolverFin

## Workspaces

- Apps ficam em `apps/*`.
- Pacotes compartilhados ficam em `packages/*`.
- Nome de pacote deve usar o escopo `@solverfin/*`.
- Codigo TypeScript deve ficar em `src/`.
- Saida gerada deve ficar em `dist/` ou pasta equivalente ignorada pelo Git.

## TypeScript

- Use `tsconfig.base.json` como base para apps e pacotes.
- Mantenha `strict` ligado.
- Evite `any`; quando for inevitavel, justifique no codigo ou na PR.
- Prefira tipos explicitos em contratos publicos.
- Dados financeiros devem carregar contexto de usuario, tenant ou perfil financeiro quando o dominio existir.

## Imports

- Prefira imports nomeados.
- Use `import type` para tipos.
- Evite ciclos entre pacotes.
- `packages/domain` nao deve depender de apps, banco, UI ou provedor de IA.

## Formatacao

- Prettier e o formatador padrao.
- Use aspas duplas, ponto e virgula e trailing comma onde aplicavel.
- Rode `npm run format:check` antes de abrir PR.

## Formatacao de localidade

- A localidade padrao do produto e `pt-BR`.
- A moeda padrao para valores financeiros e `BRL`.
- Sempre que criar um novo objeto de formatacao (`Intl.NumberFormat`, `Intl.DateTimeFormat` ou equivalente), use a configuracao compartilhada de `@solverfin/shared` em vez de instanciar `Intl` diretamente com literais locais.
- Use `formatMinorCurrency`, `formatDateOnly`, `createSolverFinCurrencyFormatter` ou `createSolverFinDateFormatter` de `@solverfin/shared` para manter telas, assistente, insights e novos fluxos consistentes.
- Datas somente de calendario devem usar o fuso configurado em `SOLVERFIN_FORMATTING_CONFIG.dateTimeZone` para evitar deslocamento de dia ao renderizar datas ISO sem horario.

## Lint

- ESLint e o lint padrao.
- Rode `npm run lint`.
- Rode `npm run lint:fix` para correcoes automaticas quando fizer sentido.

## Validacao antes da PR

Execute:

```bash
npm run validate
```

Quando uma validacao nao puder ser executada, registre motivo e impacto na PR.
