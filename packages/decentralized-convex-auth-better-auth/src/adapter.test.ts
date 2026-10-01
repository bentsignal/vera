import assert from "node:assert/strict";
import test from "node:test";
import { defineComponent } from "convex/server";

import { betterAuthAdapter, betterAuthRuntimeConfig } from "./adapter.ts";
import { betterAuthPdsPlugin } from "./runtime.ts";

void test("keeps Better Auth configuration external and derives PDS integration", () => {
  const component = defineComponent("betterAuth");
  const adapter = betterAuthAdapter({
    accountDomain: "accounts.example",
    component,
    issuer: "https://accounts.example",
  });

  assert.equal(adapter.component, component);
  assert.deepEqual(adapter.descriptor(), {
    issuer: "https://accounts.example",
    jwksUrl: "https://accounts.example/api/auth/convex/jwks",
  });
  const runtimeConfig = adapter[betterAuthRuntimeConfig]();
  assert.equal(runtimeConfig.accountDomain, "accounts.example");
  assert.equal(runtimeConfig.issuer, "https://accounts.example");
  assert.equal(
    runtimeConfig.getAccountId({
      email: "alice@accounts.example",
      id: "alice",
      name: "Alice",
    }),
    "alice@accounts.example",
  );
  assert.equal(
    betterAuthPdsPlugin(adapter).id,
    "decentralized-convex-federation-auth",
  );
});

void test("resolves host environment only when runtime metadata is requested", () => {
  let resolutions = 0;
  const adapter = betterAuthAdapter({
    accountDomain: () => {
      resolutions += 1;
      return "accounts.example";
    },
    component: defineComponent("betterAuth"),
    issuer: () => {
      resolutions += 1;
      return "https://accounts.example";
    },
  });

  assert.equal(resolutions, 0);
  adapter.descriptor();
  assert.equal(resolutions, 1);
  betterAuthPdsPlugin(adapter);
  assert.equal(resolutions, 3);
});
