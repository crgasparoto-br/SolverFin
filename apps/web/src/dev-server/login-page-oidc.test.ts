import assert from "node:assert/strict";

import { renderLoginPage } from "./login-page.js";

const html = renderLoginPage(undefined, undefined, { productiveOidc: true });

assert.match(html, /Continuar com acesso seguro/);
assert.match(html, /\/api\/auth\/oidc\/start\?returnTo=\/dashboard/);
assert.doesNotMatch(html, /name="password"/);
assert.doesNotMatch(html, /Criar usuário/);
assert.doesNotMatch(html, /localStorage|sessionStorage|IndexedDB/);
