import assert from "node:assert/strict";

import { recurrencesSectionScript, recurrencesSectionStyles } from "./recurrences-section.js";

const script = recurrencesSectionScript();
const styles = recurrencesSectionStyles();

assert.match(
  script,
  /normalizeCardInstrumentLabels\(\)/,
  "deve normalizar o label do instrumento para remover limite do campo Instrumento",
);
assert.match(
  script,
  /limite/,
  "deve conter regra especifica para remover o trecho de limite do label do instrumento",
);
assert.match(
  script,
  /Este lançamento faz parte de uma recorrência/,
  "deve perguntar o escopo ao editar lançamento recorrente",
);
assert.match(
  script,
  /alterar somente este lançamento/,
  "a confirmação deve deixar clara a opção de alterar apenas o lançamento editado",
);
assert.match(
  script,
  /moveStatementQuickActionsToHeading\(\)/,
  "deve mover as ações rápidas do extrato para o cabeçalho",
);
assert.match(
  styles,
  /statement-heading-actions/,
  "deve estilizar as ações rápidas movidas para o cabeçalho do extrato",
);
