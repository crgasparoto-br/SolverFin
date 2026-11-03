# Issue #728 — baseline Chrome autenticada anterior à primeira edição

## Proveniência histórica verificável

A inspeção feita durante a implementação original não localizou a captura, mas um
workflow **já concluído antes da primeira alteração da issue #728** havia registrado
exatamente a rota `/admin/instituicoes` numa sessão Chrome autenticada:

| Campo | Evidência |
| --- | --- |
| Run Chrome | [Statement visual validation #41652781220](https://github.com/crgasparoto-br/SolverFin/actions/runs/41652781220) |
| Artefato original | [statement-visual-evidence-97c5fcab… #13239385633](https://github.com/crgasparoto-br/SolverFin/actions/runs/41652781220/artifacts/13239385633) |
| Commit executado | `97c5fcab17c8170e1fd84359958ed4c41762b106` (issue #727, antes do merge) |
| Geração registrada no JSON Chrome | `2026-11-03T14:30:32.851Z` |
| Criação do artefato no GitHub | `2026-11-03T14:31:56Z` |
| Primeira edição material da issue #728 | `63d556cde0a5c9e2da05be50b36d322701ecd5ae`, `2026-11-03T16:57:27Z` |
| Baseline `develop` da PR #759 | `008f097b490d8bf90a7174db8ddfb169893bcef6`, merge da issue #727 |

O arquivo bruto `issue-615-secondary-admin-instituicoes.json` do artefato acima informa
`route=/admin/instituicoes`, `expectedAudience=master`, `expectedArchetype=admin-maintenance`,
`failures=[]` e navegador `Google Chrome 156.0.8078.47`. A execução inclui login de
demonstração autenticado e capturas `issue-615-admin-instituicoes-desktop-1366x768.png`
e `issue-615-admin-instituicoes-mobile-390x844.png`. As medições registram
`summaryCards=4` e `filterControls=10` (incluindo controles de ação), mostrando
quatro cards antes do catálogo e oito campos de filtro simultaneamente expostos.

O diff Git entre `97c5fcab` e `008f097b` **não apresenta alterações** nos arquivos
que produzem e exercitam essa rota:

- `apps/web/src/dev-server/admin-institutions-page.ts`
- `apps/web/src/dev-server/api.ts`
- `apps/web/src/dev-server/shared-styles.ts`
- `apps/web/src/dev-server/shell.ts`
- `apps/web/src/dev-server/secondary-routes-view-model.ts`
- `apps/web/src/design-system/primitives.ts`
- `scripts/statement-visual/issue-615-secondary-route.mjs`

Portanto, a captura histórica demonstra a divergência na composição que se tornou
a base de implementação da #728 **antes da primeira edição material**. A evidência
é anterior e preexistente; não foi recriada nem rotulada com o SHA de `develop`.
Não representa inspeção nova no Chrome da base exata, mas a igualdade de bytes nos
componentes relevantes dá suporte à equivalência da tela registrada.

## Delta de comportamento exigido

A linha do tempo acima documenta a aplicabilidade original; a remediação da
#728 deve ainda provar, no SHA material final, que respostas HTTP 503/502 e falhas
de conexão mostram erro recuperável (sem alegar ausência de perfil master),
conservam os filtros/ordenação/querystring e permitem repetir a operação. Apenas
HTTP 403 deve mostrar o estado de permissão. CI verde não substitui a inspeção
visual nem a auditoria independente desse comportamento.
