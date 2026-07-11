/**
 * CSS shared by every authenticated SSR page: design tokens, base reset, the
 * authenticated shell chrome (sidebar/topbar/nav/logout) and the recurring
 * primitives (buttons, panels, forms, empty states). Page modules compose
 * this with their own page-specific rules instead of redefining the shell.
 *
 * Visual refresh: compact typography (base 14px), tighter spacing, modern
 * sidebar with icon+label nav links, subtle shadows and refined button styles.
 */
export function sharedShellStyles(): string {
  return `
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-soft: #eef5f8;
      --text: #0f172a;
      --muted: #475569;
      --line: #e2e8f0;
      --primary: #0f3d4c;
      --primary-soft: #e8f3f6;
      --primary-hover: #0a2e3a;
      --cyan: #0891b2;
      --cyan-soft: #cffafe;
      --success: #166534;
      --success-bg: #dcfce7;
      --danger: #dc2626;
      --danger-bg: #fee2e2;
      --warning: #b45309;
      --warning-bg: #fef3c7;
      --radius: 6px;
      --radius-lg: 8px;
      --shadow-sm: 0 1px 3px rgba(15,23,42,.07), 0 1px 2px rgba(15,23,42,.05);
      --shadow-focus: 0 0 0 3px rgba(34,211,238,.35);
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 0.875rem;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, h4, p { margin: 0; }
    h1 { font-size: clamp(1.15rem, 2.5vw, 1.375rem); line-height: 1.2; font-weight: 700; }
    h2 { font-size: 0.9375rem; font-weight: 700; line-height: 1.3; }
    h3 { font-size: 0.875rem; font-weight: 600; line-height: 1.3; }
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
      padding: 14px 16px;
      box-shadow: var(--shadow-sm);
    }
    .panel { display: grid; gap: 12px; min-width: 0; }

    /* ── Eyebrow / muted ── */
    .eyebrow {
      color: var(--cyan);
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .muted { color: var(--muted); line-height: 1.5; }

    /* ── Forms ── */
    form { display: grid; gap: 10px; }
    label { display: grid; gap: 6px; color: var(--text); font-weight: 600; font-size: 0.8125rem; }
    input, select, textarea {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      color: var(--text);
      font: inherit;
      min-height: 36px;
      padding: 0 10px;
      width: 100%;
      transition: border-color 120ms ease-out, box-shadow 120ms ease-out;
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
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 6px;
      justify-content: center;
      min-height: 34px;
      padding: 0 12px;
      text-decoration: none;
      transition: background 120ms ease-out, box-shadow 120ms ease-out, opacity 120ms ease-out;
      white-space: nowrap;
    }
    button:hover:not(:disabled), .button-link:hover { background: var(--primary-hover); }
    button:disabled { cursor: not-allowed; opacity: 0.5; }
    .secondary-button {
      background: var(--surface);
      border-color: var(--line);
      color: var(--primary);
    }
    .secondary-button:hover:not(:disabled) { background: var(--primary-soft); border-color: #c8dde5; }
    .danger-action {
      background: var(--danger-bg);
      border-color: #fecaca;
      color: var(--danger);
    }
    .danger-action:hover:not(:disabled) { background: #fecaca; }

    /* ── Feedback ── */
    .error {
      background: var(--danger-bg);
      border: 1px solid #fecaca;
      border-radius: var(--radius);
      color: var(--danger);
      font-size: 0.8125rem;
      padding: 8px 10px;
    }
    .success {
      background: var(--success-bg);
      border: 1px solid #bbf7d0;
      border-radius: var(--radius);
      color: var(--success);
      font-size: 0.8125rem;
      padding: 8px 10px;
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
      font-size: 1rem;
      font-weight: 800;
      gap: 8px;
      min-height: 36px;
      text-decoration: none;
      padding: 4px 6px;
      border-radius: var(--radius);
      margin-bottom: 8px;
    }
    .brand img { border-radius: 5px; display: block; }

    /* ── Nav ── */
    nav { display: grid; gap: 2px; flex: 1; }
    nav a {
      align-items: center;
      border-radius: var(--radius);
      color: rgba(255,255,255,.75);
      display: flex;
      font-size: 0.8125rem;
      font-weight: 500;
      gap: 8px;
      min-height: 34px;
      padding: 0 8px;
      text-decoration: none;
      transition: background 120ms ease-out, color 120ms ease-out;
    }
    nav a:hover { background: rgba(255,255,255,.1); color: white; }
    nav a[aria-current="page"] {
      background: rgba(34,211,238,.18);
      color: white;
      font-weight: 600;
    }
    nav a svg { flex-shrink: 0; opacity: 0.85; }
    nav a[aria-current="page"] svg { opacity: 1; }

    /* ── Nav section headings ── */
    .nav-section-label {
      color: rgba(255,255,255,.4);
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 10px 8px 4px;
      text-transform: uppercase;
    }

    .nav-more-toggle { display: none; }

    /* ── Logout ── */
    .logout {
      background: rgba(255,255,255,.1);
      border: 1px solid rgba(255,255,255,.12);
      color: rgba(255,255,255,.8);
      font-size: 0.8125rem;
      margin-top: auto;
      width: 100%;
    }
    .logout:hover { background: rgba(255,255,255,.18); color: white; }

    /* ── Main area ── */
    .main-area { min-width: 0; display: flex; flex-direction: column; }

    /* ── Topbar ── */
    .topbar {
      align-items: center;
      background: rgba(255,255,255,.96);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      min-height: 52px;
      padding: 0 20px;
      position: sticky;
      top: 0;
      z-index: 5;
      box-shadow: var(--shadow-sm);
    }
    .topbar div { display: grid; gap: 1px; }
    .topbar strong { font-size: 0.875rem; font-weight: 700; }
    .topbar span { color: var(--muted); font-size: 0.75rem; }
    .topbar > button {
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.8125rem;
      gap: 5px;
      min-height: 30px;
      padding: 0 10px;
    }
    .topbar > button:hover { color: var(--danger); border-color: #fecaca; background: var(--danger-bg); }

    /* ── Empty state ── */
    .empty-state {
      background: var(--bg);
      border: 1px dashed var(--line);
      border-radius: var(--radius-lg);
      display: grid;
      gap: 4px;
      padding: 14px 16px;
    }
    .empty-state strong { font-size: 0.875rem; }
    .empty-state p { font-size: 0.8125rem; color: var(--muted); }

    /* ── Mobile ── */
    @media (max-width: 760px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar {
        flex-direction: row;
        flex-wrap: nowrap;
        gap: 4px;
        height: auto;
        overflow-x: auto;
        padding: 8px 12px;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .sidebar .logout { display: none; }
      .brand { margin-bottom: 0; }
      nav { display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
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
        font-size: 0.8125rem;
        font-weight: 600;
        justify-content: center;
        min-height: 34px;
        order: 2;
        padding: 0 10px;
        white-space: nowrap;
      }
      .nav-more-toggle:hover, .nav-more-toggle[aria-expanded="true"] { background: rgba(34,211,238,.18); color: white; }
      .topbar { min-height: 48px; padding: 0 14px; position: static; }
      .topbar > button { display: none; }
      main { padding: 14px 14px 24px; }
    }
  `;
}

/**
 * CSS for the native <dialog>-based create/edit modal pattern.
 */
export function sharedDialogStyles(): string {
  return `
    .master-dialog {
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      box-shadow: 0 24px 80px rgba(15,23,42,.18);
      max-width: 720px;
      padding: 18px;
      width: calc(100% - 32px);
    }
    .master-dialog::backdrop { background: rgba(15,23,42,.42); }
    .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .dialog-heading { display: grid; gap: 3px; }
    .dialog-heading h2 { font-size: 1rem; }
    .dialog-heading p { font-size: 0.8125rem; color: var(--muted); }
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
      min-height: 30px;
      padding: 0;
      width: 30px;
      transition: background 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
    }
    .icon-button:hover { background: var(--primary-soft); border-color: #c8dde5; }
    .danger-icon-button {
      background: var(--surface);
      border-color: var(--line);
      color: var(--muted);
    }
    .danger-icon-button:hover { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .action-icon { display: block; height: 15px; width: 15px; }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .edit-grid { grid-template-columns: 1fr; } }
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
