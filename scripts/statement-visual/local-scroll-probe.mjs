/** Prove containment using temporary wide content, including naturally fitting tables. */
export function probeLocalHorizontalScroll(table) {
  if (!table || table.clientWidth <= 0) return { passed: false, reason: "table-not-visible" };
  const document = table.ownerDocument;
  const root = document.documentElement;
  const style = document.defaultView.getComputedStyle(table);
  if (!["auto", "scroll"].includes(style.overflowX)) {
    return { passed: false, reason: "missing-local-scroll" };
  }
  const previousLeft = table.scrollLeft;
  const previousTop = table.scrollTop;
  const beforeWidth = root.scrollWidth;
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = `width:${table.clientWidth + 64}px;height:1px;flex-shrink:0;`;
  try {
    table.append(sentinel);
    table.scrollLeft = 32;
    const scrolled = Math.abs(table.scrollLeft) >= 1;
    const confined = root.scrollWidth <= beforeWidth + 1;
    return {
      passed: scrolled && confined,
      scrolled,
      confined,
      probeScrollWidth: table.scrollWidth,
      clientWidth: table.clientWidth,
      documentBefore: beforeWidth,
      documentDuring: root.scrollWidth,
    };
  } finally {
    sentinel.remove();
    table.scrollLeft = previousLeft;
    table.scrollTop = previousTop;
  }
}
