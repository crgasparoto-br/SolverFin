import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

import {
  inboxTabRuntimeScript,
  renderInboxTabNavigation,
  renderInboxTabPanel,
  resolveInboxInitialTab,
} from "./inbox-tabs.js";

const IDS = ["reviews", "imports", "messages", "insights"] as const;

describe("Inbox subject tabs", () => {
  it("selects default and deep-link tabs without losing existing query parameters", () => {
    assert.equal(resolveInboxInitialTab(), "reviews");
    assert.equal(resolveInboxInitialTab(new URL("http://localhost:5173/inbox")), "reviews");
    assert.equal(
      resolveInboxInitialTab(new URL("http://localhost:5173/inbox?importBatchId=batch-1")),
      "imports",
    );
    assert.equal(
      resolveInboxInitialTab(
        new URL("http://localhost:5173/inbox?tab=messages&importBatchId=batch-1"),
      ),
      "messages",
    );
    assert.equal(
      resolveInboxInitialTab(new URL("http://localhost:5173/inbox?tab=unknown&profileId=p1")),
      "reviews",
    );
  });

  it("renders exactly four linked ARIA tabs and only one visible panel", () => {
    const nav = renderInboxTabNavigation("reviews");
    assert.match(nav, /role="tablist" aria-label="Assuntos da Inbox"/);
    assert.equal((nav.match(/role="tab"/g) ?? []).length, 4);
    assert.equal((nav.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.equal((nav.match(/tabindex="0"/g) ?? []).length, 1);
    const panels = IDS.map((id) => renderInboxTabPanel(id, "<p>Teste</p>", "reviews")).join("");
    assert.equal((panels.match(/role="tabpanel"/g) ?? []).length, 4);
    assert.equal((panels.match(/ hidden>/g) ?? []).length, 3);
    IDS.forEach((id) => {
      assert.match(nav, new RegExp('aria-controls="inbox-panel-' + id + '"'));
      assert.match(panels, new RegExp('aria-labelledby="inbox-tab-' + id + '"'));
    });
  });

  it("changes panels by click and keyboard while respecting URL, history and anchors", () => {
    const listeners = new Map<string, () => void>();
    const panels = new Map<string, MockPanel>(
      IDS.map((id) => [id, { dataset: { inboxTabPanel: id }, hidden: id !== "reviews" }]),
    );
    const tabs: MockTab[] = IDS.map((id) => {
      const callbacks = new Map<string, (event: MockEvent) => void>();
      return {
        dataset: { inboxTab: id },
        attributes: { "aria-selected": id === "reviews" ? "true" : "false" } as Record<string, string>,
        tabIndex: id === "reviews" ? 0 : -1,
        addEventListener(name, handler) { callbacks.set(name, handler); },
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { focused = id; },
        click() { callbacks.get("click")?.({ key: "", preventDefault() {} }); },
        fire(name, key) { callbacks.get(name)?.({ key, preventDefault() { prevented = true; } }); },
      };
    });
    let focused = "";
    let prevented = false;
    let scrolls = 0;
    let href = "http://localhost:5173/inbox?profileId=profile-a&lineStart=2026-11-01";
    const elements = new Map([
      [
        "financial-insights",
        {
          closest: (selector: string) =>
            selector === "[data-inbox-tab-panel]"
              ? panels.get("insights")
              : panels.get("insights")?.hidden
                ? panels.get("insights")
                : null,
          scrollIntoView() { scrolls += 1; },
        },
      ],
    ]);
    const window = {
      get location() { return new URL(href); },
      history: {
        pushState(_state: unknown, _title: string, path: string) {
          href = new URL(path, href).href;
        },
      },
      addEventListener(name: string, handler: () => void) { listeners.set(name, handler); },
    };
    const document = {
      querySelector: () => ({ querySelectorAll: () => tabs }),
      querySelectorAll: () => Array.from(panels.values()),
      getElementById: (id: string) => elements.get(id) ?? null,
    };
    const runtime = inboxTabRuntimeScript()
      .replace(/^\s*<script[^>]*>/, "")
      .replace(/<\/script>\s*$/, "");
    runInNewContext(runtime, {
      document,
      window,
      URL,
      URLSearchParams,
      requestAnimationFrame: (fn: () => void) => fn(),
    });

    tabs[1]!.click();
    assert.equal(panels.get("imports")?.hidden, false);
    assert.equal(panels.get("reviews")?.hidden, true);
    assert.equal(tabs[1]!.attributes["aria-selected"], "true");
    assert.equal(tabs[1]!.tabIndex, 0);
    assert.equal(new URL(href).searchParams.get("profileId"), "profile-a");
    assert.equal(new URL(href).searchParams.get("lineStart"), "2026-11-01");
    assert.equal(new URL(href).searchParams.get("tab"), "imports");

    tabs[1]!.fire("keydown", "ArrowRight");
    assert.equal(prevented, true);
    assert.equal(focused, "messages");
    assert.equal(panels.get("messages")?.hidden, false);
    tabs[2]!.fire("keydown", "End");
    assert.equal(focused, "insights");
    assert.equal(panels.get("insights")?.hidden, false);
    tabs[3]!.fire("keydown", "Home");
    assert.equal(focused, "reviews");
    assert.equal(panels.get("reviews")?.hidden, false);

    href = "http://localhost:5173/inbox?profileId=profile-a#financial-insights";
    listeners.get("popstate")?.();
    assert.equal(panels.get("insights")?.hidden, false);
    assert.equal(scrolls, 1);
    assert.equal(IDS.filter((id) => !panels.get(id)?.hidden).length, 1);

    href = "http://localhost:5173/inbox?importBatchId=batch-1";
    listeners.get("popstate")?.();
    assert.equal(panels.get("imports")?.hidden, false);
  });
});

interface MockEvent {
  key: string;
  preventDefault(): void;
}

interface MockPanel {
  dataset: { inboxTabPanel: string };
  hidden: boolean;
}

interface MockTab {
  dataset: { inboxTab: string };
  attributes: Record<string, string>;
  tabIndex: number;
  addEventListener(name: string, handler: (event: MockEvent) => void): void;
  setAttribute(name: string, value: string): void;
  focus(): void;
  click(): void;
  fire(name: string, key: string): void;
}
