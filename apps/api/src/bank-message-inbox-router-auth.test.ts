import assert from "node:assert/strict";

import { buildAuthHeaders } from "./bank-message-inbox-router.js";

assert.deepEqual(
  buildAuthHeaders({
    authorization: "Bearer internal-session-token",
    cookie: "__Host-solverfin_session=opaque-session-token",
  }),
  {
    authorization: "Bearer internal-session-token",
    cookie: "__Host-solverfin_session=opaque-session-token",
  },
  "productive cookie and internal authorization must both survive router revalidation",
);

assert.deepEqual(
  buildAuthHeaders({ cookie: "solverfin_session=local-session-token" }),
  { cookie: "solverfin_session=local-session-token" },
  "cookie-only authentication must remain available",
);

assert.deepEqual(
  buildAuthHeaders({ authorization: "Bearer demo-session-token" }),
  { authorization: "Bearer demo-session-token" },
  "local demo bearer compatibility must remain available",
);
