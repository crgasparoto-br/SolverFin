import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const document = readFileSync(new URL("../../docs/GOLDEN_STATEMENT.md", import.meta.url), "utf8");
const adr = readFileSync(
  new URL("../../docs/adr/0018-golden-statement-consolidated-by-currency.md", import.meta.url),
  "utf8",
);
const manualRules = readFileSync(new URL("../../docs/ENTRY_FILL_RULES.md", import.meta.url), "utf8");

// Document-only regression: does not replace Chrome or independent audit.
const obligations = [
  ["approved-heading", /^# Extrato: Golden Screen aprovada visualmente/m],
  ["product-acceptance-date", /14\/10\/2026/],
  ["approved-product-material", /366e02072ee39116cfc50a7bc602273902e516fc/],
  ["integrated-pr-713", /b50ee44238dd9e63129ebc87a3ee31c0965b19f8/],
  ["integrated-pr-721", /8a56d2f3bdb59d5b0d7abeceee63601c1dfbffe5/],
  ["functional-material-713", /07fb199284a7f0bab38148f33d85331aa18403d0/],
  ["responsive-material-721", /fab03d51737a5ecd434aad5e86aa468efe4563db/],
  ["centered-dialogs", /centralizados/i],
  ["new-entry-dialog", /novo/i],
  ["edit-entry-dialog", /editar/i],
  ["clone-entry-dialog", /clonar/i],
  ["individual-account-transfers", /Conta individual.*transferencias recebidas/i],
  ["all-accounts-currency-filter", /Todas as contas.*accountId=all/i],
  ["internal-transfers", /transferencias internas/i],
  ["exchange-transfers", /transferencias cambiais/i],
  ["independent-review-remains-distinct", /parecer tecnico independente|auditoria independente/i],
  ["exact-sha-certification", /certificacao exact-SHA/i],
  ["visual-acceptance-is-not-technical", /Aceite visual de produto/i],
  ["propagation-not-automatic", /nao implementa automaticamente as subissues #715/i],
  ["epic-traceability", /registrado\s+na #702/i],
  ["touch-target-44px", /44 px/i],
  ["design-system-reference", /DESIGN_SYSTEM\.md/],
];

test("issue 714 documentary contract contains 22 distinct checks", () => {
  assert.equal(obligations.length, 22);
  assert.equal(new Set(obligations.map(([name]) => name)).size, 22);
});

for (const [name, pattern] of obligations) {
  test("issue 714 documentation: " + name + " rejects omission and restores", () => {
    assert.match(document, pattern, "Missing contract: " + name);
    const globalFlags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const omitted = document.replace(new RegExp(pattern.source, globalFlags), "");
    assert.doesNotMatch(omitted, pattern, "Omission escaped detection: " + name);
    assert.match(document, pattern, "Restoration failed: " + name);
  });
}

// Cross-document precedence regression: a later feature supersedes only the
// two-action layout, not the original center/focus/financial invariants.
test("issue 714: the #747 footer supersession stays explicit and testable", () => {
  const now = /Rodape atual apos a #747 \/ PR #749:[\s\S]*?Essa atualizacao posterior substitui apenas a geometria antiga de/;
  const superseded = /Evolução posterior do rodapé — #747 \/ PR #749[\s\S]*?substitui \*\*somente\*\* a geometria de dois botões/;
  const thirdAction = /\*\*Salvar e continuar\*\*/;
  assert.match(document, now);
  assert.match(adr, superseded);
  assert.match(manualRules, thirdAction);
  assert.match(document, /Editar oferece somente Cancelar e Salvar lancamento/);
  assert.match(adr, /no mobile de 320 px, as ações podem ocupar linhas consecutivas/);
  assert.match(document, /centralizacao, foco, conteudo e regras financeiras/);
  // Remove the supersession statement, retaining old historical two-button
  // guidance: this plausible documentary regression must be rejected.
  assert.doesNotMatch(document.replace(now, ""), now);
  assert.doesNotMatch(adr.replace(superseded, ""), superseded);
});
