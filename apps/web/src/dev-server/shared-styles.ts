import { solverFinDesignTokens, type SolverFinDesignTokens } from "../design-system/tokens.js";
import { createSolverFinDesignSystemCss } from "../design-system/styles.js";

/**
 * CSS shared by every authenticated SSR page: canonical design tokens, base reset,
 * the authenticated shell chrome (sidebar/topbar/nav/logout) and recurring primitives.
 * Page modules compose this with their own page-specific rules instead of redefining the shell.
 */
export function sharedShellStyles(tokens: SolverFinDesignTokens = solverFinDesignTokens): string {
  return `
    ${createSolverFinDesignSystemCss(tokens)}
    :root {
      color-scheme: light;
      --bg: var(--sf-color-background);
      --surface: var(--sf-color-surface);
      --surface-soft: var(--sf-color-surface-soft);
      --text: var(--sf-color-text);
      --muted: var(--sf-color-muted-text);
      --line: var(--sf-color-line);
      --primary: var(--sf-color-primary);
      --primary-soft: var(--sf-color-primary-soft);
      --primary-hover: var(--sf-color-primary-hover);
      --neutral-control-hover: var(--sf-color-neutral-control-hover);
      --neutral-control-border-hover: var(--sf-color-neutral-control-border-hover);
      --neutral-control-active-hover: var(--sf-color-neutral-control-active-hover);
      --neutral-control-text-hover: var(--sf-color-neutral-control-text-hover);
      --cyan: var(--sf-color-accent-strong);
      --cyan-soft: var(--sf-color-accent-surface);
      --success: var(--sf-color-success);
      --success-bg: var(--sf-color-success-surface);
      --danger: var(--sf-color-danger);
      --danger-bg: var(--sf-color-danger-surface);
      --warning: var(--sf-color-warning-text);
      --warning-bg: var(--sf-color-warning-surface);
      --radius: var(--sf-radius-md);
      --radius-lg: var(--sf-radius-lg);
      --shadow-sm: var(--sf-shadow-sm);
      --shadow-focus: var(--sf-shadow-focus);
    }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sf-font-family);
      font-size: var(--sf-font-size-md);
      line-height: var(--sf-line-height-normal);
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1 { font-size: clamp(1.15rem, 2.5vw, var(--sf-font-size-2xl)); line-height: var(--sf-line-height-tight); font-weight: var(--sf-font-weight-bold); }
    h2 { font-size: var(--sf-font-size-heading); font-weight: var(--sf-font-weight-bold); line-height: var(--sf-line-height-compact); }
    h3 { font-size: var(--sf-font-size-md); font-weight: var(--sf-font-weight-semibold); line-height: var(--sf-line-height-compact); }
    a { color: inherit; text-decoration: none; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus);
      border-radius: var(--radius);
    }

    /* ── Tooltip nativo aprimorado ── */
    [title] { cursor: default; }

    /* ── Panels e cards ── */
    .panel, .metric-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: var(--sf-density-panel-padding-block) var(--sf-density-panel-padding-inline);
      box-shadow: var(--shadow-sm);
    }
    .panel { display: grid; gap: var(--sf-space-3); min-width: 0; }

    /* ── Eyebrow / muted ── */
    .eyebrow {
      color: var(--cyan);
      font-size: var(--sf-font-size-xs);
      font-weight: var(--sf-font-weight-bold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .muted { color: var(--muted); line-height: var(--sf-line-height-normal); }

    /* ── Forms ── */
    form { display: grid; gap: var(--sf-density-control-padding-inline); }
    label { display: grid; gap: 6px; color: var(--text); font-weight: var(--sf-font-weight-semibold); font-size: var(--sf-font-size-sm); }
    input, select, textarea {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      color: var(--text);
      font: inherit;
      min-height: var(--sf-density-control-min-height);
      padding: 0 var(--sf-density-control-padding-inline);
      width: 100%;
      transition: border-color var(--sf-motion-fast), box-shadow var(--sf-motion-fast);
    }
    input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: none;
      border-color: var(--cyan);
      box-shadow: var(--shadow-focus);
    }

    /* ── Buttons ── */
    button, .button-link {
      align-items: center;
      background: var(--primary);
      border: 1px solid transparent;
      border-radius: var(--radius);
      color: white;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: var(--sf-font-size-sm);
      font-weight: var(--sf-font-weight-semibold);
      gap: 6px;
      justify-content: center;
      min-height: var(--sf-density-compact-action-min-height);
      padding: 0 var(--sf-space-3);
      text-decoration: none;
      transition: background var(--sf-motion-fast), border-color var(--sf-motion-fast), box-shadow var(--sf-motion-fast), color var(--sf-motion-fast), opacity var(--sf-motion-fast);
      white-space: nowrap;
    }
    button:hover:not(:disabled), .button-link:hover { background: var(--primary-hover); }
    button:disabled { cursor: not-allowed; opacity: 0.5; }

    /*
     * Controles operacionais não são ações primárias. O estado base é definido
     * aqui apenas para variantes semânticas compartilhadas; aliases legados
     * mantêm seus estados de repouso locais e recebem daqui somente hover/foco.
     */
    form.close-form > button:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button),
    button[data-button-variant="neutral"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button),
    button:is(
      .neutral-button,
      .secondary-button,
      .ghost-button,
      .icon-button,
      .tab-button,
      .filter-button,
      .sort-button,
      .month-nav-button,
      .menu-button,
      .toggle-button,
      .pagination-button,
      .row-action,
      .toolbar-button,
      .nav-button,
      .close-form
    ):not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button),
    .button-link.secondary-link {
      background: var(--surface);
      border-color: var(--line);
      color: var(--primary);
    }
    button[aria-pressed]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[aria-pressed]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button[aria-selected]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[aria-selected]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button[aria-haspopup="listbox"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[aria-haspopup="listbox"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button[role="menuitem"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[role="menuitem"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    form.close-form > button:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    form.close-form > button:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button[data-button-variant="neutral"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[data-button-variant="neutral"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button:is(
      .neutral-button,
      .secondary-button,
      .ghost-button,
      .ghost-btn,
      .icon-button,
      .icon-btn,
      .tab-button,
      .filter-button,
      .sort-button,
      .month-nav-button,
      .menu-button,
      .toggle-button,
      .pagination-button,
      .row-action,
      .toolbar-button,
      .nav-button,
      .actions-item,
      .status-icon-btn,
      .account-select-trigger,
      .close-form
    ):not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button:is(
      .neutral-button,
      .secondary-button,
      .ghost-button,
      .ghost-btn,
      .icon-button,
      .icon-btn,
      .tab-button,
      .filter-button,
      .sort-button,
      .month-nav-button,
      .menu-button,
      .toggle-button,
      .pagination-button,
      .row-action,
      .toolbar-button,
      .nav-button,
      .actions-item,
      .status-icon-btn,
      .account-select-trigger,
      .close-form
    ):not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    .button-link.secondary-link:hover,
    .button-link.secondary-link:focus-visible {
      background: var(--neutral-control-hover);
      border-color: var(--neutral-control-border-hover);
      color: var(--neutral-control-text-hover);
    }
    button[aria-pressed="true"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[aria-pressed="true"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible,
    button[aria-selected="true"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):hover:not(:disabled),
    button[aria-selected="true"]:not(.danger):not(.danger-action):not(.danger-menu-item):not(.danger-icon-button):focus-visible {
      background: var(--neutral-control-active-hover);
    }
    .secondary-button {
      background: var(--surface);
      border-color: var(--line);
      color: var(--primary);
    }
    .secondary-button:hover:not(:disabled) {
      background: var(--neutral-control-hover);
      border-color: var(--neutral-control-border-hover);
      color: var(--neutral-control-text-hover);
    }
    .danger-action {
      background: var(--danger-bg);
      border-color: var(--sf-color-danger-border);
      color: var(--danger);
    }
    .danger-action:hover:not(:disabled),
    .danger-action:focus-visible { background: var(--sf-color-danger-border); }
    .danger-icon-button:hover:not(:disabled),
    .danger-icon-button:focus-visible {
      background: var(--danger-bg);
      border-color: var(--sf-color-danger-border);
      color: var(--danger);
    }

    /* ── Feedback ── */
    .error {
      background: var(--danger-bg);
      border: 1px solid var(--sf-color-danger-border);
      border-radius: var(--radius);
      color: var(--danger);
      font-size: var(--sf-font-size-sm);
      padding: var(--sf-space-2) var(--sf-density-control-padding-inline);
    }
    .success {
      background: var(--success-bg);
      border: 1px solid var(--sf-color-success-border);
      border-radius: var(--radius);
      color: var(--success);
      font-size: var(--sf-font-size-sm);
      padding: var(--sf-space-2) var(--sf-density-control-padding-inline);
    }
    .form-status { grid-column: 1 / -1; min-height: 1.3em; }

    /* ── App Shell ── */
    .app-shell {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      background: var(--primary);
      color: white;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 10px;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    /* ── Brand ── */
    .brand {
      align-items: center;
      display: inline-flex;
      font-size: var(--sf-font-size-lg);
      font-weight: var(--sf-font-weight-extra-bold);
      gap: var(--sf-space-2);
      min-height: var(--sf-density-control-min-height);
      text-decoration: none;
      padding: var(--sf-space-1) 6px;
      border-radius: var(--radius);
      margin-bottom: var(--sf-space-2);
    }
    .brand img { border-radius: 5px; display: block; }

    /* ── Nav ── */
    nav { display: grid; gap: 2px; flex: 1; }
    nav a {
      align-items: center;
      border-radius: var(--radius);
      color: rgba(255,255,255,.75);
      display: flex;
      font-size: var(--sf-font-size-sm);
      font-weight: var(--sf-font-weight-medium);
      gap: var(--sf-space-2);
      min-height: var(--sf-density-compact-action-min-height);
      padding: 0 var(--sf-space-2);
      text-decoration: none;
      transition: background var(--sf-motion-fast), color var(--sf-motion-fast);
    }
    nav a:hover { background: rgba(255,255,255,.1); color: white; }
    nav a[aria-current="page"] {
      background: rgba(34,211,238,.18);
      color: white;
      font-weight: var(--sf-font-weight-semibold);
    }
    nav a svg { flex-shrink: 0; opacity: 0.85; }
    nav a[aria-current="page"] svg { opacity: 1; }

    /* ── Nav section headings ── */
    .nav-section-label {
      color: rgba(255,255,255,.4);
      font-size: var(--sf-font-size-xs);
      font-weight: var(--sf-font-weight-bold);
      letter-spacing: 0.06em;
      padding: 10px var(--sf-space-2) var(--sf-space-1);
      text-transform: uppercase;
    }

    .nav-more-toggle { display: none; }

    /* ── Logout ── */
    .logout {
      background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.12);
      color: rgba(255,255,255,.8);
      font-size: var(--sf-font-size-sm);
      margin-top: auto;
      width: 100%;
    }
    .logout:hover { background: rgba(255,255,255,.18); color: white; }

    /* ── Main area ── */
    .main-area { min-width: 0; display: flex; flex-direction: column; }
    .main-area > main {
      margin-inline: auto;
      max-width: var(--sf-layout-content-max-width);
      min-width: 0;
      width: 100%;
    }

    /* ── Topbar ── */
    .topbar {
      align-items: center;
      background: rgba(255,255,255,.96);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      min-height: 52px;
      padding: 0 var(--sf-layout-gutter-desktop);
      position: sticky;
      top: 0;
      z-index: 5;
      box-shadow: var(--shadow-sm);
    }
    .topbar div { display: grid; gap: 1px; }
    .topbar strong { font-size: var(--sf-font-size-md); font-weight: var(--sf-font-weight-bold); }
    .topbar span { color: var(--muted); font-size: 0.75rem; }
    .topbar > button {
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: var(--sf-font-size-sm);
      gap: 5px;
      min-height: var(--sf-density-icon-action-size);
      padding: 0 var(--sf-density-control-padding-inline);
    }
    .topbar > button:hover { color: var(--danger); border-color: var(--sf-color-danger-border); background: var(--danger-bg); }

    /* ── Empty state ── */
    .empty-state {
      background: var(--bg);
      border: 1px dashed var(--line);
      border-radius: var(--radius-lg);
      display: grid;
      gap: var(--sf-space-1);
      padding: var(--sf-density-panel-padding-block) var(--sf-density-panel-padding-inline);
    }
    .empty-state strong { font-size: var(--sf-font-size-md); }
    .empty-state p { font-size: var(--sf-font-size-sm); color: var(--muted); }

    /* ── Mobile ── */
    @media (max-width: ${tokens.breakpoints.shellCompact}) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar {
        flex-direction: row;
        flex-wrap: nowrap;
        gap: var(--sf-space-1);
        height: auto;
        overflow-x: auto;
        padding: var(--sf-space-2) var(--sf-space-3);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .sidebar .logout { display: none; }
      .brand { margin-bottom: 0; }
      nav { display: flex; flex-wrap: nowrap; gap: var(--sf-space-1); overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
      nav a { flex: 0 0 auto; white-space: nowrap; }
      nav a[data-nav-priority="secondary"] { display: none; }
      nav.nav-open a[data-nav-priority="secondary"] { display: inline-flex; }
      .nav-section-label { display: none; }
      .nav-more-toggle {
        align-items: center;
        background: rgba(255,255,255,.1);
        border: 0;
        border-radius: var(--radius);
        color: rgba(255,255,255,.82);
        cursor: pointer;
        display: inline-flex;
        flex: 0 0 auto;
        font: inherit;
        font-size: var(--sf-font-size-sm);
        font-weight: var(--sf-font-weight-semibold);
        justify-content: center;
        min-height: var(--sf-density-compact-action-min-height);
        order: 2;
        padding: 0 var(--sf-density-control-padding-inline);
        white-space: nowrap;
      }
      .nav-more-toggle:hover, .nav-more-toggle[aria-expanded="true"] { background: rgba(34,211,238,.18); color: white; }
      .topbar { min-height: 48px; padding: 0 var(--sf-layout-gutter-mobile); position: static; }
      .topbar > button { display: none; }
      main { padding: var(--sf-layout-gutter-mobile) var(--sf-layout-gutter-mobile) var(--sf-space-6); }
    }
  `;
}

/**
 * CSS for the native <dialog>-based create/edit modal pattern.
 */
export function sharedDialogStyles(tokens: SolverFinDesignTokens = solverFinDesignTokens): string {
  return `
    .master-dialog {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      box-shadow: var(--sf-shadow-dialog);
      max-width: var(--sf-layout-dialog-max-width);
      padding: 18px;
      width: calc(100% - 32px);
    }
    .master-dialog::backdrop { background: rgba(15,23,42,.42); }
    .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .dialog-heading { display: grid; gap: 3px; }
    .dialog-heading h2 { font-size: var(--sf-font-size-lg); }
    .dialog-heading p { font-size: var(--sf-font-size-sm); color: var(--muted); }
    .edit-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 10px;
    }
    .edit-grid button, .edit-grid .form-status { grid-column: 1 / -1; }
    .icon-button {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      color: var(--primary);
      min-height: var(--sf-density-icon-action-size);
      padding: 0;
      width: var(--sf-density-icon-action-size);
      transition: background var(--sf-motion-fast), border-color var(--sf-motion-fast), color var(--sf-motion-fast);
    }
    .icon-button:hover:not(:disabled),
    .icon-button:focus-visible { background: var(--neutral-control-hover); border-color: var(--neutral-control-border-hover); color: var(--neutral-control-text-hover); }
    .danger-icon-button {
      background: var(--surface);
      border-color: var(--line);
      color: var(--muted);
    }
    .danger-icon-button:hover:not(:disabled),
    .danger-icon-button:focus-visible { background: var(--danger-bg); border-color: var(--sf-color-danger-border); color: var(--danger); }
    .action-icon { display: block; height: 15px; width: 15px; }
    @media (max-width: ${tokens.breakpoints.dialogStack}) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: ${tokens.breakpoints.shellCompact}) { .edit-grid { grid-template-columns: 1fr; } }
  `;
}

/**
 * Client-side behaviour for the native <dialog>-based modal pattern.
 */
export function dialogScript(): string {
  return `
    <script>
      function openDialog(button) {
        const dialogId = button.dataset.openDialog;
        const dialog = dialogId ? document.getElementById(dialogId) : null;
        if (!dialog) return;

        if (typeof dialog.showModal === "function") {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }

        const firstField = dialog.querySelector("input, select, button");
        if (firstField && typeof firstField.focus === "function") firstField.focus();
      }

      function closeDialog(form) {
        const dialog = form.closest("dialog");
        if (!dialog) return;

        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }

      document.querySelectorAll("[data-open-dialog]").forEach((button) => {
        button.addEventListener("click", () => openDialog(button));
      });

      document.querySelectorAll(".dialog-close-form").forEach((form) => {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          closeDialog(form);
        });
      });
    </script>
  `;
}
