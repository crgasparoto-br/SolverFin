const DATE_FILTER_MARKER = 'data-inbox-date-filter="fixed"';

export function normalizeInboxFilterDate(value: string): string | undefined {
  const trimmed = value.trim();
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  const brazilianMatch = /(\d{2})\/(\d{2})\/(\d{4})/.exec(trimmed);
  const normalized = isoMatch
    ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    : brazilianMatch
      ? `${brazilianMatch[3]}-${brazilianMatch[2]}-${brazilianMatch[1]}`
      : undefined;

  if (!normalized) return undefined;

  const date = new Date(`${normalized}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
    ? undefined
    : normalized;
}

export function resolveInboxFilterDate(
  values: readonly (string | null | undefined)[],
): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeInboxFilterDate(value);
    if (normalized) return normalized;
  }
  return undefined;
}

export function enhanceInboxDateFilter(html: string): string {
  if (html.includes(DATE_FILTER_MARKER) || !html.includes('id="import-line-filter"')) return html;

  const normalizeDate = normalizeInboxFilterDate.toString();
  const resolveDate = resolveInboxFilterDate.toString();

  return html.replace(
    "</body>",
    `<script ${DATE_FILTER_MARKER}>${inboxDateFilterScript(normalizeDate, resolveDate)}</script></body>`,
  );
}

function inboxDateFilterScript(normalizeDate: string, resolveDate: string): string {
  return `(() => {
    const normalizeInboxFilterDate = ${normalizeDate};
    const resolveInboxFilterDate = ${resolveDate};
    let scheduled = false;

    const readRowDate = (row) => {
      const group = [...row.querySelectorAll(".row-summary > div")].find(
        (item) => item.querySelector("dt")?.textContent?.trim() === "Data",
      );
      const value = group?.querySelector("dd");
      return resolveInboxFilterDate([
        value?.dataset.fullValue,
        value?.querySelector(".row-summary-value-preview")?.textContent,
        value?.getAttribute("title"),
        value?.textContent,
      ]);
    };

    const isInRange = (value, startsOn, endsOn) => {
      if (!value) return !startsOn && !endsOn;
      if (startsOn && value < startsOn) return false;
      if (endsOn && value > endsOn) return false;
      return true;
    };

    const syncSelectAll = () => {
      const selectAll = document.getElementById("select-all-import-lines");
      if (!selectAll) return;
      const boxes = [...document.querySelectorAll(
        ".import-row:not([hidden]) [data-select-suggestion]",
      )].filter((box) => !box.disabled);
      selectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
      selectAll.indeterminate = boxes.some((box) => box.checked) && !selectAll.checked;
    };

    const apply = () => {
      const container = document.querySelector("#import-batch-detail .import-rows");
      const startInput = document.getElementById("inbox-date-start");
      const endInput = document.getElementById("inbox-date-end");
      const sortInput = document.getElementById("inbox-date-sort");
      if (!container || !startInput || !endInput || !sortInput) return;

      const startsOn = normalizeInboxFilterDate(startInput.value || "") || "";
      const endsOn = normalizeInboxFilterDate(endInput.value || "") || "";
      const sort = sortInput.value === "date_asc" ? "date_asc" : "date_desc";
      const rows = [...container.querySelectorAll(":scope > .import-row")];
      const sorted = [...rows].sort((left, right) => {
        const leftDate = readRowDate(left);
        const rightDate = readRowDate(right);
        if (!leftDate && !rightDate) return 0;
        if (!leftDate) return 1;
        if (!rightDate) return -1;
        return sort === "date_asc"
          ? leftDate.localeCompare(rightDate)
          : rightDate.localeCompare(leftDate);
      });

      if (rows.some((row, index) => row !== sorted[index])) {
        sorted.forEach((row) => container.appendChild(row));
      }

      let visibleCount = 0;
      sorted.forEach((row) => {
        const visible = isInRange(readRowDate(row), startsOn, endsOn);
        row.hidden = !visible;
        if (visible) visibleCount += 1;
        const checkbox = row.querySelector("[data-select-suggestion]");
        if (!visible && checkbox?.checked) {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      const existingEmptyState = document.getElementById("inbox-date-empty-state");
      if (rows.length > 0 && visibleCount === 0) {
        if (!existingEmptyState) {
          container.insertAdjacentHTML(
            "beforeend",
            '<div class="empty-state inbox-list-empty" id="inbox-date-empty-state"><strong>Nenhum lançamento no período selecionado.</strong><p class="muted">Ajuste as datas ou limpe o período para voltar a exibir as linhas.</p></div>',
          );
        }
      } else {
        existingEmptyState?.remove();
      }

      const counter = document.getElementById("inbox-visible-lines");
      if (counter) counter.textContent = rows.length ? visibleCount + " de " + rows.length + " linha(s)" : "";
      syncSelectAll();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (!["inbox-date-start", "inbox-date-end", "inbox-date-sort"].includes(target.id)) return;
      schedule();
    });
    document.getElementById("clear-inbox-date-filters")?.addEventListener("click", schedule);

    const detail = document.getElementById("import-batch-detail");
    if (detail) new MutationObserver(schedule).observe(detail, { childList: true, subtree: true });
    schedule();
  })();`;
}
