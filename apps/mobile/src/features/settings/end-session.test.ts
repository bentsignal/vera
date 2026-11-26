import assert from "node:assert/strict";
import test from "node:test";

import { endSessionWithin } from "./end-session.ts";

void test("signing out with no connection still forgets the account", async () => {
  let forgotten = false;
  const never = new Promise(() => undefined);
  await endSessionWithin([never, never], () => (forgotten = true), 10);
  assert.equal(forgotten, true);
});

void test("signing out forgets the account once the server has heard", async () => {
  const order = new Array<string>();
  await endSessionWithin(
    [Promise.resolve().then(() => order.push("server"))],
    () => order.push("forgot"),
    60_000,
  );
  assert.deepEqual(order, ["server", "forgot"]);
});

void test("a server that refuses doesn't stop the account being forgotten", async () => {
  let forgotten = false;
  await endSessionWithin(
    [Promise.reject(new Error("offline"))],
    () => (forgotten = true),
    60_000,
  );
  assert.equal(forgotten, true);
});
