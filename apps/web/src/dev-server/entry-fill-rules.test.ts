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
  assert.match(script, /rule\.name\.startsWith\(PREFIX\)/);
  assert.match(script, /normalize\(rule\.description\)\.startsWith\(typed\)/);
  assert.match(script, /category\.dispatchEvent\(new Event\("change"/);
  assert.match(script, /"POST"/);
  assert.match(script, /"PATCH"/);
  assert.match(script, /status: "inactive"/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /event\.key === "ArrowDown"/);
  assert.match(script, /event\.key === "Enter"/);
  assert.match(entryFillRuleStyles(), /focus-visible/);
  assert.doesNotThrow(() => new Function(runtime), "runtime deve conter JavaScript válido");
});
