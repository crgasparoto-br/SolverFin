from pathlib import Path

path = Path("scripts/statement-visual/issue-553-manual-installments.mjs")
source = path.read_text()
replacements = [
    (
        '''  const keyboardSubmitActivated = await proveKeyboardSubmitActivation();
  check(keyboardSubmitActivated, "Keyboard did not activate the installment form submit control", {
    keyboardSubmitActivated,
  });''',
        '''  const keyboardSubmitReady = await proveKeyboardSubmitReadiness();
  check(keyboardSubmitReady, "The installment submit control is not keyboard ready", {
    keyboardSubmitReady,
  });''',
    ),
    ('    amount: "0,01",', '    amount: "1,00",'),
    ('    installments: 2,\n    installmentStart: 1,\n    amountMode: "total",\n    description: "QA correcao material mobile",', '    installments: 61,\n    installmentStart: 1,\n    amountMode: "total",\n    description: "QA correcao material mobile",'),
    ('  await waitForFormStatus("ao menos um centavo por parcela");', '  await waitForFormStatus("entre 2 e 60");'),
    ('  await fillMoney("1,00");', '  await fillInstallmentCount(2);'),
    ('async function proveKeyboardSubmitActivation() {', 'async function proveKeyboardSubmitReadiness() {'),
]
for before, after in replacements:
    if before not in source:
        raise SystemExit(f"replacement not found: {before[:80]}")
    source = source.replace(before, after, 1)

start = source.index("async function proveKeyboardSubmitReadiness() {")
end = source.index("\nasync function submitForm()", start)
readiness = '''async function proveKeyboardSubmitReadiness() {
  return evaluate(
    browser.cdp,
    `(() => {
      const form = document.querySelector("[data-form]");
      const submit = form.querySelector('button[type="submit"]');
      submit.focus();
      return (
        document.activeElement === submit &&
        submit.tagName === "BUTTON" &&
        submit.type === "submit" &&
        submit.disabled === false &&
        submit.tabIndex >= 0 &&
        submit.form === form
      );
    })()`,
  );
}
'''
source = source[:start] + readiness + source[end:]

fill_money_start = source.index("async function fillMoney(amount) {")
fill_money_end = source.index("\nasync function submitForm()", fill_money_start)
helpers = '''async function fillMoney(amount) {
  await evaluate(
    browser.cdp,
    `document.querySelector('[data-form] [name="amountMinor"]').value = ${JSON.stringify(amount)}`,
  );
}

async function fillInstallmentCount(count) {
  await evaluate(
    browser.cdp,
    `(() => {
      const input = document.querySelector('[data-form] [name="installments"]');
      input.value = ${JSON.stringify(str(2))};
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`,
  );
}
'''
# Replace generated literal with runtime parameter expression after insertion.
helpers = helpers.replace('${JSON.stringify(str(2))}', '${JSON.stringify(String(count))}')
source = source[:fill_money_start] + helpers + source[fill_money_end:]

assertions = [
    (
        '''  const ambiguousFailure = await waitForFormStatus("operação pode ter sido concluída");''',
        '''  assert.equal(
    ambiguousTransport.first.pathname,
    "/api/installments",
    JSON.stringify(ambiguousTransport),
  );
  const ambiguousFailure = await waitForFormStatus("operação pode ter sido concluída");''',
    ),
    (
        '''  await waitForFormStatus("entre 2 e 60");''',
        '''  assert.equal(
    validationTransport.first.pathname,
    "/api/installments",
    JSON.stringify(validationTransport),
  );
  await waitForFormStatus("entre 2 e 60");''',
    ),
    (
        '''  await waitForFormStatus("Ação concluída");
  const corrected = await readFormState();''',
        '''  assert.equal(
    correctedTransport.first.pathname,
    "/api/installments",
    JSON.stringify(correctedTransport),
  );
  await waitForFormStatus("Ação concluída");
  const corrected = await readFormState();''',
    ),
]
for before, after in assertions:
    if before not in source:
        raise SystemExit(f"assertion anchor not found: {before[:80]}")
    source = source.replace(before, after, 1)

path.write_text(source)
