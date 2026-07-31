import assert from "node:assert/strict";

import { renderLoginPage } from "./login-page.js";

const html = renderLoginPage(undefined, undefined, { productiveOidc: true });

assert.match(html, /Continuar com acesso seguro/);
assert.match(html, /\/api\/auth\/oidc\/start\?returnTo=\/dashboard/);
assert.doesNotMatch(html, /name="password"/);
assert.doesNotMatch(html, /Criar usuário/);
assert.doesNotMatch(html, /localStorage|sessionStorage|IndexedDB/);

const cookieUnavailable = renderLoginPage("cookie-unavailable", undefined, {
  productiveOidc: true,
});
assert.match(cookieUnavailable, /navegador não manteve a sessão/);
assert.match(cookieUnavailable, /Habilite cookies/);
assert.match(cookieUnavailable, /Continuar com acesso seguro/);
