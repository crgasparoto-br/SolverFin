# Scripts

Esta pasta deve guardar scripts auxiliares do repositorio, como setup local, verificacoes de qualidade, manutencao e automacoes seguras.

Regras:

- scripts devem ser idempotentes quando possivel;
- nao devem exigir segredos reais para validacoes locais;
- nao devem imprimir tokens, dados financeiros ou mensagens bancarias sensiveis;
- comandos relevantes devem ser expostos pelo `package.json` raiz ou documentados no README.

## Scripts atuais

- `validate-env-example.mjs`: valida se `.env.example` contem as variaveis obrigatorias com placeholders seguros e sem padroes aparentes de secrets reais. Rode via `npm run env:check`.
