import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  renderStatementListArchetype,
  statementListArchetypeStyles,
} from "./statement-list-archetype.js";

test("statement A2 exposes active-profile runtime and keyboard listbox controls", () => {
  const html = renderStatementListArchetype({
    actionsHtml: '<button type="button">Nova receita</button>',
    filtersHtml:
      '<div data-account-picker><button type="button" data-account-trigger aria-expanded="false">Conta</button><ul data-account-menu role="listbox" hidden><li role="option" tabindex="-1" data-account-option="account-a" aria-selected="true">Conta A</li><li role="option" tabindex="-1" data-account-option="account-b" aria-selected="false">Conta B</li></ul></div>',
    contextHtml:
      '<section class="statement-context"><strong>Conta A</strong><div class="statement-context-meta"><span data-context="currency">BRL</span></div></section>',
    summaryHtml: "<aside>Resumo</aside>",
    listHtml: "<section>Movimentações</section>",
  });

  assert.match(html, /data-statement-profile-context-template/);
  assert.match(html, /data-statement-a2-context-runtime="true"/);
  assert.match(html, /Perfil: carregando/);
  assert.match(html, /\/api\/financial-profiles/);
  assert.match(html, /activeProfileId/);
  assert.match(html, /ArrowDown/);
  assert.match(html, /ArrowUp/);
  assert.match(html, /event\.key === 'Enter'/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /current\.click\(\)/);
  assert.match(statementListArchetypeStyles(), /account-select-menu li:focus-visible/);
});

test("statement A2 keeps action menus in a viewport-aware layer", () => {
  const html = renderStatementListArchetype({
    actionsHtml: '<button type="button">Nova receita</button>',
    filtersHtml: "<div>Filtros</div>",
    contextHtml: '<section class="statement-context">Conta</section>',
    summaryHtml: "<aside>Resumo</aside>",
    listHtml: `<section class="statement-row statement-body">
      <details class="actions col-actions"><summary aria-label="Ações do lançamento">•••</summary><div class="actions-menu" role="menu"><button type="button" class="actions-item">Editar</button></div></details>
    </section>`,
  });

  assert.match(html, /data-statement-action-menus-runtime="true"/);
  assert.match(html, /getBoundingClientRect\(\)/);
  assert.match(html, /const below = triggerRect\.bottom/);
  assert.match(html, /const above = triggerRect\.top/);
  assert.match(html, /document\.body\.appendChild\(state\.menu\)/);
  assert.match(html, /const actionMenuObserver = new MutationObserver/);
  assert.match(html, /actionMenuObserver\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /window\.addEventListener\('scroll', schedulePosition, true\)/);
  assert.match(
    statementListArchetypeStyles(),
    /\[data-statement-action-menu-fixed\]\.actions-menu[^\n]*position: fixed !important/,
  );
  assert.match(statementListArchetypeStyles(), /max-height: calc\(100vh - 16px\)/);
});

function preferenceScript(): string {
  const html = renderStatementListArchetype({
    actionsHtml: "",
    filtersHtml:
      '<form class="filter-form"><div data-account-picker><input data-account-input value="account-a"><ul data-account-menu><li data-account-option="all" data-account-currency=""></li><li data-account-option="account-a" data-account-currency="BRL"></li><li data-account-option="account-b" data-account-currency="BRL"></li><li data-account-option="account-usd" data-account-currency="USD"></li></ul></div></form>',
    contextHtml: '<section class="statement-context">Conta</section>',
    summaryHtml: "",
    listHtml: "",
  });
  const match =
    /<script data-statement-account-preference-runtime="true">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "Account preference runtime must be present in the Golden Screen");
  return match[1]!;
}

interface PreferenceCase {
  url?: string;
  userId?: string;
  profileId?: string;
  current?: string;
  stored?: Map<string, string>;
  options?: string[];
  failAuth?: boolean;
}

async function runPreferenceCase(config: PreferenceCase = {}) {
  const url = config.url ?? "http://solverfin.test/lancamentos";
  const storage = config.stored ?? new Map<string, string>();
  const options = config.options ?? ["all", "account-a", "account-b", "account-usd"];
  const currencyById: Record<string, string> = {
    all: "",
    "account-a": "BRL",
    "account-b": "BRL",
    "account-usd": "USD",
  };
  const inputListeners: Array<() => void> = [];
  const formListeners: Array<(event: { preventDefault(): void }) => void> = [];
  let submitted = 0;
  let prevented = false;
  let replaced: string | undefined;
  const input = {
    value: config.current ?? "account-a",
    addEventListener(_type: string, handler: () => void) {
      inputListeners.push(handler);
    },
  };
  const listbox = {
    querySelectorAll() {
      return options.map((id) => ({
        dataset: { accountOption: id, accountCurrency: currencyById[id] },
      }));
    },
  };
  const form = {
    addEventListener(_type: string, handler: (event: { preventDefault(): void }) => void) {
      formListeners.push(handler);
    },
    submit() {
      submitted += 1;
    },
  };
  const picker = {
    querySelector(selector: string) {
      if (selector === "[data-account-input]") return input;
      if (selector === "[data-account-menu]") return listbox;
      return null;
    },
    closest(selector: string) {
      return selector === "form" ? form : null;
    },
  };
  const document = {
    querySelector(selector: string) {
      return selector === '[data-statement-archetype="A2"]'
        ? { querySelector: () => picker }
        : null;
    },
  };
  const window = {
    location: {
      href: url,
      replace(next: string) {
        replaced = next;
      },
    },
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    },
  };
  const fetch = async (path: string) => ({
    ok: !config.failAuth,
    json: async () =>
      path.startsWith("/api/me")
        ? { user: { id: config.userId ?? "user-one" } }
        : { activeProfileId: config.profileId ?? "profile-personal" },
  });
  runInNewContext(preferenceScript(), { document, window, fetch, URL });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return {
    storage,
    get replaced() {
      return replaced;
    },
    select(accountId: string) {
      input.value = accountId;
      inputListeners.forEach((listener) => listener());
      formListeners.forEach((listener) =>
        listener({
          preventDefault() {
            prevented = true;
          },
        }),
      );
      return { submitted, prevented };
    },
  };
}

test("Golden Screen persists the account across logout/login for the same user and profile", async () => {
  const storage = new Map<string, string>();
  const first = await runPreferenceCase({
    url: "http://solverfin.test/lancamentos?accountId=account-b&month=2026-10",
    current: "account-b",
    stored: storage,
  });
  assert.equal(first.replaced, undefined);
  assert.equal(
    storage.get("solverfin:statement:last-account:v1:user-one:profile-personal"),
    "account-b",
  );

  // The session has ended; a fresh login renders the default account first.
  const second = await runPreferenceCase({
    url: "http://solverfin.test/lancamentos?month=2026-10",
    stored: storage,
  });
  assert.equal(second.replaced, "/lancamentos?month=2026-10&accountId=account-b");
});

test("Golden Screen account preference is isolated by user and profile", async () => {
  const storage = new Map([
    ["solverfin:statement:last-account:v1:user-one:profile-personal", "account-b"],
  ]);
  const userTwo = await runPreferenceCase({ stored: storage, userId: "user-two" });
  assert.equal(userTwo.replaced, undefined);
  const business = await runPreferenceCase({ stored: storage, profileId: "profile-business" });
  assert.equal(business.replaced, undefined);
  const failedAuth = await runPreferenceCase({ stored: storage, failAuth: true });
  assert.equal(failedAuth.replaced, undefined);
});

test("Golden Screen explicit account overrides memory, all accounts is remembered and obsolete IDs expire", async () => {
  const key = "solverfin:statement:last-account:v1:user-one:profile-personal";
  const storage = new Map([[key, "account-b"]]);
  const explicit = await runPreferenceCase({
    url: "http://solverfin.test/lancamentos?accountId=all&month=2026-10",
    stored: storage,
    current: "all",
  });
  assert.equal(explicit.replaced, undefined);
  assert.equal(storage.get(key), "all");
  const consolidated = await runPreferenceCase({ stored: storage });
  assert.equal(consolidated.replaced, "/lancamentos?accountId=all");

  storage.set(key, "account-archived");
  const archived = await runPreferenceCase({ stored: storage });
  assert.equal(archived.replaced, undefined);
  assert.equal(storage.has(key), false);
});

test("Golden Screen account change is stored before form navigation without replacing currency filters", async () => {
  const key = "solverfin:statement:last-account:v1:user-one:profile-personal";
  const storage = new Map([[key, "account-b"]]);
  const changed = await runPreferenceCase({
    url: "http://solverfin.test/lancamentos?accountId=account-a",
    stored: storage,
  });
  changed.select("account-usd");
  assert.equal(storage.get(key), "account-usd");
  const currencyConflict = await runPreferenceCase({
    url: "http://solverfin.test/lancamentos?currency=BRL",
    stored: storage,
  });
  assert.equal(currencyConflict.replaced, undefined);
});
