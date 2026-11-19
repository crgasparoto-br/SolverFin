/**
 * Inbox-specific panel tabs. The shared renderTabs primitive is for page navigation
 * (links with aria-current); these in-place panels need the ARIA tab pattern.
 */
export type InboxTab = "reviews" | "imports" | "messages" | "insights";

const TABS: ReadonlyArray<{ id: InboxTab; label: string }> = [
  { id: "reviews", label: "Revisões" },
  { id: "imports", label: "Importações" },
  { id: "messages", label: "Mensagens" },
  { id: "insights", label: "Insights" },
];

function isInboxTab(value: string | null): value is InboxTab {
  return TABS.some((tab) => tab.id === value);
}

/** Query-based navigation works on the first SSR response, even before JS. */
export function resolveInboxInitialTab(url?: URL): InboxTab {
  const requested = url?.searchParams.get("tab") ?? null;
  if (isInboxTab(requested)) return requested;
  return url?.searchParams.has("importBatchId") ? "imports" : "reviews";
}

export function renderInboxTabNavigation(active: InboxTab): string {
  const controls = TABS.map((tab) => {
    const selected = tab.id === active;
    return (
      '<button type="button" class="sf-tab sf-focus-ring inbox-tab" data-button-variant="neutral" role="tab" id="inbox-tab-' +
      tab.id +
      '" data-inbox-tab="' +
      tab.id +
      '" aria-controls="inbox-panel-' +
      tab.id +
      '" aria-selected="' +
      selected +
      '" tabindex="' +
      (selected ? "0" : "-1") +
      '">' +
      tab.label +
      "</button>"
    );
  }).join("");
  return '<div class="sf-tabs inbox-tab-list" role="tablist" aria-label="Assuntos da Inbox">' + controls + "</div>";
}

export function renderInboxTabPanel(id: InboxTab, html: string, active: InboxTab): string {
  return (
    '<section id="inbox-panel-' +
    id +
    '" class="inbox-tab-panel" role="tabpanel" aria-labelledby="inbox-tab-' +
    id +
    '" data-inbox-tab-panel="' +
    id +
    '" tabindex="0"' +
    (id === active ? "" : " hidden") +
    ">" +
    html +
    "</section>"
  );
}

export function inboxTabStyles(): string {
  return `
    .inbox-tab-list.sf-tabs {
      border-bottom: 1px solid var(--sf-color-border);
      gap: var(--sf-space-1);
      overflow-x: auto;
      overscroll-behavior-x: contain;
      padding: 0;
      scrollbar-width: thin;
    }
    .inbox-tab-list .inbox-tab.sf-tab {
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      color: var(--sf-color-muted-text);
      cursor: pointer;
      font: inherit;
      font-size: var(--sf-font-size-sm);
      font-weight: var(--sf-font-weight-semibold);
      min-height: var(--sf-density-interactive-target-min);
      padding: var(--sf-space-3) var(--sf-space-4);
      white-space: nowrap;
    }
    .inbox-tab-list .inbox-tab.sf-tab:hover:not(:disabled),
    .inbox-tab-list .inbox-tab.sf-tab:focus-visible {
      background: var(--sf-color-neutral-control-hover);
      border-bottom-color: var(--sf-color-neutral-control-border-hover);
      color: var(--sf-color-neutral-control-text-hover);
    }
    .inbox-tab-list .inbox-tab.sf-tab:focus-visible {
      box-shadow: var(--sf-shadow-focus);
      outline: none;
    }
    .inbox-tab-list .inbox-tab.sf-tab:active:not(:disabled) {
      background: var(--sf-color-neutral-control-active-hover);
    }
    .inbox-tab-list .inbox-tab.sf-tab[aria-selected="true"] {
      background: var(--sf-color-primary-soft);
      border-bottom-color: var(--sf-color-primary);
      color: var(--sf-color-primary);
    }
    .inbox-tab-list .inbox-tab.sf-tab:disabled {
      background: var(--sf-color-neutral-control-hover);
      color: var(--sf-color-muted-text);
      cursor: not-allowed;
    }
    .inbox-tab-panel { display: grid; gap: var(--sf-space-4); min-width: 0; padding-block: var(--sf-space-3); }
    .inbox-tab-panel[hidden] { display: none !important; }
    .inbox-tab-panel:focus-visible { outline: 2px solid var(--sf-color-primary); outline-offset: 2px; }
    .inbox-tab-toolbar { align-items: center; display: flex; flex-wrap: wrap; gap: var(--sf-space-3); justify-content: space-between; }
    .inbox-tab-toolbar p { color: var(--sf-color-muted-text); font-size: var(--sf-font-size-sm); margin: 0; }
    .inbox-tab-toolbar button { min-height: var(--sf-density-interactive-target-min); }
    @media (max-width: 600px) {
      .inbox-tab-list .inbox-tab.sf-tab { padding-inline: var(--sf-space-3); }
      .inbox-tab-toolbar { align-items: start; flex-direction: column; }
    }
  `;
}

/** Keep panels in the DOM: controllers may have pending state in inactive areas. */
export function inboxTabRuntimeScript(): string {
  return String.raw`
    <script data-inbox-tab-runtime="true">
      (() => {
        const list = document.querySelector('.inbox-tab-list[role="tablist"]');
        if (!list) return;
        const tabs = Array.from(list.querySelectorAll('[role="tab"][data-inbox-tab]'));
        const panels = new Map(
          Array.from(document.querySelectorAll('[data-inbox-tab-panel]'))
            .map((panel) => [panel.dataset.inboxTabPanel, panel]),
        );
        const valid = (id) => panels.has(id) && tabs.some((tab) => tab.dataset.inboxTab === id);
        const hashId = () => {
          try { return decodeURIComponent(window.location.hash.slice(1)); }
          catch { return ""; }
        };
        const hashTab = () => {
          const id = hashId();
          if (!id) return null;
          const owner = document.getElementById(id)?.closest('[data-inbox-tab-panel]');
          if (owner && valid(owner.dataset.inboxTabPanel)) return owner.dataset.inboxTabPanel;
          if (id === "inbox-review-secondary" || id === "inbox-messages") return "messages";
          if (id === "inbox-imports") return "imports";
          return null;
        };
        const fromLocation = () => {
          const anchor = hashTab();
          if (anchor) return anchor;
          const params = new URLSearchParams(window.location.search);
          const requested = params.get("tab");
          if (valid(requested)) return requested;
          return params.has("importBatchId") ? "imports" : "reviews";
        };
        const activate = (id, updateUrl) => {
          if (!valid(id)) return;
          tabs.forEach((tab) => {
            const chosen = tab.dataset.inboxTab === id;
            tab.setAttribute("aria-selected", String(chosen));
            tab.tabIndex = chosen ? 0 : -1;
          });
          panels.forEach((panel, name) => { panel.hidden = name !== id; });
          if (!updateUrl) return;
          const url = new URL(window.location.href);
          url.searchParams.set("tab", id);
          if (url.hash && hashTab() !== id) url.hash = "";
          window.history.pushState({ inboxTab: id }, "", url.pathname + url.search + url.hash);
        };
        const revealHash = () => {
          const id = hashId();
          if (!id) return;
          requestAnimationFrame(() => {
            const target = document.getElementById(id);
            if (target && !target.closest('[hidden]')) target.scrollIntoView({ block: "start" });
          });
        };
        tabs.forEach((tab, index) => {
          tab.addEventListener("click", () => activate(tab.dataset.inboxTab, true));
          tab.addEventListener("keydown", (event) => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = tabs.length - 1;
            else return;
            event.preventDefault();
            tabs[next].focus();
            tabs[next].click();
          });
        });
        const syncLocation = () => {
          activate(fromLocation(), false);
          if (hashTab()) revealHash();
        };
        window.addEventListener("popstate", syncLocation);
        window.addEventListener("hashchange", syncLocation);
        syncLocation();
      })();
    </script>
  `;
}
