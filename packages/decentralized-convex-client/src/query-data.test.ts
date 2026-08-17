import assert from "node:assert/strict";
import test from "node:test";

import { mapPdsQueryData, pdsQueryDataFromSnapshot } from "./query-data.ts";

const target = { ids: ["alice@example.com"], url: "https://example.com" };
const successFederation = {
  sources: [{ data: undefined, status: "live" as const, target }],
  status: "success" as const,
};

void test("distinguishes a loaded undefined result from loading", () => {
  const data = pdsQueryDataFromSnapshot({
    data: undefined,
    sources: [{ data: undefined, status: "live", target }],
    status: "success",
  });

  assert.deepEqual(data, {
    federation: successFederation,
    result: undefined,
    status: "success",
  });
});

void test("maps only available query results and preserves federation", () => {
  assert.deepEqual(
    mapPdsQueryData(
      {
        federation: { ...successFederation, status: "partial" },
        result: [1, 2],
        status: "partial",
      },
      (values) => values.map(String),
    ),
    {
      federation: { ...successFederation, status: "partial" },
      result: ["1", "2"],
      status: "partial",
    },
  );
  assert.deepEqual(
    mapPdsQueryData(
      {
        federation: { sources: [], status: "pending" },
        status: "loading",
      },
      () => "unreachable",
    ),
    { federation: { sources: [], status: "pending" }, status: "loading" },
  );
});
