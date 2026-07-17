import assert from "node:assert/strict";

import {
  statementPresentationScript,
  statementPresentationStyles,
} from "./statement-presentation.js";

statementDayFilterIsScopedToTheBankStatementMonthControl();
statementDayFilterIncludesResponsiveStyles();

function statementDayFilterIsScopedToTheBankStatementMonthControl(): void {
  const script = statementPresentationScript();

  assert.match(script, /document\.querySelector\("#filter-month"\)/);
  assert.match(script, /dayInput\.name = "day"/);
  assert.match(script, /clearButton\.textContent = "Mês completo"/);
  assert.match(script, /form\.requestSubmit\(\)/);
  assert.match(
    script,
    /queryDay = new URLSearchParams\(window\.location\.search\)/,
  );
  assert.match(script, /Nenhum lançamento neste dia\./);
}

function statementDayFilterIncludesResponsiveStyles(): void {
  const styles = statementPresentationStyles();

  assert.match(styles, /\.account-filter \.statement-day-field/);
  assert.match(styles, /grid-template-columns: minmax\(12rem, 1\.2fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
}
