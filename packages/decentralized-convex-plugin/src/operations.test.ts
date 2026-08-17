import assert from "node:assert/strict";
import test from "node:test";
import { DECENTRALIZED_CONVEX_LAST_CHANGED } from "@decentralized-convex/core";
import { v } from "convex/values";

import {
  defineOperation,
  definePluginProtocol,
  operationResponseValidator,
  operationValidator,
} from "./operations.ts";

const operations = {
  create: defineOperation({
    args: v.object({ body: v.string() }),
    returns: v.object({ id: v.string() }),
  }),
  remove: defineOperation({
    args: v.object({ id: v.string() }),
    returns: v.null(),
  }),
};

void test("builds discriminated request and response validators", () => {
  const requests = operationValidator(operations);
  const responses = operationResponseValidator(operations);

  assert.equal(requests.kind, "union");
  assert.equal(responses.kind, "union");
  assert.equal(requests.members.length, 2);
  assert.equal(responses.members.length, 2);
  assert.deepEqual(
    responses.members.map((member) => {
      assert.equal(member.kind, "object");
      return Object.keys(member.fields);
    }),
    [
      ["routes", "type", "value"],
      ["routes", "type", "value"],
    ],
  );
  assert.deepEqual(
    responses.members.map((member) => {
      assert.equal(member.kind, "object");
      return member.fields.type?.kind;
    }),
    ["literal", "literal"],
  );
});

void test("rejects operation names that cannot be flattened safely", () => {
  assert.throws(
    () =>
      definePluginProtocol({
        lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
        name: "notes",
        mutations: { create: operations.create },
        queries: { create: operations.create },
        requires: {},
      }),
    /cannot define create as both a query and mutation/,
  );

  assert.throws(
    () =>
      definePluginProtocol({
        lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
        name: "notes",
        mutations: { create: operations.create },
        queries: { queries: operations.remove },
        requires: {},
      }),
    /cannot use reserved operation name queries/,
  );
});
