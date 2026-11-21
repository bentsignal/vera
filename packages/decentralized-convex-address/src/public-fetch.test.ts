import assert from "node:assert/strict";
import test from "node:test";

import { ADDRESS_PATTERN, isAddress } from "./address.ts";
import {
  fetchPublic,
  isPrivateIpAddress,
  isPublicWebUrl,
  PublicFetchRefused,
  resolveHostWithDoh,
} from "./public-fetch.ts";

function PUBLIC() {
  return Promise.resolve(["93.184.216.34"]);
}

function urlOf(input: Parameters<typeof fetch>[0]) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

void test("only public web URLs on the standard ports pass", () => {
  assert.equal(isPublicWebUrl("https://example.com/page"), true);
  assert.equal(isPublicWebUrl("http://example.com/page"), true);
  assert.equal(isPublicWebUrl("https://example.com:443/page"), true);
  for (const refused of [
    "https://example.com:8443/",
    "http://example.com:22/",
    "http://example.com:443/",
    "https://user:pass@example.com/",
    "ftp://example.com/",
    "http://localhost/",
    "http://router.lan/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://10.1.2.3/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
  ]) {
    assert.equal(isPublicWebUrl(refused), false, refused);
  }
  assert.equal(
    isPublicWebUrl("http://example.com/", { httpsOnly: true }),
    false,
  );
});

void test("tells private addresses from public ones", () => {
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
  assert.equal(isPrivateIpAddress("2606:4700::1111"), false);
  assert.equal(isPrivateIpAddress("192.168.1.1"), true);
  assert.equal(isPrivateIpAddress("172.20.0.1"), true);
  assert.equal(isPrivateIpAddress("not an address"), true);
});

void test("refuses a name that resolves to a private address", async () => {
  let fetched = false;
  await assert.rejects(
    fetchPublic(
      "https://sneaky.example/",
      {},
      {
        fetch: () => {
          fetched = true;
          return Promise.resolve(new Response("secret"));
        },
        resolveHost: () => Promise.resolve(["93.184.216.34", "10.0.0.5"]),
      },
    ),
    PublicFetchRefused,
  );
  assert.equal(fetched, false);
});

void test("checks every redirect before following it", async () => {
  const requested: string[] = [];
  function fetcher(input: Parameters<typeof fetch>[0]) {
    const url = urlOf(input);
    requested.push(url);
    return Promise.resolve(
      url === "https://start.example/"
        ? new Response(null, {
            headers: { location: "https://next.example/page" },
            status: 301,
          })
        : url === "https://next.example/page"
          ? new Response(null, {
              headers: { location: "http://169.254.169.254/latest" },
              status: 302,
            })
          : new Response("metadata"),
    );
  }
  await assert.rejects(
    fetchPublic(
      "https://start.example/",
      {},
      {
        fetch: fetcher,
        resolveHost: PUBLIC,
      },
    ),
    PublicFetchRefused,
  );
  assert.deepEqual(requested, [
    "https://start.example/",
    "https://next.example/page",
  ]);
});

void test("follows public redirects and reports where it ended", async () => {
  const response = await fetchPublic(
    "https://start.example/",
    {},
    {
      fetch: (input) =>
        Promise.resolve(
          urlOf(input) === "https://start.example/"
            ? new Response(null, {
                headers: { location: "/final" },
                status: 307,
              })
            : new Response("page"),
        ),
      resolveHost: PUBLIC,
    },
  );
  assert.equal(response.url, "https://start.example/final");
  assert.equal(await response.text(), "page");
});

void test("stops after too many redirects", async () => {
  await assert.rejects(
    fetchPublic(
      "https://loop.example/",
      {},
      {
        fetch: () =>
          Promise.resolve(
            new Response(null, {
              headers: { location: "https://loop.example/" },
              status: 302,
            }),
          ),
        maxRedirects: 3,
        resolveHost: PUBLIC,
      },
    ),
    /Too many redirects/,
  );
});

void test("https-only refuses a redirect down to http", async () => {
  await assert.rejects(
    fetchPublic(
      "https://keys.example/jwks",
      {},
      {
        fetch: () =>
          Promise.resolve(
            new Response(null, {
              headers: { location: "http://keys.example/jwks" },
              status: 302,
            }),
          ),
        httpsOnly: true,
        resolveHost: PUBLIC,
      },
    ),
    PublicFetchRefused,
  );
});

void test("looks a name up over DNS over HTTPS", async () => {
  const resolve = resolveHostWithDoh((input) => {
    const url = new URL(urlOf(input));
    const type = url.searchParams.get("type");
    return Promise.resolve(
      Response.json({
        Answer:
          type === "A"
            ? [
                { data: "other.example.", type: 5 },
                { data: "10.0.0.1", type: 1 },
              ]
            : [{ data: "fd00::1", type: 28 }],
        Status: 0,
      }),
    );
  });
  assert.deepEqual(await resolve("other.example"), ["10.0.0.1", "fd00::1"]);
});

void test("the protocol's address format", () => {
  assert.equal(isAddress("shawn@vera.chat"), true);
  assert.equal(isAddress("a.b-c_d@sub.example.org"), true);
  assert.equal(ADDRESS_PATTERN.test("x@vera.chat"), false);
  for (const refused of [
    "Shawn@vera.chat",
    " shawn@vera.chat",
    "shawn@localhost",
    "shawn@vera.chat/x",
    "shawn@@vera.chat",
    "shawn",
    `${"a".repeat(40)}@vera.chat`,
  ]) {
    assert.equal(isAddress(refused), false, refused);
  }
});
