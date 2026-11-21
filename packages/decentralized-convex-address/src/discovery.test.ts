import assert from "node:assert/strict";
import test from "node:test";

import {
  accountDomain,
  decodeDnsTxtData,
  discoverPds,
  parsePdsTxtRecord,
  PdsDiscoveryDisagreementError,
  PdsNotFoundError,
} from "./discovery.ts";

function isDoh(url: string) {
  return (
    url.startsWith("https://cloudflare-dns.com/dns-query") ||
    url.startsWith("https://dns.google/resolve")
  );
}

function urlOf(input: string | URL | Request) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

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
          capabilities: [{ id: "messages", lastChanged: "0.1.0" }],
          deploymentUrl: "https://a.example.convex.cloud",
          httpUrl: "https://a.example.convex.site",
          lastChanged: "0.1.0",
          version: "0.1.0",
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
            lastChanged: "0.1.0",
            version: "0.1.0",
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
        isDoh(url)
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
              lastChanged: "0.1.0",
              version: "0.1.0",
            }),
      );
    },
  });

  assert.equal(result.manifestUrl, "https://a.example/manifest");
  assert.match(requested[0] ?? "", /name=_pds\.a\.vera\.chat/);
  assert.match(requested[0] ?? "", /type=TXT/);
  // Both resolvers are asked.
  assert.ok(
    requested.some((url) => url.startsWith("https://cloudflare-dns.com/")),
  );
  assert.ok(requested.some((url) => url.startsWith("https://dns.google/")));
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

void test("tells a domain with no PDS from one that didn't answer", async () => {
  function answering(dns: unknown, manifestStatus: number) {
    return (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return Promise.resolve(
        isDoh(url)
          ? Response.json(dns)
          : new Response(null, { status: manifestStatus }),
      );
    };
  }
  const record = {
    Answer: [{ data: '"v=pds1;url=https://a.example/manifest"', type: 16 }],
    Status: 0,
  };
  // No such name, no record, and a manifest that's gone: no PDS.
  for (const fetch of [
    answering({ Status: 3 }, 200),
    answering({ Status: 0 }, 200),
    answering(record, 404),
  ]) {
    await assert.rejects(
      discoverPds("a.vera.chat", { fetch }),
      PdsNotFoundError,
    );
  }
  // A server error might pass.
  await assert.rejects(
    discoverPds("a.vera.chat", { fetch: answering(record, 503) }),
    (error) => !(error instanceof PdsNotFoundError),
  );
});

void test("believes a record only when both DNS resolvers agree on it", async () => {
  const manifests: string[] = [];
  function resolvers(cloudflare: unknown, google: unknown) {
    return (input: string | URL | Request) => {
      const url = urlOf(input);
      if (url.startsWith("https://cloudflare-dns.com/")) {
        return Promise.resolve(Response.json(cloudflare));
      }
      if (url.startsWith("https://dns.google/")) {
        return google instanceof Error
          ? Promise.reject(google)
          : Promise.resolve(Response.json(google));
      }
      manifests.push(url);
      return Promise.resolve(new Response(null, { status: 500 }));
    };
  }
  const real = {
    Answer: [{ data: '"v=pds1;url=https://a.example/manifest"', type: 16 }],
    Status: 0,
  };
  const other = {
    Answer: [{ data: '"v=pds1;url=https://liar.example/manifest"', type: 16 }],
    Status: 0,
  };
  // Different servers, one says there's none, or one doesn't answer:
  // nothing is believed, and no manifest is fetched.
  await assert.rejects(
    discoverPds("a.vera.chat", { fetch: resolvers(real, other) }),
    PdsDiscoveryDisagreementError,
  );
  await assert.rejects(
    discoverPds("a.vera.chat", { fetch: resolvers({ Status: 3 }, other) }),
    PdsDiscoveryDisagreementError,
  );
  await assert.rejects(
    discoverPds("a.vera.chat", {
      fetch: resolvers(real, new Error("offline")),
    }),
    /offline/,
  );
  assert.deepEqual(manifests, []);
  // The same record, however each resolver writes it, is believed.
  const split = {
    Answer: [
      { data: '"v=pds1;url=https://a.example/" "manifest"', type: 16 },
      { data: '"unrelated=value"', type: 16 },
    ],
    Status: 0,
  };
  await assert.rejects(
    discoverPds("a.vera.chat", { fetch: resolvers(real, split) }),
    /manifest request failed \(500\)/,
  );
  assert.deepEqual(manifests, ["https://a.example/manifest"]);
});
