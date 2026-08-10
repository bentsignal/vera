import assert from "node:assert/strict";
import test from "node:test";
import { v } from "convex/values";

import {
  defineOperation,
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
      ["type", "value"],
      ["type", "value"],
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
