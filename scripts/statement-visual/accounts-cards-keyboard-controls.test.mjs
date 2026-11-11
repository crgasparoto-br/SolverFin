import assert from "node:assert/strict";
import test from "node:test";
import { pressEnter, pressEscape } from "./accounts-cards-keyboard-controls.mjs";

function createRecorder() {
  const events = [];
  return {
    events,
    cdp: {
      async send(method, payload) {
        assert.equal(method, "Input.dispatchKeyEvent");
        events.push(payload);
      },
    },
  };
}

test("A3 Escape dispatches key down and up", async () => {
  const { cdp, events } = createRecorder();
  await pressEscape(cdp);
  assert.deepEqual(events.map(({ type, key, code }) => ({ type, key, code })), [
    { type: "rawKeyDown", key: "Escape", code: "Escape" },
    { type: "keyUp", key: "Escape", code: "Escape" },
  ]);
  assert.deepEqual(events.map((event) => event.windowsVirtualKeyCode), [27, 27]);
  assert.deepEqual(events.map((event) => event.nativeVirtualKeyCode), [27, 27]);
});

test("A3 Enter dispatches down, carriage return and up", async () => {
  const { cdp, events } = createRecorder();
  await pressEnter(cdp);
  assert.deepEqual(events.map(({ type, key, code }) => ({ type, key, code })), [
    { type: "rawKeyDown", key: "Enter", code: "Enter" },
    { type: "char", key: "Enter", code: "Enter" },
    { type: "keyUp", key: "Enter", code: "Enter" },
  ]);
  assert.equal(events[1].text, "\r");
  assert.deepEqual(events.map((event) => event.windowsVirtualKeyCode), [13, 13, 13]);
  assert.deepEqual(events.map((event) => event.nativeVirtualKeyCode), [13, 13, 13]);
});
