export function pageMeasurementExpression() {
  return `(() => {
    const root = document.documentElement;
    const body = document.body;
    const main = document.querySelector(".main-area > main");
    const mainArea = document.querySelector(".main-area");
    const summary = document.querySelector(".account-summary");
    const panel = document.querySelector(".statement-panel");
    const table = document.querySelector(".statement-table");
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const localScroll = (element) => {
      let node = element;
      while (node && node !== body) {
        const style = getComputedStyle(node);
        if (["auto", "scroll"].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return node;
        node = node.parentElement;
      }
      return null;
    };
    const overlaps = [];
    for (const container of document.querySelectorAll(".summary-total, .status-line")) {
      const children = Array.from(container.children).filter((child) => child.getClientRects().length > 0);
      for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
          const left = children[leftIndex].getBoundingClientRect();
          const right = children[rightIndex].getBoundingClientRect();
          const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5;
          const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
          if (horizontal && vertical) overlaps.push({ container: container.className, left: children[leftIndex].textContent.trim(), right: children[rightIndex].textContent.trim() });
        }
      }
    }
    const moneyProblems = Array.from(document.querySelectorAll(".summary-balance strong, .summary-total strong, .status-line strong, .col-amount, .col-balance")).flatMap((element) => {
      const style = getComputedStyle(element);
      const clipped = element.scrollWidth > element.clientWidth + 1 && !localScroll(element) && !["auto", "scroll"].includes(style.overflowX);
      const wrapped = style.whiteSpace !== "nowrap";
      const hidden = ["ellipsis"].includes(style.textOverflow) || ["hidden", "clip"].includes(style.overflowX);
      return clipped || wrapped || hidden ? [{ text: element.textContent.trim(), clipped, wrapped, hidden, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowX: style.overflowX, whiteSpace: style.whiteSpace }] : [];
    });
    const outsideEssential = Array.from(document.querySelectorAll("h1, h2, button, a, input, select, .summary-balance strong, .summary-total strong, .status-line strong, .col-amount, .col-balance")).flatMap((element) => {
      if (element.getClientRects().length === 0) return [];
      const value = element.getBoundingClientRect();
      if ((value.left >= -1 && value.right <= window.innerWidth + 1) || localScroll(element)) return [];
      return [{ selector: element.className || element.tagName, text: element.textContent.trim().slice(0, 80), left: value.left, right: value.right }];
    });
    const mainRect = rect(main);
    const areaRect = rect(mainArea);
    const summaryRect = rect(summary);
    const panelRect = rect(panel);
    let layoutMode = "not-applicable";
    if (summaryRect && panelRect) {
      if (Math.abs(summaryRect.top - panelRect.top) <= 8 && summaryRect.right <= panelRect.left + 1) layoutMode = "side-by-side";
      else if (summaryRect.bottom <= panelRect.top + 1) layoutMode = "stacked";
      else layoutMode = "overlap";
    }
    const primary = document.querySelector(".summary-balance strong");
    const secondary = document.querySelector(".summary-total strong");
    const primarySize = primary ? parseFloat(getComputedStyle(primary).fontSize) : 0;
    const secondarySize = secondary ? parseFloat(getComputedStyle(secondary).fontSize) : 0;
    return {
      title: document.title,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      mainWidth: mainRect ? mainRect.width : 0,
      mainLeft: mainRect ? mainRect.left : 0,
      rootScrollWidth: root.scrollWidth,
      rootClientWidth: root.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      globalOverflow: root.scrollWidth !== root.clientWidth || body.scrollWidth > root.clientWidth + 1,
      centerDelta: mainRect && areaRect ? Math.abs((mainRect.left + mainRect.width / 2) - (areaRect.left + areaRect.width / 2)) : 0,
      layoutMode,
      summaryRect,
      panelRect,
      table: table ? {
        clientWidth: table.clientWidth,
        scrollWidth: table.scrollWidth,
        overflowX: getComputedStyle(table).overflowX,
        hasLocalHorizontalScroll: table.scrollWidth > table.clientWidth + 1 && ["auto", "scroll"].includes(getComputedStyle(table).overflowX)
      } : { clientWidth: 0, scrollWidth: 0, overflowX: "", hasLocalHorizontalScroll: false },
      moneyProblems,
      overlaps,
      outsideEssential,
      balanceHierarchy: !primary || !secondary || primarySize > secondarySize
    };
  })()`;
}

export function tooltipMeasurementExpression() {
  return `(() => {
    const trigger = document.querySelector('[data-visual-target="true"]');
    const tooltip = document.querySelector("#statement-status-tooltip");
    const value = tooltip ? tooltip.getBoundingClientRect() : null;
    const table = trigger.closest(".statement-table");
    return {
      activeIsTarget: document.activeElement === trigger,
      ariaLabel: trigger.getAttribute("aria-label"),
      describedBy: trigger.getAttribute("aria-describedby"),
      tooltipExists: Boolean(tooltip),
      tooltipVisible: Boolean(tooltip && !tooltip.hidden && getComputedStyle(tooltip).display !== "none"),
      tooltipParentIsBody: Boolean(tooltip && tooltip.parentElement === document.body),
      insideViewport: Boolean(value && value.left >= 0 && value.right <= window.innerWidth && value.top >= 0 && value.bottom <= window.innerHeight),
      tooltipRect: value ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom } : null,
      tableScrollLeft: table ? table.scrollLeft : 0,
      tableScrollWidth: table ? table.scrollWidth : 0,
      tableClientWidth: table ? table.clientWidth : 0
    };
  })()`;
}

export function renderReport(report) {
  const pages = report.pages
    .map(
      (item) =>
        `| ${item.name} | ${item.measurements.viewportWidth} | ${item.measurements.mainWidth.toFixed(1)} | ${item.measurements.rootScrollWidth}/${item.measurements.rootClientWidth}/${item.measurements.bodyScrollWidth} | ${item.measurements.layoutMode} | ${item.measurements.table.hasLocalHorizontalScroll ? "sim" : "nao"} | ${item.screenshot} |`,
    )
    .join("\n");
  const tooltips = report.tooltips
    .map(
      (item) =>
        `| ${item.name} | ${item.activation} | ${item.measurements.tooltipVisible ? "sim" : "nao"} | ${item.measurements.insideViewport ? "sim" : "nao"} | ${item.measurements.activeIsTarget ? "sim" : "nao"} | ${item.measurements.tableScrollLeft.toFixed(0)} | ${item.screenshot} |`,
    )
    .join("\n");
  const failures =
    report.failures.length === 0
      ? "Nenhuma falha detectada."
      : report.failures.map((item) => `- ${item.message}`).join("\n");
  return `# Evidencia visual das issues #470, #471 e #472

- Commit: \`${report.commit}\`
- Navegador: ${report.browser}
- Zoom: ${report.zoom}
- Gerado em: ${report.generatedAt}
- Dados: exclusivamente ficticios em PostgreSQL efemero

## Matriz de paginas

| Cenario | Viewport | Main (px) | root scroll/client/body | Layout | Scroll local | Screenshot |
|---|---:|---:|---|---|---|---|
${pages}

## Tooltips

| Cenario | Ativacao | Visivel | Dentro da viewport | Foco no alvo | Scroll tabela | Screenshot |
|---|---|---|---|---|---:|---|
${tooltips}

## Resultado

${failures}
`;
}
