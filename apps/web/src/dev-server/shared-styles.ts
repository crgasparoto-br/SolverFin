/**
 * CSS shared by every authenticated SSR page: design tokens, base reset, the
 * authenticated shell chrome (sidebar/topbar/nav/logout) and the recurring
 * primitives (buttons, panels, forms, empty states). Page modules compose
 * this with their own page-specific rules instead of redefining the shell.
 */
export function sharedShellStyles(): string {
  return `
    :root { color-scheme: light; --bg: #f8fafc; --surface: #ffffff; --surface-soft: #eef5f8; --text: #0f172a; --muted: #475569; --line: #cbd5e1; --primary: #0f3d4c; --primary-soft: #e8f3f6; --cyan: #0891b2; --success: #166534; --success-bg: #dcfce7; --danger: #dc2626; --danger-bg: #fee2e2; --warning: #b45309; --warning-bg: #fef3c7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h1, h2, h3, p { margin: 0; } h1 { font-size: clamp(1.6rem, 4vw, 2rem); line-height: 1.15; } h2 { font-size: 1rem; line-height: 1.3; } h3 { font-size: .95rem; line-height: 1.3; } a { color: inherit; }
    button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid rgba(34, 211, 238, .55); outline-offset: 2px; }
    .panel, .metric-card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    .panel { display: grid; gap: 16px; min-width: 0; }
    .eyebrow { color: var(--cyan); font-size: .78rem; font-weight: 800; letter-spacing: 0; text-transform: uppercase; } .muted { color: var(--muted); line-height: 1.5; }
    form, label { display: grid; gap: 10px; } label { color: var(--text); font-weight: 700; } input, select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; min-height: 44px; padding: 0 12px; width: 100%; }
    button, .button-link { align-items: center; background: var(--primary); border: 0; border-radius: 8px; color: white; cursor: pointer; display: inline-flex; font: inherit; font-weight: 800; justify-content: center; min-height: 44px; padding: 0 16px; text-decoration: none; }
    button:disabled { cursor: not-allowed; opacity: .58; }
    .secondary-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); }
    .danger-action { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); }
    .error { background: var(--danger-bg); border: 1px solid #fecaca; border-radius: 8px; color: var(--danger); padding: 10px 12px; }
    .success { background: var(--success-bg); border: 1px solid #bbf7d0; border-radius: 8px; color: var(--success); padding: 10px 12px; }
    .form-status { grid-column: 1 / -1; }
    .app-shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); min-height: 100vh; } .sidebar { background: var(--primary); color: white; display: flex; flex-direction: column; gap: 22px; padding: 22px; }
    .brand { align-items: center; display: inline-flex; font-size: 1.2rem; font-weight: 900; gap: 10px; min-height: 44px; text-decoration: none; } .brand img { border-radius: 6px; display: block; } nav { display: grid; gap: 6px; } nav a { border-radius: 8px; color: rgba(255,255,255,.82); font-weight: 800; min-height: 40px; padding: 10px 12px; text-decoration: none; } nav a:hover, nav a[aria-current="page"] { background: rgba(34,211,238,.18); color: white; }
    .logout { background: rgba(255,255,255,.12); margin-top: auto; } .main-area { min-width: 0; } .topbar { align-items: center; background: rgba(255,255,255,.92); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; min-height: 64px; padding: 0 24px; position: sticky; top: 0; z-index: 5; } .topbar div { display: grid; gap: 2px; } .topbar span { color: var(--muted); font-size: .875rem; }
    .empty-state { background: var(--bg); border: 1px dashed var(--line); border-radius: 8px; display: grid; gap: 6px; padding: 16px; }
    @media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } .sidebar { gap: 12px; padding: 12px 16px; position: sticky; top: 0; z-index: 10; } .sidebar .logout { display: none; } nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; } nav a { background: rgba(255,255,255,.1); flex: 0 0 auto; min-height: 44px; white-space: nowrap; } .topbar { min-height: 56px; padding: 0 16px; position: static; } .topbar button { display: none; } main { padding: 18px 16px 28px; } }
  `;
}

/**
 * CSS for the native <dialog>-based create/edit modal pattern (see
 * dev-server/accounts-cards-page.ts for the reference implementation): the
 * dialog surface, its backdrop, the close row, and the icon buttons that
 * trigger it. Pages compose this instead of redefining the same modal chrome.
 */
export function sharedDialogStyles(): string {
  return `
    .master-dialog { border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 24px 80px rgba(15,23,42,.18); max-width: 760px; padding: 20px; width: calc(100% - 32px); } .master-dialog::backdrop { background: rgba(15,23,42,.38); } .dialog-close-form { display: flex; justify-content: flex-end; margin-bottom: 12px; } .dialog-heading { display: grid; gap: 4px; }
    .edit-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; } .edit-grid button, .edit-grid .form-status { grid-column: 1 / -1; }
    .icon-button { background: var(--primary-soft); border: 1px solid #d4e6ec; color: var(--primary); min-height: 44px; padding: 0; width: 44px; } .danger-icon-button { background: var(--danger-bg); border-color: #fecaca; color: var(--danger); } .action-icon { display: block; height: 20px; width: 20px; }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .edit-grid { grid-template-columns: 1fr; } }
  `;
}

/**
 * Client-side behaviour for the native <dialog>-based modal pattern: opens
 * the dialog referenced by a [data-open-dialog] trigger and closes it from
 * its .dialog-close-form. Pages that render modals should inline this script
 * once alongside their own page-specific script.
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
