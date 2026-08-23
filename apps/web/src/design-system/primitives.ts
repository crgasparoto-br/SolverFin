export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type SemanticTone = "positive" | "negative" | "neutral" | "attention" | "information";
export type SurfaceState = "loading" | "empty" | "error" | "unavailable" | "permission";

export interface ButtonProps {
  label: string;
  variant?: ButtonVariant;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  busy?: boolean;
  name?: string;
  value?: string;
  form?: string;
  className?: string;
}

export interface IconButtonProps extends Omit<ButtonProps, "label"> {
  label: string;
  icon: string;
  title?: string;
}

export interface CardProps {
  title?: string;
  bodyHtml: string;
  footerHtml?: string;
  className?: string;
}

export interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: SemanticTone;
}

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  align?: "start" | "center" | "end";
  renderCell: (row: Row) => string;
}

export interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export interface StatePanelProps {
  state: SurfaceState;
  title: string;
  description?: string;
  actionHtml?: string;
}

export interface AlertProps {
  tone: SemanticTone;
  title: string;
  description?: string;
}

export interface DialogProps {
  id: string;
  title: string;
  description?: string;
  bodyHtml: string;
  actionsHtml?: string;
  closeLabel?: string;
  kind?: "dialog" | "drawer";
}

export interface DialogTriggerProps extends Omit<ButtonProps, "label"> {
  dialogId: string;
  label: string;
}

export interface NavigationTab {
  label: string;
  href: string;
  active?: boolean;
}

export interface TabsProps {
  label: string;
  items: readonly NavigationTab[];
}

export interface BadgeProps {
  label: string;
  tone?: SemanticTone;
}

export interface ToastProps {
  title: string;
  description?: string;
  tone?: SemanticTone;
  assertive?: boolean;
}

export interface PageContainerProps {
  childrenHtml: string;
  className?: string;
}

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  actionsHtml?: string;
}

export interface FilterBarProps {
  childrenHtml: string;
  label?: string;
}

export interface SummaryGridProps {
  childrenHtml: string;
}

export interface DetailLayoutProps {
  masterHtml: string;
  detailHtml: string;
}

export interface FormLayoutProps {
  fieldsHtml: string;
  actionsHtml?: string;
  errorHtml?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attribute(name: string, value: string | undefined): string {
  return value === undefined ? "" : ` ${name}="${escapeHtml(value)}"`;
}

function booleanAttribute(name: string, enabled: boolean): string {
  return enabled ? ` ${name}` : "";
}

function classNames(...names: Array<string | undefined | false>): string {
  return names.filter((name): name is string => Boolean(name)).join(" ");
}

/**
 * Renders text for use in APIs that intentionally accept pre-rendered HTML.
 * Route/domain data should pass through this helper before being mixed with primitive markup.
 */
export function renderText(value: string | number): string {
  return escapeHtml(String(value));
}

export function renderButton(props: ButtonProps): string {
  const variant = props.variant ?? "primary";
  const type = props.type ?? "button";
  const disabled = props.disabled === true || props.busy === true;
  const classes = classNames("sf-button", `sf-button-${variant}`, "sf-focus-ring", props.className);

  return `<button class="${escapeHtml(classes)}" type="${type}"${attribute("name", props.name)}${attribute("value", props.value)}${attribute("form", props.form)}${booleanAttribute("disabled", disabled)}${props.busy === true ? ' aria-busy="true"' : ""}><span class="sf-button-label">${escapeHtml(props.label)}</span></button>`;
}

export function renderIconButton(props: IconButtonProps): string {
  const variant = props.variant ?? "ghost";
  const type = props.type ?? "button";
  const disabled = props.disabled === true || props.busy === true;
  const classes = classNames(
    "sf-button",
    "sf-icon-button",
    `sf-button-${variant}`,
    "sf-focus-ring",
    props.className,
  );

  return `<button class="${escapeHtml(classes)}" type="${type}" aria-label="${escapeHtml(props.label)}"${attribute("title", props.title ?? props.label)}${attribute("name", props.name)}${attribute("value", props.value)}${attribute("form", props.form)}${booleanAttribute("disabled", disabled)}${props.busy === true ? ' aria-busy="true"' : ""}><span aria-hidden="true" class="sf-icon-button-glyph">${escapeHtml(props.icon)}</span></button>`;
}

export function renderCard(props: CardProps): string {
  const classes = classNames("sf-card", props.className);
  const title = props.title ? `<h2 class="sf-card-title">${escapeHtml(props.title)}</h2>` : "";
  const footer = props.footerHtml
    ? `<footer class="sf-card-footer">${props.footerHtml}</footer>`
    : "";

  return `<section class="${escapeHtml(classes)}">${title}<div class="sf-card-body">${props.bodyHtml}</div>${footer}</section>`;
}

export function renderMetricCard(props: MetricCardProps): string {
  const tone = props.tone ?? "neutral";
  const detail = props.detail
    ? `<span class="sf-metric-card-detail">${escapeHtml(props.detail)}</span>`
    : "";

  return `<section class="sf-metric-card" data-tone="${tone}"><span class="sf-metric-card-label">${escapeHtml(props.label)}</span><strong class="sf-metric-card-value">${escapeHtml(props.value)}</strong>${detail}</section>`;
}

export function renderDataTable<Row>(props: DataTableProps<Row>): string {
  if (props.columns.length === 0) {
    throw new Error("DataTable requires at least one column.");
  }

  const caption = `<caption class="sf-visually-hidden">${escapeHtml(props.caption)}</caption>`;
  const headers = props.columns
    .map(
      (column) =>
        `<th scope="col" data-align="${column.align ?? "start"}">${escapeHtml(column.header)}</th>`,
    )
    .join("");

  if (props.rows.length === 0) {
    const emptyState = renderEmptyState({
      title: props.emptyTitle ?? "Nenhum item encontrado",
      ...(props.emptyDescription === undefined ? {} : { description: props.emptyDescription }),
    });
    return `<div class="sf-table-wrap"><table class="sf-table">${caption}<thead><tr>${headers}</tr></thead></table>${emptyState}</div>`;
  }

  const rows = props.rows
    .map((row, index) => {
      const key = escapeHtml(props.rowKey(row, index));
      const cells = props.columns
        .map(
          (column) =>
            `<td data-column="${escapeHtml(column.id)}" data-align="${column.align ?? "start"}">${column.renderCell(row)}</td>`,
        )
        .join("");
      return `<tr data-row-key="${key}">${cells}</tr>`;
    })
    .join("");

  return `<div class="sf-table-wrap"><table class="sf-table">${caption}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function renderStatePanel(props: StatePanelProps): string {
  const role = props.state === "error" ? "alert" : "status";
  const live = props.state === "error" ? "assertive" : "polite";
  const description = props.description
    ? `<p class="sf-state-panel-description">${escapeHtml(props.description)}</p>`
    : "";
  const action = props.actionHtml
    ? `<div class="sf-state-panel-actions">${props.actionHtml}</div>`
    : "";

  return `<section class="sf-state-panel" data-state="${props.state}" role="${role}" aria-live="${live}"${props.state === "loading" ? ' aria-busy="true"' : ""}><div class="sf-state-panel-marker" aria-hidden="true"></div><div class="sf-state-panel-content"><strong class="sf-state-panel-title">${escapeHtml(props.title)}</strong>${description}${action}</div></section>`;
}

export function renderEmptyState(props: Omit<StatePanelProps, "state">): string {
  return renderStatePanel({ ...props, state: "empty" });
}

export function renderLoading(props: Omit<StatePanelProps, "state">): string {
  return renderStatePanel({ ...props, state: "loading" });
}

export function renderRecoverableError(props: Omit<StatePanelProps, "state">): string {
  return renderStatePanel({ ...props, state: "error" });
}

export function renderUnavailableState(props: Omit<StatePanelProps, "state">): string {
  return renderStatePanel({ ...props, state: "unavailable" });
}

export function renderPermissionState(props: Omit<StatePanelProps, "state">): string {
  return renderStatePanel({ ...props, state: "permission" });
}

export function renderAlert(props: AlertProps): string {
  const role = props.tone === "negative" ? "alert" : "status";
  const description = props.description
    ? `<span class="sf-alert-description">${escapeHtml(props.description)}</span>`
    : "";

  return `<aside class="sf-alert sf-semantic-state" data-state="${props.tone}" role="${role}"><span class="sf-alert-content"><strong>${escapeHtml(props.title)}</strong>${description}</span></aside>`;
}

export function renderDialogTrigger(props: DialogTriggerProps): string {
  const button = renderButton({
    ...props,
    label: props.label,
    className: classNames(props.className, "sf-dialog-trigger"),
  });

  return button.replace("<button ", `<button data-sf-dialog-open="${escapeHtml(props.dialogId)}" `);
}

export function renderDialog(props: DialogProps): string {
  const kind = props.kind ?? "dialog";
  const titleId = `${props.id}-title`;
  const descriptionId = props.description ? `${props.id}-description` : undefined;
  const description = props.description
    ? `<p class="sf-dialog-description" id="${escapeHtml(descriptionId ?? "")}">${escapeHtml(props.description)}</p>`
    : "";
  const actions = props.actionsHtml
    ? `<footer class="sf-dialog-actions">${props.actionsHtml}</footer>`
    : "";

  const dialogClasses = classNames("sf-dialog", kind === "drawer" ? "sf-drawer" : undefined);
  const closeButton = renderIconButton({
    label: props.closeLabel ?? "Fechar",
    icon: "×",
    variant: "ghost",
    className: "sf-dialog-close",
  }).replace("<button ", "<button data-sf-dialog-close ");

  return `<dialog class="${dialogClasses}" id="${escapeHtml(props.id)}" aria-labelledby="${escapeHtml(titleId)}"${attribute("aria-describedby", descriptionId)}><div class="sf-dialog-panel"><header class="sf-dialog-header"><div class="sf-dialog-heading"><h2 id="${escapeHtml(titleId)}">${escapeHtml(props.title)}</h2>${description}</div>${closeButton}</header><div class="sf-dialog-body">${props.bodyHtml}</div>${actions}</div></dialog>`;
}

export function renderDrawer(props: Omit<DialogProps, "kind">): string {
  return renderDialog({ ...props, kind: "drawer" });
}

export function renderTabs(props: TabsProps): string {
  if (props.items.length === 0) {
    throw new Error("Tabs requires at least one navigation item.");
  }

  const links = props.items
    .map(
      (item) =>
        `<a class="sf-tab sf-focus-ring" href="${escapeHtml(item.href)}"${item.active === true ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`,
    )
    .join("");

  return `<nav class="sf-tabs" aria-label="${escapeHtml(props.label)}">${links}</nav>`;
}

export function renderBadge(props: BadgeProps): string {
  return `<span class="sf-badge" data-tone="${props.tone ?? "neutral"}">${escapeHtml(props.label)}</span>`;
}

export function renderToast(props: ToastProps): string {
  const tone = props.tone ?? "neutral";
  const description = props.description
    ? `<span class="sf-toast-description">${escapeHtml(props.description)}</span>`
    : "";

  return `<aside class="sf-toast" data-tone="${tone}" role="${props.assertive === true ? "alert" : "status"}" aria-live="${props.assertive === true ? "assertive" : "polite"}"><strong class="sf-toast-title">${escapeHtml(props.title)}</strong>${description}</aside>`;
}

export function renderPageContainer(props: PageContainerProps): string {
  return `<div class="${escapeHtml(classNames("sf-page-container", props.className))}">${props.childrenHtml}</div>`;
}

export function renderPageHeader(props: PageHeaderProps): string {
  const eyebrow = props.eyebrow
    ? `<span class="sf-page-header-eyebrow">${escapeHtml(props.eyebrow)}</span>`
    : "";
  const description = props.description
    ? `<p class="sf-page-header-description">${escapeHtml(props.description)}</p>`
    : "";
  const actions = props.actionsHtml
    ? `<div class="sf-page-header-actions">${props.actionsHtml}</div>`
    : "";

  return `<header class="sf-page-header"><div class="sf-page-header-copy">${eyebrow}<h1 class="sf-page-header-title">${escapeHtml(props.title)}</h1>${description}</div>${actions}</header>`;
}

export function renderFilterBar(props: FilterBarProps): string {
  return `<section class="sf-filter-bar" role="group" aria-label="${escapeHtml(props.label ?? "Filtros")}">${props.childrenHtml}</section>`;
}

export function renderSummaryGrid(props: SummaryGridProps): string {
  return `<div class="sf-summary-grid">${props.childrenHtml}</div>`;
}

export function renderDetailLayout(props: DetailLayoutProps): string {
  return `<div class="sf-detail-layout"><div class="sf-detail-layout-master">${props.masterHtml}</div><aside class="sf-detail-layout-detail">${props.detailHtml}</aside></div>`;
}

export function renderFormLayout(props: FormLayoutProps): string {
  const error = props.errorHtml ? `<div class="sf-form-layout-error">${props.errorHtml}</div>` : "";
  const actions = props.actionsHtml
    ? `<div class="sf-form-layout-actions">${props.actionsHtml}</div>`
    : "";

  return `<div class="sf-form-layout">${error}<div class="sf-form-layout-fields">${props.fieldsHtml}</div>${actions}</div>`;
}

/**
 * Browser behavior shared by Dialog and Drawer. Consumers add this script once to the page.
 * Native HTMLDialogElement.showModal() provides modal focus containment and Escape-to-close;
 * focus is restored to the opening control when the dialog closes.
 */
export function createSolverFinUiInteractionsScript(): string {
  return `(function () {
  if (globalThis.__solverFinUiPrimitivesBound === true) return;
  globalThis.__solverFinUiPrimitivesBound = true;
  var openers = new WeakMap();
  document.addEventListener("click", function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var opener = target.closest("[data-sf-dialog-open]");
    if (opener) {
      var id = opener.getAttribute("data-sf-dialog-open");
      var dialog = id ? document.getElementById(id) : null;
      if (dialog instanceof HTMLDialogElement) {
        openers.set(dialog, opener);
        if (!dialog.open) dialog.showModal();
      }
      return;
    }
    var closer = target.closest("[data-sf-dialog-close]");
    if (closer) {
      var current = closer.closest("dialog");
      if (current instanceof HTMLDialogElement) current.close();
    }
  });
  document.addEventListener("close", function (event) {
    var dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement)) return;
    var opener = openers.get(dialog);
    if (opener instanceof HTMLElement) opener.focus();
    openers.delete(dialog);
  }, true);
})();`;
}

export function renderSolverFinUiInteractionsScriptTag(): string {
  return `<script>${createSolverFinUiInteractionsScript()}</script>`;
}
