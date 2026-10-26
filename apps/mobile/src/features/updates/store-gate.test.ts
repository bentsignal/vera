import assert from "node:assert/strict";
import { test } from "node:test";

import {
  combineOutdated,
  mustReplaceBinary,
  NO_OUTDATED,
  readOutdated,
} from "./store-gate.ts";

const OLD_IOS = "f54bfcd2eab4e8cc9688d3e124cb3bad26f8b845";
const OLD_ANDROID = "46edd03177eed9f46c4a9a1cb1e32607cf2248bd";
const listed = { android: [OLD_ANDROID], ios: [OLD_IOS] };

void test("a store build whose runtime is listed has to update", () => {
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: listed,
      platform: "ios",
      runtime: OLD_IOS,
    }),
    true,
  );
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: listed,
      platform: "android",
      runtime: OLD_ANDROID,
    }),
    true,
  );
});

void test("nobody is asked while the list is empty, as it is now", () => {
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: NO_OUTDATED,
      platform: "ios",
      runtime: OLD_IOS,
    }),
    false,
  );
});

void test("a runtime that isn't listed, a newer build too, is never asked", () => {
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: listed,
      platform: "ios",
      runtime: "6e60a1ac81b3d72068021adf0711d38c0f5fc75e",
    }),
    false,
  );
  // Each platform has its own list.
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: listed,
      platform: "android",
      runtime: OLD_IOS,
    }),
    false,
  );
});

void test("dev, internal, and preview builds are never asked", () => {
  for (const channel of [null, "internal", "preview"]) {
    assert.equal(
      mustReplaceBinary({
        channel,
        outdated: listed,
        platform: "ios",
        runtime: OLD_IOS,
      }),
      false,
    );
  }
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: listed,
      platform: "ios",
      runtime: null,
    }),
    false,
  );
});

void test("an answer it can't read lists nothing", () => {
  for (const value of [undefined, null, 3, "x", [], { ios: "x" }]) {
    assert.deepEqual(readOutdated(value), NO_OUTDATED);
  }
  assert.deepEqual(
    readOutdated({ android: [OLD_ANDROID, 4], ios: [OLD_IOS] }),
    listed,
  );
});

/** The observer the app uses, over a PDS that answers with `answer`. */
async function watchWith(answer: { data: unknown } | { error: Error }) {
  const { DecentralizedConvexClient } =
    await import("@decentralized-convex/client");
  const { api } = await import("@vera/backend/api");
  function unused() {
    return Promise.reject(new Error("not in this test"));
  }
  const client = new DecentralizedConvexClient({
    connectionFactory: () => ({
      close: () => Promise.resolve(),
      mutation: unused,
      query: unused,
      subscribe: (_query, _args, onResult, onError) => {
        if ("error" in answer) onError(answer.error);
        // Whatever this PDS serves, typed or not.
        else Reflect.apply(onResult, undefined, [answer.data]);
        return () => undefined;
      },
    }),
  });
  return client.watchQuery({
    args: {},
    combine: combineOutdated,
    query: api.release.outdatedRuntimes,
    targets: [{ id: "home", url: "https://pds.example" }],
  });
}

void test("a PDS without the query lists nothing, as the observer reports it", async () => {
  // An older PDS has no `release:outdatedRuntimes`: the query fails.
  const observer = await watchWith({
    error: new Error("Could not find public function"),
  });
  assert.equal(observer.getSnapshot().status, "error");
  assert.deepEqual(observer.getSnapshot().data, NO_OUTDATED);
  observer.close();
});

void test("a PDS with the list reaches the rule as it's served", async () => {
  const observer = await watchWith({ data: listed });
  assert.deepEqual(observer.getSnapshot().data, listed);
  assert.equal(
    mustReplaceBinary({
      channel: "production",
      outdated: observer.getSnapshot().data,
      platform: "ios",
      runtime: OLD_IOS,
    }),
    true,
  );
  observer.close();
});
