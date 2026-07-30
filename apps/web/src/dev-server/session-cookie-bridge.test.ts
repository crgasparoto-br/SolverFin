import assert from "node:assert/strict";

import {
  buildUpstreamAuthenticationHeaders,
  clearApiSessionCookies,
  clearSessionCookie,
} from "./session.js";

const productiveCookie = `__Host-solverfin_session=${"A".repeat(43)}`;
assert.deepEqual(buildUpstreamAuthenticationHeaders(productiveCookie), {
  cookie: productiveCookie,
});
assert.deepEqual(buildUpstreamAuthenticationHeaders("local-token"), {
  authorization: "Bearer local-token",
});

const cleared = clearApiSessionCookies();
assert.equal(cleared.length, 2);
assert.match(cleared[0] ?? "", /^__Host-solverfin_session=;/);
assert.match(cleared[0] ?? "", /Secure/);
assert.match(cleared[0] ?? "", /Max-Age=0/);
assert.match(cleared[1] ?? "", /^solverfin_session=;/);
assert.doesNotMatch(cleared[1] ?? "", /Secure/);
assert.match(clearSessionCookie(), /^sf_session_token=;/);
