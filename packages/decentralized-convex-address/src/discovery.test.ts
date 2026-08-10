import assert from "node:assert/strict";
import test from "node:test";

import {
  accountDomain,
  decodeDnsTxtData,
  discoverPds,
  parsePdsTxtRecord,
} from "./discovery.ts";

void test("extracts and validates an account domain", () => {
  assert.equal(accountDomain(" Shawn@A.Vera.Chat. "), "a.vera.chat");
  assert.throws(() => accountDomain("not-a-domain"), /valid/);
});

void test("parses the versioned one-record discovery format", () => {
  assert.equal(
    parsePdsTxtRecord(
      "v=pds1;url=https://example.convex.site/.well-known/decentralized-convex",
    ),
    "https://example.convex.site/.well-known/decentralized-convex",
  );
  assert.equal(
    parsePdsTxtRecord("v=unknown;url=https://example.com/manifest"),
    null,
  );
  assert.equal(
    decodeDnsTxtData('"v=pds1;url=https://example.com/" "manifest"'),
    "v=pds1;url=https://example.com/manifest",
  );
});

void test("discovers and validates a PDS manifest", async () => {
  const result = await discoverPds("person@a.vera.chat", {
    fetch: (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      assert.equal(url, "https://a.example/.well-known/decentralized-convex");
      return Promise.resolve(
        Response.json({
          accountDomain: "a.vera.chat",
          auth: {
            issuer: "https://a.example",
            jwksUrl: "https://a.example/jwks",
          },
          capabilities: [{ id: "messages", versions: ["1"] }],
          deploymentUrl: "https://a.example.convex.cloud",
          httpUrl: "https://a.example.convex.site",
          protocolVersion: "0.1",
        }),
      );
    },
    resolveTxt: (name) => {
      assert.equal(name, "_pds.a.vera.chat");
      return Promise.resolve([
        "unrelated=value",
        "v=pds1;url=https://a.example/.well-known/decentralized-convex",
      ]);
    },
  });

  assert.equal(result.domain, "a.vera.chat");
  assert.equal(result.manifest.deploymentUrl, "https://a.example.convex.cloud");
});

void test("rejects a manifest for a different account domain", async () => {
  await assert.rejects(
    discoverPds("a.vera.chat", {
      fetch: () =>
        Promise.resolve(
          Response.json({
            accountDomain: "b.vera.chat",
            deploymentUrl: "https://a.example.convex.cloud",
            httpUrl: "https://a.example.convex.site",
            protocolVersion: "0.1",
          }),
        ),
      resolveTxt: () =>
        Promise.resolve([
          "v=pds1;url=https://a.example/.well-known/decentralized-convex",
        ]),
    }),
    /belongs to b\.vera\.chat/,
  );
});

void test("uses browser-compatible DNS-over-HTTPS by default", async () => {
  const requested: string[] = [];
  const result = await discoverPds("a.vera.chat", {
    fetch: (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requested.push(url);
      return Promise.resolve(
        url.startsWith("https://cloudflare-dns.com/dns-query")
          ? Response.json({
              Answer: [
                {
                  data: '"v=pds1;url=https://a.example/manifest"',
                  type: 16,
                },
              ],
              Status: 0,
            })
          : Response.json({
              accountDomain: "a.vera.chat",
              deploymentUrl: "https://a.example.convex.cloud",
              httpUrl: "https://a.example.convex.site",
              protocolVersion: "0.1",
            }),
      );
    },
  });

  assert.equal(result.manifestUrl, "https://a.example/manifest");
  assert.match(requested[0] ?? "", /name=_pds\.a\.vera\.chat/);
  assert.match(requested[0] ?? "", /type=TXT/);
});

void test("rejects ambiguous or insecure discovery records", async () => {
  await assert.rejects(
    discoverPds("a.vera.chat", {
      resolveTxt: () =>
        Promise.resolve([
          "v=pds1;url=https://a.example/one",
          "v=pds1;url=https://a.example/two",
        ]),
    }),
    /Multiple PDS discovery records/,
  );
  assert.throws(
    () => parsePdsTxtRecord("v=pds1;url=http://a.example/manifest"),
    /HTTPS/,
  );
});
