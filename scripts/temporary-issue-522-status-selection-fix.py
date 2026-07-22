from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} match, found {count}")
    return text.replace(old, new, 1)


source_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.ts")
source = source_path.read_text()
old_listener = '        document.getElementById("import-line-filter")?.addEventListener("change", scheduleApply);'
new_listener = '''        document.getElementById("import-line-filter")?.addEventListener(
          "change",
          () => {
            setInboxCheckboxSelection(
              [...document.querySelectorAll(".import-row [data-select-suggestion]:checked")],
              false,
              (box) => box.dispatchEvent(new Event("change", { bubbles: true })),
            );
            scheduleApply();
          },
          true,
        );'''
source = replace_once(source, old_listener, new_listener, "status-filter listener")
source_path.write_text(source)

test_path = Path("apps/web/src/dev-server/inbox-list-layout-enhancement.test.ts")
test = test_path.read_text()
marker = "    assert.match(enhanced, /visibleEligibleCheckboxes/);\n"
if "data-select-suggestion\\]:checked" not in test:
    test = replace_once(
        test,
        marker,
        marker
        + r"    assert.match(enhanced, /import-line-filter[\s\S]*data-select-suggestion\]:checked[\s\S]*false[\s\S]*true/);"
        + "\n",
        "status-selection contract assertion",
    )
test_path.write_text(test)

visual_path = Path("scripts/statement-visual/inbox-list-layout.mjs")
visual = visual_path.read_text()
combined_checks = '''  check(combined.visibleDates.length === 0, "Date and state filters did not combine", combined);
  check(combined.emptyVisible, "Combined filters did not display an empty state", combined);'''
combined_checks_new = combined_checks + '''
  check(combined.selectionSummary.includes("0 selecionada(s)"), "Changing state filter retained invisible selections", combined);
  check(combined.approveDisabled, "Bulk confirmation stayed enabled for invisible selections", combined);
  check(!combined.masterChecked, "Master checkbox stayed selected after changing state filter", combined);'''
visual = replace_once(
    visual,
    combined_checks,
    combined_checks_new,
    "combined filter selection assertions",
)
state_return = '''      return {
        visibleDates: rows.filter((row) => !row.hidden).map(dateOf),
        hiddenCount: rows.filter((row) => row.hidden).length,
        counter: document.getElementById('inbox-visible-lines')?.textContent || '',
        emptyVisible: Boolean(document.getElementById('inbox-date-empty-state'))
      };'''
state_return_new = '''      return {
        visibleDates: rows.filter((row) => !row.hidden).map(dateOf),
        hiddenCount: rows.filter((row) => row.hidden).length,
        counter: document.getElementById('inbox-visible-lines')?.textContent || '',
        emptyVisible: Boolean(document.getElementById('inbox-date-empty-state')),
        selectionSummary: document.getElementById('selection-summary')?.textContent || '',
        approveDisabled: document.getElementById('approve-selected-import-lines')?.disabled ?? true,
        masterChecked: document.getElementById('select-all-import-lines')?.checked ?? false
      };'''
visual = replace_once(visual, state_return, state_return_new, "list-state selection fields")
visual_path.write_text(visual)
