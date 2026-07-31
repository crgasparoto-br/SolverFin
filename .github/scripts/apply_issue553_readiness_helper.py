from pathlib import Path

path = Path("scripts/statement-visual/issue-553-manual-installments.mjs")
source = path.read_text()
marker = '''async function submitForm() {
  await evaluate(browser.cdp, `document.querySelector("[data-form]").requestSubmit()`);
}
'''
helper = '''async function proveKeyboardSubmitReadiness() {
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
if "async function proveKeyboardSubmitReadiness()" not in source:
    if marker not in source:
        raise SystemExit("submitForm marker not found")
    source = source.replace(marker, helper + marker, 1)
path.write_text(source)
