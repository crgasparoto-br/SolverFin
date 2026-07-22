from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} match, found {count}")
    return text.replace(old, new, 1)


source_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.ts")
source = source_path.read_text()
source = replace_once(
    source,
    "grid-template-columns: minmax(82px, .6fr) minmax(72px, .55fr) minmax(100px, .7fr) minmax(170px, 1.6fr) minmax(140px, 1fr);",
    "grid-template-columns: minmax(90px, .65fr) minmax(72px, .55fr) minmax(100px, .7fr) minmax(170px, 1.6fr) minmax(132px, 1fr);",
    "desktop row grid",
)
value_rule = "      .row-summary dd { font-size: .75rem !important; line-height: 1.25; margin: 0 !important; min-width: 0; overflow-wrap: anywhere; word-break: normal; }"
source = replace_once(
    source,
    value_rule,
    value_rule
    + "\n      .row-summary > div:nth-child(1) dd, .row-summary > div:nth-child(3) dd { white-space: nowrap; }",
    "compact value rule",
)
source_path.write_text(source)

test_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.test.ts")
test = test_path.read_text()
test = replace_once(
    test,
    r"/grid-template-columns: minmax\(82px, \.6fr\) minmax\(72px, \.55fr\) minmax\(100px, \.7fr\) minmax\(170px, 1\.6fr\) minmax\(140px, 1fr\)/,",
    r"/grid-template-columns: minmax\(90px, \.65fr\) minmax\(72px, \.55fr\) minmax\(100px, \.7fr\) minmax\(170px, 1\.6fr\) minmax\(132px, 1fr\)/,",
    "unit grid assertion",
)
marker = "    assert.match(enhanced, /word-break: normal/);\n"
if r"nth-child\(1\) dd" not in test:
    test = replace_once(
        test,
        marker,
        marker
        + r"    assert.match(enhanced, /nth-child\(1\) dd, \.row-summary > div:nth-child\(3\) dd \{ white-space: nowrap/);"
        + "\n",
        "unit nowrap assertion",
    )
test_path.write_text(test)

visual_path = Path("scripts/statement-visual/inbox-list-layout.mjs")
visual = visual_path.read_text()
visual = replace_once(
    visual,
    "      const description = descriptionEntry?.querySelector('dd');\n      const account = accountEntry?.querySelector('dd');\n      if (!description || !account || !accountEntry) return { found: false, expectedDescription };",
    "      const dateEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Data');\n      const amountEntry = fields.find((entry) => entry.querySelector('dt')?.textContent?.trim() === 'Valor');\n      const description = descriptionEntry?.querySelector('dd');\n      const account = accountEntry?.querySelector('dd');\n      const date = dateEntry?.querySelector('dd');\n      const amount = amountEntry?.querySelector('dd');\n      if (!description || !account || !accountEntry || !date || !amount) return { found: false, expectedDescription };",
    "visual compact fields",
)
visual = replace_once(
    visual,
    "      const accountStyle = getComputedStyle(account);\n      const accountEntryStyle = getComputedStyle(accountEntry);",
    "      const accountStyle = getComputedStyle(account);\n      const accountEntryStyle = getComputedStyle(accountEntry);\n      const dateStyle = getComputedStyle(date);\n      const amountStyle = getComputedStyle(amount);",
    "visual compact styles",
)
visual = replace_once(
    visual,
    "        accountLineHeight: Number.parseFloat(accountStyle.lineHeight) || 0",
    "        accountLineHeight: Number.parseFloat(accountStyle.lineHeight) || 0,\n        dateText: date.textContent?.trim() || '',\n        dateValueHeight: date.getBoundingClientRect().height,\n        dateLineHeight: Number.parseFloat(dateStyle.lineHeight) || 0,\n        amountText: amount.textContent?.trim() || '',\n        amountValueHeight: amount.getBoundingClientRect().height,\n        amountLineHeight: Number.parseFloat(amountStyle.lineHeight) || 0",
    "visual compact measurements",
)
account_assertion = """  check(
    !longText.accountLineHeight || longText.accountValueHeight <= longText.accountLineHeight * 3.5,
    \"The reference account breaks into too many lines\",
    longText,
  );"""
compact_assertions = account_assertion + """
  check(longText.dateText === \"15/07/2026\", \"The expected date is not available\", longText);
  check(
    !longText.dateLineHeight || longText.dateValueHeight <= longText.dateLineHeight * 1.5,
    \"The date breaks into more than one line\",
    longText,
  );
  check(longText.amountText.length > 0, \"The amount is not available\", longText);
  check(
    !longText.amountLineHeight || longText.amountValueHeight <= longText.amountLineHeight * 1.5,
    \"The amount breaks into more than one line\",
    longText,
  );"""
visual = replace_once(
    visual,
    account_assertion,
    compact_assertions,
    "visual compact assertions",
)
visual_path.write_text(visual)
