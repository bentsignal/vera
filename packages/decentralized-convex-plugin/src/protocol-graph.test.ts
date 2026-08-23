import assert from "node:assert/strict";
import test from "node:test";

import {
  defineProtocolSet,
  inspectProtocolGraph,
  ProtocolGraphError,
} from "./index.ts";

function protocol<const Name extends string, const Version extends string>(
  name: Name,
  version: Version,
  requires: Readonly<Record<string, string>> = {},
) {
  return {
    name,
    requires,
    version,
  } as const;
}

void test("accepts a valid protocol set with explicit dependencies", () => {
  const accounts = protocol("accounts", "1");
  const messages = protocol("messages", "1", { accounts: "1" });
  const reactions = protocol("reactions", "1", { messages: "1" });

  assert.deepEqual(
    defineProtocolSet(reactions, messages, accounts).map(({ name }) => name),
    ["reactions", "messages", "accounts"],
  );
  assert.deepEqual(inspectProtocolGraph([reactions, messages, accounts]), []);
});

void test("reports missing and incompatible plugin versions", () => {
  const accountsV2 = protocol("accounts", "2");
  const messages = protocol("messages", "1", { accounts: "1" });

  assert.deepEqual(inspectProtocolGraph([messages]), [
    {
      code: "missing-plugin",
      plugin: "messages",
      requiredPlugin: "accounts",
      requiredVersion: "1",
    },
  ]);
  assert.deepEqual(inspectProtocolGraph([messages, accountsV2]), [
    {
      code: "incompatible-version",
      plugin: "messages",
      providedVersion: "2",
      requiredPlugin: "accounts",
      requiredVersion: "1",
    },
  ]);
});

void test("reports duplicate names and dependency cycles", () => {
  const duplicateA = protocol("duplicate", "1");
  const duplicateB = protocol("duplicate", "1");
  const first = protocol("first", "1", { second: "1" });
  const second = protocol("second", "1", { first: "1" });

  assert.deepEqual(inspectProtocolGraph([duplicateA, duplicateB]), [
    { code: "duplicate-plugin-name", name: "duplicate" },
  ]);
  assert.throws(
    () => defineProtocolSet(first, second),
    (error: unknown) =>
      error instanceof ProtocolGraphError &&
      error.issues[0]?.code === "dependency-cycle",
  );
});
