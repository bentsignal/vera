import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@clerk/tanstack-react-start/server";
import {
  DEFAULT_ALLOWED_URL_PATTERNS,
  fromHeaders,
  handleRequest,
  resolveProxyConfig,
  TARGET_URL_HEADER,
} from "@fal-ai/server-proxy";

import { api } from "@acme/db/api";
import { modelPresets } from "@acme/db/models/presets";

import { env } from "~/env";
import { getConvexHttpClient } from "~/lib/convex-server";

// All `fal.subscribe` traffic from the client routes through here. Queue
// submits (POST to queue.fal.run) are gated with rate-limit + usage checks;
// every response runs through the transcription preset's `getResult` so
// real result bodies get usage-logged while status polls and acks pass
// through untouched.
const proxyConfig = resolveProxyConfig({
  // Clerk auth runs in `proxy()` below before `handleRequest` is called, so
  // by the time fal's own gate fires the caller is already verified.
  isAuthenticated: () => Promise.resolve(true),
  allowUnauthorizedRequests: false,
  allowedUrlPatterns: DEFAULT_ALLOWED_URL_PATTERNS,
});

// A POST to queue.fal.run is always a job submit. That's the only traffic we
// want to gate with rate-limit + usage — status polls and result fetches are
// GETs, storage uploads go elsewhere.
function isQueueSubmit(request: Request) {
  if (request.method.toUpperCase() !== "POST") return false;
  const target = request.headers.get(TARGET_URL_HEADER);
  if (!target) return false;
  try {
    return new URL(target).host === "queue.fal.run";
  } catch {
    return false;
  }
}

// `JSON.parse` is typed as `any`; this helper narrows the return to `unknown`
// at the boundary so downstream consumers (e.g. zod parsers) stay type-safe
// without needing a type assertion.
function asUnknown(value: unknown) {
  return value;
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function gateSubmit(convexToken: string | undefined) {
  const convex = getConvexHttpClient();
  if (convexToken) convex.setAuth(convexToken);

  // Authoritative gate — no client-side check is trusted.
  const [usage, rateLimitOk] = await Promise.all([
    convex.query(api.user.usage.getUsage, {}),
    convex.mutation(api.limiter.transcriptionRateLimit, {}),
  ]);

  if (usage.limitHit) return errorResponse(429, "Usage limit reached");
  if (!rateLimitOk) return errorResponse(429, "Rate limit exceeded");
  return null;
}

/**
 * Best-effort usage logger. Runs on every proxied response; the preset's
 * `getResult` schema is what filters submit acks and status polls out —
 * only a real result body parses, and only its duration gets logged.
 *
 * fal's client wraps the raw HTTP body in `{ data, requestId }` before
 * calling `getResult`, so we wrap the body the same way.
 */
async function maybeLogTranscription(
  res: Response,
  convexToken: string | undefined,
) {
  if (res.status !== 200) return res;
  const bodyText = await res.text();

  try {
    const parsed = modelPresets.transcription.getResult({
      data: asUnknown(JSON.parse(bodyText)),
    });
    if (!("error" in parsed)) {
      const convex = getConvexHttpClient();
      if (convexToken) convex.setAuth(convexToken);
      await convex.mutation(api.user.usage.logTranscription, {
        duration: parsed.duration,
        apiKey: env.CONVEX_INTERNAL_KEY,
      });
    }
  } catch {
    // Not a result body — passthrough.
  }

  return new Response(bodyText, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

async function proxy(request: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return errorResponse(401, "Unauthorized");

  const convexToken = (await getToken({ template: "convex" })) ?? undefined;

  if (isQueueSubmit(request)) {
    const blocked = await gateSubmit(convexToken);
    if (blocked) return blocked;
  }

  const responseHeaders = new Headers();
  return handleRequest<Response>(
    {
      id: "tanstack-start",
      method: request.method,
      getRequestBody: async () => request.text(),
      getHeaders: () => fromHeaders(request.headers),
      getHeader: (name) => request.headers.get(name),
      sendHeader: (name, value) => responseHeaders.set(name, value),
      respondWith: (status, data) => {
        // `handleRequest` rejects unknown URLs / missing headers with raw
        // string bodies ("Invalid request", "Unauthorized"). Wrap them as
        // JSON so the fal client can parse the error instead of choking.
        if (status >= 400) {
          console.error(
            "[fal-proxy] rejecting",
            status,
            data,
            "target=",
            request.headers.get(TARGET_URL_HEADER),
            "method=",
            request.method,
          );
        }
        const body =
          typeof data === "string" ? { error: data } : asUnknown(data);
        return new Response(JSON.stringify(body), {
          status,
          headers: {
            ...Object.fromEntries(responseHeaders),
            "Content-Type": "application/json",
          },
        });
      },
      sendResponse: (res) => maybeLogTranscription(res, convexToken),
    },
    proxyConfig,
  );
}

export const Route = createFileRoute("/api/fal/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => proxy(request),
      POST: async ({ request }) => proxy(request),
      PUT: async ({ request }) => proxy(request),
    },
  },
});
