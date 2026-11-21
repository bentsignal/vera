import assert from "node:assert/strict";
import test from "node:test";

import { fetchPreview, previewFromHtml } from "./opengraph.ts";

const URL = "https://news.example.com/2026/10/12/story";

void test("previewFromHtml reads Open Graph tags, apostrophes and all", () => {
  const html = `<html><head>
    <title>Ignored | Example</title>
    <meta property="og:title" content="Biden's plan, explained" />
    <meta content='The "short" version' property='og:description'>
    <meta property="og:image" content="/img/lead.jpg">
    <meta property="og:site_name" content="Example News">
  </head><body></body></html>`;
  assert.deepEqual(previewFromHtml(html, URL), {
    preview: {
      description: 'The "short" version',
      imageUrl: "https://news.example.com/img/lead.jpg",
      siteName: "Example News",
      title: "Biden's plan, explained",
      url: URL,
    },
    tagged: true,
  });
});

void test("previewFromHtml falls back to other image tags", () => {
  const twitter = previewFromHtml(
    `<meta name="twitter:title" content="A"><meta name="twitter:image:src" content="https://cdn.example.com/a.png">`,
    URL,
  );
  assert.equal(twitter.preview?.imageUrl, "https://cdn.example.com/a.png");
  const linked = previewFromHtml(
    `<meta property="og:title" content="B"><link rel="image_src" href="https://cdn.example.com/b.png">`,
    URL,
  );
  assert.equal(linked.preview?.imageUrl, "https://cdn.example.com/b.png");
});

void test("previewFromHtml marks a page with only a <title> as untagged", () => {
  const result = previewFromHtml("<title>Example News</title>", URL);
  assert.equal(result.tagged, false);
  assert.equal(result.preview?.title, "Example News");
});

void test("previewFromHtml has nothing for a bot wall", () => {
  for (const title of [
    "Just a moment...",
    "Access Denied",
    "Attention Required! | Cloudflare",
    "Log in or sign up to view",
    "Log into Facebook | Facebook",
    "Login • Instagram",
  ]) {
    assert.deepEqual(previewFromHtml(`<title>${title}</title>`, URL), {
      preview: null,
      tagged: false,
    });
  }
});

void test("previewFromHtml drops images not served over https", () => {
  const result = previewFromHtml(
    `<meta property="og:title" content="C"><meta property="og:image" content="http://cdn.example.com/c.png">`,
    URL,
  );
  assert.equal(result.preview?.imageUrl, undefined);
});

void test("a link that redirects into the server's network gets no preview", async (context) => {
  const requested: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://cloudflare-dns.com/")) {
        const type = new globalThis.URL(url).searchParams.get("type");
        return Promise.resolve(
          Response.json({
            Answer: type === "A" ? [{ data: "93.184.216.34", type: 1 }] : [],
            Status: 0,
          }),
        );
      }
      requested.push(url);
      return Promise.resolve(
        new Response(null, {
          headers: { location: "http://169.254.169.254/latest/meta-data" },
          status: 302,
        }),
      );
    },
  );
  await assert.rejects(fetchPreview("https://short.example/abc"), /Refused/);
  // The redirect itself was never requested.
  assert.deepEqual(requested, ["https://short.example/abc"]);
});

void test("a link on another port gets no preview, and nothing is fetched", async (context) => {
  const fetched = context.mock.method(globalThis, "fetch", () =>
    Promise.resolve(new Response("")),
  );
  assert.equal(await fetchPreview("https://example.com:8080/"), null);
  assert.equal(fetched.mock.callCount(), 0);
});
