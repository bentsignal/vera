import assert from "node:assert/strict";
import { test } from "node:test";

import { devToolsOn, devToolsSecretAccepted } from "./dev-tools.ts";

const SECRET = "a".repeat(20) + "0123456789abcdef";
const DEV = { DEV_TOOLS: "true", DEV_TOOLS_SECRET: SECRET };

void test("production has no dev tools", () => {
  assert.equal(devToolsOn({}), false);
  assert.equal(devToolsSecretAccepted({}, SECRET), false);
  assert.equal(devToolsSecretAccepted({}, ""), false);
  assert.equal(devToolsSecretAccepted({}, undefined), false);
});

void test("a dev deployment without a secret keeps them off", () => {
  assert.equal(devToolsOn({ DEV_TOOLS: "true" }), false);
  assert.equal(devToolsSecretAccepted({ DEV_TOOLS: "true" }, ""), false);
  assert.equal(devToolsSecretAccepted({ DEV_TOOLS: "true" }, undefined), false);
});

void test("a short secret counts as no secret", () => {
  const short = { DEV_TOOLS: "true", DEV_TOOLS_SECRET: "short" };
  assert.equal(devToolsOn(short), false);
  assert.equal(devToolsSecretAccepted(short, "short"), false);
});

void test("the secret alone doesn't turn them on", () => {
  assert.equal(
    devToolsSecretAccepted({ DEV_TOOLS_SECRET: SECRET }, SECRET),
    false,
  );
  assert.equal(
    devToolsSecretAccepted(
      { DEV_TOOLS: "false", DEV_TOOLS_SECRET: SECRET },
      SECRET,
    ),
    false,
  );
});

void test("requests without the right secret are refused", () => {
  assert.equal(devToolsSecretAccepted(DEV, undefined), false);
  assert.equal(devToolsSecretAccepted(DEV, null), false);
  assert.equal(devToolsSecretAccepted(DEV, ""), false);
  assert.equal(devToolsSecretAccepted(DEV, "wrong"), false);
  assert.equal(devToolsSecretAccepted(DEV, SECRET.slice(0, -1)), false);
  assert.equal(devToolsSecretAccepted(DEV, `${SECRET}x`), false);
  assert.equal(devToolsSecretAccepted(DEV, SECRET.toUpperCase()), false);
  assert.equal(devToolsSecretAccepted(DEV, [SECRET]), false);
});

void test("the right secret is accepted", () => {
  assert.equal(devToolsOn(DEV), true);
  assert.equal(devToolsSecretAccepted(DEV, SECRET), true);
});
