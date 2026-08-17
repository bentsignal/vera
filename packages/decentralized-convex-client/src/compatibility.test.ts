import assert from "node:assert/strict";
import test from "node:test";
import type { DiscoveredPds } from "@decentralized-convex/address";
import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { definePdsApi } from "./api.ts";
import {
  assertPdsCompatibility,
  IncompatiblePdsError,
} from "./compatibility.ts";

const notes = definePluginProtocol({
  lastChanged: corePackage.lastChanged,
  name: "notes",
  mutations: {
    write: defineOperation({ args: v.object({}), returns: v.null() }),
  },
  queries: {
    read: defineOperation({ args: v.object({}), returns: v.null() }),
  },
  requires: {},
});
const api = definePdsApi(notes);

void test("accepts a newer ecosystem release when required contracts are unchanged", () => {
  const pds = discoveredPds({ ecosystemVersion: "9.0.0" });
  assert.equal(assertPdsCompatibility(pds, api), pds);
});

void test("rejects missing or changed contracts before sign-in", () => {
  assert.throws(
    () => assertPdsCompatibility(discoveredPds({ capabilities: [] }), api),
    (error: unknown) =>
      error instanceof IncompatiblePdsError &&
      error.message.includes("required notes plugin"),
  );
  assert.throws(
    () =>
      assertPdsCompatibility(
        discoveredPds({ capabilityLastChanged: "0.2.0" }),
        api,
      ),
    (error: unknown) =>
      error instanceof IncompatiblePdsError &&
      error.message.includes("notes last changed"),
  );
  assert.throws(
    () =>
      assertPdsCompatibility(
        discoveredPds({ protocolLastChanged: "0.2.0" }),
        api,
      ),
    (error: unknown) =>
      error instanceof IncompatiblePdsError &&
      error.message.includes("PDS contract last changed"),
  );
});

function discoveredPds({
  capabilities = [
    {
      id: "notes",
      lastChanged: corePackage.lastChanged,
    },
  ],
  capabilityLastChanged,
  ecosystemVersion = "0.1.0",
  protocolLastChanged = corePackage.lastChanged,
}: {
  capabilities?: { id: string; lastChanged: string }[];
  capabilityLastChanged?: string;
  ecosystemVersion?: string;
  protocolLastChanged?: string;
}): DiscoveredPds {
  return {
    domain: "notes.example",
    manifest: {
      accountDomain: "notes.example",
      capabilities: capabilities.map((capability) => ({
        ...capability,
        lastChanged: capabilityLastChanged ?? capability.lastChanged,
      })),
      deploymentUrl: "https://notes.example.convex.cloud",
      httpUrl: "https://notes.example",
      lastChanged: protocolLastChanged,
      version: ecosystemVersion,
    },
    manifestUrl: "https://notes.example/.well-known/decentralized-convex",
  };
}
