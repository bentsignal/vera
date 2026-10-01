import assert from "node:assert/strict";
import test from "node:test";

import { federationDescriptorResponse } from "./descriptor.ts";

void test("serves a capability-oriented descriptor", async () => {
  const response = federationDescriptorResponse({
    accountDomain: "notes.example",
    capabilities: [{ id: "example.notes", lastChanged: "0.1.0" }],
    deploymentUrl: "https://notes.example",
    httpUrl: "https://notes-http.example",
    lastChanged: "0.1.0",
    version: "0.1.0",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    accountDomain: "notes.example",
    capabilities: [{ id: "example.notes", lastChanged: "0.1.0" }],
    deploymentUrl: "https://notes.example",
    httpUrl: "https://notes-http.example",
    lastChanged: "0.1.0",
    version: "0.1.0",
  });
});
