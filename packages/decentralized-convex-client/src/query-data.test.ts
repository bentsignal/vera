import assert from "node:assert/strict";
import test from "node:test";

import { mapPdsQueryData, pdsQueryDataFromSnapshot } from "./query-data.ts";

const target = { ids: ["alice@example.com"], url: "https://example.com" };

void test("distinguishes a loaded undefined result from loading", () => {
  const data = pdsQueryDataFromSnapshot({
    data: undefined,
    sources: [{ data: undefined, status: "live", target }],
    status: "success",
  });

  assert.deepEqual(data, { result: undefined, status: "success" });
});

void test("maps only available query results", () => {
  assert.deepEqual(
    mapPdsQueryData({ result: [1, 2], status: "partial" }, (values) =>
      values.map(String),
    ),
    { result: ["1", "2"], status: "partial" },
  );
  assert.deepEqual(
    mapPdsQueryData({ status: "loading" }, () => "unreachable"),
    { status: "loading" },
  );
});
