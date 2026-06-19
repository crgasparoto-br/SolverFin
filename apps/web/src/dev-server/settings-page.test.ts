import assert from "node:assert/strict";

import { renderSettingsPage } from "./settings-page.js";

const originalFetch = globalThis.fetch;

await settingsPageRendersFinancialProfileManagement();

globalThis.fetch = originalFetch;

async function settingsPageRendersFinancialProfileManagement(): Promise<void> {
  globalThis.fetch = async (input: string | URL | Request) => {
    assert.equal(String(input), "http://localhost:4000/api/financial-profiles");

    return new Response(
      JSON.stringify({
        activeProfileId: "profile-family",
        profiles: [
          { id: "profile-personal", name: "Pessoal", kind: "personal", status: "active" },
          { id: "profile-family", name: "Família", kind: "family", status: "active" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const html = await renderSettingsPage("session-token");

  assert.match(html, /Perfis financeiros/);
  assert.match(html, /Família \(selecionado\)/);
  assert.match(html, /data-api-path="\/api\/financial-profiles"/);
  assert.match(html, /data-api-method="PATCH" data-api-path="\/api\/financial-profiles\/profile-family"/);
  assert.match(html, /data-api-path="\/api\/financial-profiles\/profile-family\/archive"/);
  assert.match(html, /href="\/dashboard\?profileId=profile-family"/);
  assert.match(html, /href="\/contas\?profileId=profile-family"/);
  assert.match(html, /href="\/lancamentos\?profileId=profile-family"/);
}
