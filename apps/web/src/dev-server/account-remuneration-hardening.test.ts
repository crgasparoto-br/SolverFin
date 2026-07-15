import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderAccountRemunerationAudit } from "./transactions-page.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const accountsEnhancement = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "accounts-cards-enhancement.ts"),
  "utf8",
);
const statementEnhancement = readFileSync(
  path.join(repoRoot, "apps", "web", "src", "dev-server", "list-sorting-enhancement.ts"),
  "utf8",
);

assert.match(accountsEnhancement, /Remuneração da conta/);
assert.match(accountsEnhancement, /Percentual de remuneração sobre o CDI/);
assert.match(accountsEnhancement, /remunerationIndexKind/);
assert.match(accountsEnhancement, /\/api\/account-remuneration\/configurations\//);
assert.match(accountsEnhancement, /form\.addEventListener\("submit"[\s\S]*true\)/);
assert.match(accountsEnhancement, /Contas fora de BRL permanecem não elegíveis/);

// Desativar a remuneração pelo formulário de contas deve reenviar os valores
// carregados, preservando percentual, data inicial e categoria salvos.
assert.match(
  accountsEnhancement,
  /if \(Number\.isFinite\(percentage\) && percentage > 0\) payload\.remunerationPercent = percentage;/,
);
assert.match(accountsEnhancement, /if \(startsOn\) payload\.startsOn = startsOn;/);
assert.doesNotMatch(accountsEnhancement, /if \(enabled\) \{\s*payload\.remunerationPercent/);

assert.match(statementEnhancement, /transaction\.source !== "account_remuneration"/);
assert.match(statementEnhancement, /data-remuneration-protected/);
assert.match(
  statementEnhancement,
  /altere somente o valor creditado, a categoria, a situação e a data efetiva/,
);
assert.match(statementEnhancement, /clone\.remove\(\)/);
assert.match(statementEnhancement, /Remuneração CDI/);

const audit = renderAccountRemunerationAudit({
  id: "transaction-remuneration",
  description: "Rendimento previsto",
  kind: "income",
  status: "planned",
  source: "account_remuneration",
  amountMinor: 777,
  occurredOn: "2026-07-15",
  plannedOn: "2026-07-15",
  accountRemuneration: {
    indexKind: "cdi",
    competenceOn: "2026-07-14",
    processedOn: "2026-07-15",
    balanceBaseMinor: 1_000_000,
    dailyRatePercent: 0.055131,
    remunerationPercent: 102.5,
    appliedDailyRatePercent: 0.056509275,
    originalAmountMinor: 565,
    manuallyAdjusted: true,
    adjustedAt: "2026-07-15T12:00:00.000Z",
  },
});

assert.match(audit, /Ajustado manualmente/);
assert.match(audit, /14\/07\/2026/);
assert.match(audit, /R\$\s*10\.000,00/);
assert.match(audit, /102,5%/);
assert.match(audit, /R\$\s*5,65/);
