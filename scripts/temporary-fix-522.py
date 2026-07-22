from pathlib import Path

source_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.ts")
source = source_path.read_text()

helper = '''
export interface InboxSelectableCheckbox {
  checked: boolean;
  disabled?: boolean;
}

export function setInboxCheckboxSelection<T extends InboxSelectableCheckbox>(
  checkboxes: readonly T[],
  shouldSelect: boolean,
  onChange?: (checkbox: T) => void,
): number {
  let changed = 0;
  for (const checkbox of checkboxes) {
    if (checkbox.disabled || checkbox.checked === shouldSelect) continue;
    checkbox.checked = shouldSelect;
    changed += 1;
    onChange?.(checkbox);
  }
  return changed;
}
'''
marker = "export function enhanceInboxListLayout(html: string, url: URL): string {"
if "export function setInboxCheckboxSelection" not in source:
    source = source.replace(marker, helper + "\n" + marker)

source = source.replace(
    ".row-summary dd { font-size: .75rem !important; line-height: 1.2; margin: 0 !important; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".row-summary dd { font-size: .75rem !important; line-height: 1.25; margin: 0 !important; min-width: 0; overflow-wrap: anywhere; }",
)
source = source.replace(
    "        const compareInboxDates = ${compareInboxDates.toString()};\n",
    "        const compareInboxDates = ${compareInboxDates.toString()};\n        const setInboxCheckboxSelection = ${setInboxCheckboxSelection.toString()};\n",
)
source = source.replace(
    "            [\"a.button-link[href*='/lancamentos']\", \"receipt\", \"Ver lançamento no Extrato\"],\n",
    "            [\"a.button-link[href*='/lancamentos']\", \"receipt\", \"Ver lançamento no Extrato\"],\n            [\".dialog-close-form button\", \"close\", \"Fechar diálogo\"],\n",
)

old_selection = '''            event.stopImmediatePropagation();
            visibleEligibleCheckboxes().forEach((box) => {
              if (box.checked === target.checked) return;
              box.checked = target.checked;
              box.dispatchEvent(new Event("change", { bubbles: true }));
            });
            syncSelectAll();'''
new_selection = '''            event.stopImmediatePropagation();
            const shouldSelect = target.checked;
            setInboxCheckboxSelection(visibleEligibleCheckboxes(), shouldSelect, (box) => {
              box.dispatchEvent(new Event("change", { bubbles: true }));
            });
            syncSelectAll();'''
if old_selection not in source and new_selection not in source:
    raise SystemExit("bulk selection block not found")
source = source.replace(old_selection, new_selection)
source_path.write_text(source)

test_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.test.ts")
test = test_path.read_text()
if "setInboxCheckboxSelection," not in test:
    test = test.replace("  normalizeInboxDate,\n", "  normalizeInboxDate,\n  setInboxCheckboxSelection,\n")

bulk_test = '''
  it("selects every eligible checkbox using one immutable bulk intent", () => {
    const master = { checked: true };
    const boxes = [
      { checked: false },
      { checked: false },
      { checked: false },
      { checked: false, disabled: true },
    ];
    const notified: number[] = [];

    const changed = setInboxCheckboxSelection(boxes, master.checked, (box) => {
      notified.push(boxes.indexOf(box));
      master.checked = false;
    });

    assert.equal(changed, 3);
    assert.deepEqual(boxes.map((box) => box.checked), [true, true, true, false]);
    assert.deepEqual(notified, [0, 1, 2]);
  });
'''
test_marker = '  it("injects compact list styles, date controls, icons and visible-only bulk selection", () => {'
if 'it("selects every eligible checkbox using one immutable bulk intent"' not in test:
    test = test.replace(test_marker, bulk_test + "\n" + test_marker)

test = test.replace(
    "    assert.match(enhanced, /stopImmediatePropagation/);\n",
    "    assert.match(enhanced, /stopImmediatePropagation/);\n    assert.match(enhanced, /const shouldSelect = target.checked/);\n    assert.match(enhanced, /setInboxCheckboxSelection/);\n    assert.match(enhanced, /\\.dialog-close-form button/);\n    assert.match(enhanced, /overflow-wrap: anywhere/);\n    assert.doesNotMatch(enhanced, /text-overflow: ellipsis/);\n",
)
test_path.write_text(test)
