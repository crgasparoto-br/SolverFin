import assert from "node:assert/strict";
import test from "node:test";

import {
  entryFillRuleScript,
  entryFillRuleStyles,
  renderEntryFillRuleControl,
} from "./entry-fill-rules.js";

test("regras de preenchimento são compartilhadas, acessíveis e nunca automáticas", () => {
  const html = renderEntryFillRuleControl();
  const script = entryFillRuleScript();
  const runtime = script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  assert.match(html, /data-fill-rule-save[^>]*>Salvar regra<\/button>/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(script, /rule\.status === "inactive"/);
  assert.match(script, /rule\.purpose === "manual_entry"/);
  assert.doesNotMatch(script, /rule\.name\.startsWith\(PREFIX\)/);
  assert.match(script, /normalize\(rule\.description\)\.startsWith\(typed\)/);
  assert.match(script, /category\.dispatchEvent\(new Event\("change"/);
  assert.match(script, /"POST"/);
  assert.doesNotMatch(script, /"PATCH"/);
  assert.match(script, /automation-rules\/manual-entry/);
  assert.match(script, /const body = \{ description: text, categoryId \}/);
  assert.match(script, /description: rule\.conditions\.descriptionIncludes\.trim\(\)/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /event\.key === "ArrowDown"/);
  assert.match(script, /event\.key === "Enter"/);
  const styles = entryFillRuleStyles();
  assert.match(styles, /\.entry-fill-rule-save\{[^}]*min-height:44px/);
  assert.match(styles, /\.entry-fill-rule-list button\{[^}]*min-height:44px/);
  assert.doesNotMatch(styles, /min-height:36px/, "new buttons cannot use compact touch targets");
  assert.match(styles, /focus-visible/);
  assert.doesNotThrow(() => new Function(runtime), "runtime deve conter JavaScript válido");
});
