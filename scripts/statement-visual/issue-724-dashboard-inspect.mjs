export function inspectDashboard() {
  const root = document.documentElement;
  const summaries = [...document.querySelectorAll(".currency-summary")];
  const action = document.querySelector(".next-actions");
  const firstAction = action?.querySelector(".next-action-row");
  const firstActionLabel = firstAction?.querySelector("strong");
  const firstActionLink = firstAction?.querySelector("a[href]");
  const firstActionHref = firstActionLink?.getAttribute("href") ?? "";
  const firstActionDestinationValid =
    firstActionHref.startsWith("/") ||
    (firstActionHref.startsWith("#") && Boolean(document.getElementById(firstActionHref.slice(1))));
  const withinFirstFold = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight &&
      style.visibility === "visible" &&
      style.display !== "none"
    );
  };
  const supporting = document.querySelector(".dashboard-supporting-section");
  const region = (name) => document.querySelector('[data-dashboard-region="' + name + '"]');
  const order = [
    "overview",
    "kpis",
    "alerts",
    "cash-flow",
    "bills-and-accounts",
    "credit-cards",
    "analysis",
    "activity",
    "additional",
  ].map(region);
  const mockupOrderValid = order.every(
    (element, index) =>
      element &&
      (index === 0 ||
        Boolean(
          order[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        )),
  );
  const pairs = [
    ["dashboard-payables", "dashboard-accounts"],
    ["dashboard-credit-cards", "dashboard-best-card"],
    ["dashboard-categories", "dashboard-evolution"],
  ].map(([a, b]) => [document.getElementById(a), document.getElementById(b)]);
  const widgetRowPairing = pairs.every(([left, right]) => {
    if (!left || !right) return false;
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    return innerWidth <= 760
      ? b.top >= a.bottom - 1
      : Math.abs(a.top - b.top) <= 2 && b.left >= a.right - 2;
  });
  const isVisible = (element) =>
    element && element.getClientRects().length > 0 && getComputedStyle(element).display !== "none";
  const dashboardKpiGrid = document.querySelector(".currency-summary .sf-summary-grid");
  const desktopKpiColumns = dashboardKpiGrid
    ? getComputedStyle(dashboardKpiGrid).gridTemplateColumns.split(" ").filter(Boolean).length
    : 0;
  return {
    viewportWidth: innerWidth,
    documentUrl: location.href,
    noHorizontalOverflow: root.scrollWidth <= root.clientWidth + 1,
    mainPresent: Boolean(document.querySelector("main")),
    navigationHeight: document.querySelector(".sidebar")?.getBoundingClientRect().height ?? null,
    hasError: document.body.textContent.includes("Não foi possível carregar o Dashboard"),
    hasPartial: Boolean(document.querySelector('[data-quality="partial"]')),
    currencyCount: summaries.length,
    currencies: summaries.map((section) => section.id.replace("currency-", "")),
    primaryCount: document.querySelectorAll(".currency-summary .dashboard-metric").length,
    visiblePrimaryCount: [
      ...document.querySelectorAll(".currency-summary .dashboard-metric"),
    ].filter(isVisible).length,
    desktopKpiColumns,
    mockupOrderValid,
    operationalRowsOrdered: Boolean(
      region("bills-and-accounts") &&
      region("credit-cards") &&
      region("analysis") &&
      region("bills-and-accounts").compareDocumentPosition(region("credit-cards")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    widgetRowPairing,
    hasWideProjection: Boolean(
      region("cash-flow") &&
      getComputedStyle(
        region("cash-flow").querySelector(".cash-flow-dashboard-grid"),
      ).gridTemplateColumns.split(" ").length === 1,
    ),
    hasDashboardCharts: Boolean(
      document.querySelector(".dashboard-projection-chart polyline") &&
      document.querySelector(".dashboard-card-spend-bars") &&
      document.querySelector(".dashboard-trend-columns"),
    ),
    hasNextActions: Boolean(action),
    actionVisibleInFirstViewport:
      withinFirstFold(firstActionLabel) && withinFirstFold(firstActionLink),
    firstActionLabelVisibleInFirstViewport: withinFirstFold(firstActionLabel),
    firstActionLinkVisibleInFirstViewport: withinFirstFold(firstActionLink),
    firstActionLinkHasDestination: Boolean(
      firstActionLink && firstActionLink.tabIndex >= 0 && firstActionDestinationValid,
    ),
    allPrimaryBeforeActions: Boolean(
      action &&
      summaries.length &&
      summaries.every(
        (section) => section.getBoundingClientRect().bottom <= action.getBoundingClientRect().top,
      ),
    ),
    primaryValuesOnOneLine: [
      ...document.querySelectorAll(".currency-summary .sf-metric-card-value"),
    ]
      .filter(isVisible)
      .every((value) => {
        const range = document.createRange();
        range.selectNodeContents(value);
        return range.getClientRects().length === 1 && value.scrollWidth <= value.clientWidth + 1;
      }),
    supportingAfterActions: Boolean(
      action &&
      supporting &&
      action.compareDocumentPosition(supporting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    amountsSeparatedByCurrency: summaries.every((section) =>
      [...section.querySelectorAll(".sf-metric-card-value")].every(
        (value) => value.textContent.trim().length > 0,
      ),
    ),
    longItemVisible: document.body.textContent.includes(
      "Descrição extensa de compromisso financeiro",
    ),
  };
}
export function navigationStretchProbe() {
  const shell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const previousRows = shell.style.gridTemplateRows;
  shell.style.gridTemplateRows = "auto auto";
  const stretchedHeight = sidebar.getBoundingClientRect().height;
  shell.style.gridTemplateRows = previousRows;
  const restoredHeight = sidebar.getBoundingClientRect().height;
  return { stretchedHeight, restoredHeight };
}
export function intrusivePanelProbe() {
  const action = document.querySelector(".next-actions");
  const firstLink = action?.querySelector(".next-action-row a[href]");
  if (!action || !firstLink)
    return { actionVisibleAfterIntrusion: true, actionVisibleAfterRemoval: false };
  const linkWithinFirstFold = () => {
    const rect = firstLink.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
  };
  const panel = document.createElement("aside");
  panel.style.height = "600px";
  panel.setAttribute("aria-label", "Controle negativo de painel secundário intrusivo");
  action.parentElement.insertBefore(panel, action);
  const actionVisibleAfterIntrusion = linkWithinFirstFold();
  panel.remove();
  const actionVisibleAfterRemoval = linkWithinFirstFold();
  return { actionVisibleAfterIntrusion, actionVisibleAfterRemoval };
}

export function focusFirstAction() {
  const link = document.querySelector(".next-actions .next-action-row a[href]");
  const href = link?.getAttribute("href") ?? "";
  if (
    !link ||
    !(href.startsWith("/") || (href.startsWith("#") && document.getElementById(href.slice(1))))
  )
    return false;
  link.focus();
  return document.activeElement === link;
}

export function focusEvidence() {
  const link = document.querySelector('a[href="#dashboard-evidence-brl-available"]');
  if (!link) return false;
  link.focus();
  return document.activeElement === link;
}
export function inspectEvidence() {
  const target = document.getElementById("dashboard-evidence-brl-available");
  return { open: Boolean(target && target.open), hash: location.hash };
}
export function expandLongEvidence() {
  const target = document.getElementById("dashboard-evidence-brl-available");
  if (!target) return false;
  target.open = true;
  target.scrollIntoView({ block: "center" });
  return target.textContent.includes("Conta com nome extenso");
}
