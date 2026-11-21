import assert from "node:assert/strict";
import test from "node:test";
import type { GenericEndpointContext } from "better-auth";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import type { AssertionStore } from "./accepted-assertions.ts";
import { acceptOnce } from "./accepted-assertions.ts";
import { convexJwks, verifyAssertion } from "./federation-plugin.ts";

function key(id: string, createdAt: number, expiresAt?: number) {
  return {
    createdAt,
    id,
    privateKey: "private",
    publicKey: "public",
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

void test("reads stored signing keys back with dates, so several can be sorted", async () => {
  // The Convex adapter returns dates as numbers.
  const stored = [key("new", 2_000), key("old", 1_000, 5_000)];
  const context = {
    context: { adapter: { findMany: () => Promise.resolve(stored) } },
  };
  // A stand-in with only the adapter call `getJwks` makes.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const keys = await convexJwks.getJwks(context as GenericEndpointContext);

  const latest = [...keys].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  assert.equal(latest?.id, "new");
  assert.deepEqual(
    keys.map(({ createdAt, expiresAt }) => [createdAt, expiresAt]),
    [
      [new Date(2_000), undefined],
      [new Date(1_000), new Date(5_000)],
    ],
  );
});

const HOME = "home.example";
const PDS = "pds.home.example";
const AUDIENCE = "vera.chat";

/** Another PDS, as the web shows it: its DNS, manifest, and keys. */
async function homePds({ jwksRedirect }: { jwksRedirect?: string } = {}) {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = { ...(await exportJWK(publicKey)), alg: "EdDSA", kid: "k1" };
  const requested: string[] = [];
  function fetcher(input: Parameters<typeof fetch>[0]) {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.hostname === "cloudflare-dns.com") {
      const type = url.searchParams.get("type");
      return Promise.resolve(
        Response.json({
          Answer:
            type === "TXT"
              ? [
                  {
                    data: `"v=pds1;url=https://${PDS}/.well-known/decentralized-convex"`,
                    type: 16,
                  },
                ]
              : type === "A"
                ? [{ data: "203.0.113.10", type: 1 }]
                : [],
          Status: 0,
        }),
      );
    }
    requested.push(url.href);
    if (url.pathname === "/.well-known/decentralized-convex") {
      return Promise.resolve(
        Response.json({
          accountDomain: HOME,
          auth: { issuer: `https://${PDS}`, jwksUrl: `https://${PDS}/jwks` },
          deploymentUrl: `https://${PDS}`,
          httpUrl: `https://${PDS}`,
          lastChanged: "0.1.0",
          version: "0.1.0",
        }),
      );
    }
    if (url.pathname === "/jwks") {
      return Promise.resolve(
        jwksRedirect === undefined
          ? Response.json({ keys: [jwk] })
          : new Response(null, {
              headers: { location: jwksRedirect },
              status: 302,
            }),
      );
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  async function sign(
    claims: Record<string, unknown> = {},
    { expires = "5m", id = true }: { expires?: string; id?: boolean } = {},
  ) {
    const jwt = new SignJWT({
      accountId: `person@${HOME}`,
      home: HOME,
      purpose: "pds-federation",
      ...claims,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setAudience(AUDIENCE)
      .setIssuer(`https://${PDS}`)
      .setIssuedAt()
      .setExpirationTime(expires);
    return (id ? jwt.setJti(crypto.randomUUID()) : jwt).sign(privateKey);
  }
  return { fetch: fetcher, requested, sign };
}

/** Better Auth's verification table, in memory. */
function memoryStore() {
  const rows: Record<string, unknown>[] = [];
  const store: AssertionStore = {
    create: ({ data }) => {
      rows.push(data);
      return Promise.resolve(data);
    },
    deleteMany: ({ where }) => {
      const before = where.find((clause) => clause.operator === "lt");
      for (let index = rows.length - 1; index >= 0; index--) {
        const expiresAt = rows[index]?.expiresAt;
        if (
          before?.value instanceof Date &&
          expiresAt instanceof Date &&
          expiresAt < before.value
        ) {
          rows.splice(index, 1);
        }
      }
      return Promise.resolve();
    },
    findMany: ({ where }) =>
      Promise.resolve(
        rows.filter((row) =>
          where.every((clause) => row[clause.field] === clause.value),
        ),
      ),
  };
  return { rows, store };
}

void test("a visitor's assertion from their home PDS is accepted once", async () => {
  const home = await homePds();
  const verified = await verifyAssertion(await home.sign(), AUDIENCE, {
    fetch: home.fetch,
  });
  assert.equal(verified.accountId, `person@${HOME}`);
  const { store } = memoryStore();
  assert.equal(await acceptOnce(store, verified), true);
  // The same assertion again is refused.
  assert.equal(await acceptOnce(store, verified), false);
  // Another one from the same person is fine.
  const next = await verifyAssertion(await home.sign(), AUDIENCE, {
    fetch: home.fetch,
  });
  assert.equal(await acceptOnce(store, next), true);
});

void test("an address outside the protocol's format is refused before anything is fetched", async () => {
  const home = await homePds();
  for (const accountId of [
    `Person@${HOME}`,
    `per son@${HOME}`,
    `x@${HOME}`,
    `${"a".repeat(40)}@${HOME}`,
  ]) {
    await assert.rejects(
      verifyAssertion(await home.sign({ accountId }), AUDIENCE, {
        fetch: home.fetch,
      }),
      /Invalid federated account ID/,
    );
  }
  assert.deepEqual(home.requested, []);
});

void test("a key file that redirects into the server's network is refused", async () => {
  const home = await homePds({ jwksRedirect: "https://10.0.0.8/keys" });
  await assert.rejects(
    verifyAssertion(await home.sign(), AUDIENCE, { fetch: home.fetch }),
  );
  assert.equal(
    home.requested.some((url) => url.includes("10.0.0.8")),
    false,
  );
});

void test("an assertion without an ID, or good for too long, is refused", async () => {
  const home = await homePds();
  await assert.rejects(
    verifyAssertion(await home.sign({}, { expires: "1d" }), AUDIENCE, {
      fetch: home.fetch,
    }),
    /short-lived/,
  );
  await assert.rejects(
    verifyAssertion(await home.sign({}, { id: false }), AUDIENCE, {
      fetch: home.fetch,
    }),
    /jti/,
  );
});
