import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeNotificationVisualDatabase } from "./notification-populated-fixtures.mjs";

const disposable = {
  NODE_ENV: "development",
  AUTH_ALLOW_DEMO: "true",
  DATABASE_URL:
    "postgresql://solverfin:placeholder@localhost:5432/solverfin_visual?schema=public",
};

test("populated Chrome fixtures are allowed only in disposable local demo database", () => {
  assert.doesNotThrow(() => assertSafeNotificationVisualDatabase(disposable));
  for (const environment of [
    { ...disposable, NODE_ENV: "production" },
    { ...disposable, AUTH_ALLOW_DEMO: "false" },
    { ...disposable, DATABASE_URL: undefined },
    { ...disposable, DATABASE_URL: "postgresql://u:p@remote.example.invalid/solverfin_visual" },
    { ...disposable, DATABASE_URL: "postgresql://u:p@localhost/solverfin" },
    { ...disposable, DATABASE_URL: "file:///tmp/solverfin_visual" },
  ]) {
    assert.throws(() => assertSafeNotificationVisualDatabase(environment));
  }
});
