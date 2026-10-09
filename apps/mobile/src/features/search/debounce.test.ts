import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDebouncer,
  normalizeSearch,
  SEARCH_DELAY_MS,
  shownQuery,
} from "./debounce.ts";

function debounced() {
  const settled = new Array<string>();
  const debouncer = createDebouncer({ settle: (value) => settled.push(value) });
  return { debouncer, settled };
}

void test("settles only once typing pauses, with the last text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { debouncer, settled } = debounced();
  debouncer.push("m");
  t.mock.timers.tick(SEARCH_DELAY_MS - 1);
  debouncer.push("ma");
  t.mock.timers.tick(SEARCH_DELAY_MS - 1);
  debouncer.push("may");
  assert.deepEqual(settled, []);
  t.mock.timers.tick(SEARCH_DELAY_MS);
  assert.deepEqual(settled, ["may"]);
});

void test("settles empty text at once, dropping pending text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { debouncer, settled } = debounced();
  debouncer.push("maya");
  debouncer.push("  ");
  assert.deepEqual(settled, [""]);
  t.mock.timers.tick(SEARCH_DELAY_MS * 2);
  assert.deepEqual(settled, [""]);
});

void test("cancel drops pending text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { debouncer, settled } = debounced();
  debouncer.push("maya");
  debouncer.cancel();
  t.mock.timers.tick(SEARCH_DELAY_MS * 2);
  assert.deepEqual(settled, []);
});

void test("keeps the settled query on screen while the next loads", () => {
  assert.equal(
    shownQuery({ isLoading: true, query: "mayb", settled: "may" }),
    "may",
  );
  assert.equal(
    shownQuery({ isLoading: false, query: "mayb", settled: "may" }),
    "mayb",
  );
});

void test("matches text trimmed and lowercased", () => {
  assert.equal(normalizeSearch("  Maya@Dev "), "maya@dev");
});
