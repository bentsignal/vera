import { createFileRoute } from "@tanstack/react-router";

import { api } from "@acme/db/api";

import { env } from "~/env";
import { getConvexHttpClient } from "~/lib/convex-server";
import { tryCatch } from "~/lib/utils";
import { appUrls } from "~/urls";

async function handleMailRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status");

  if (!userId) {
    console.error("No userId provided");
    return Response.redirect(appUrls.web, 302);
  }

  const convex = getConvexHttpClient();
  const { error } = await tryCatch(
    convex.mutation(api.mail.newsletter.apiUpdatePreference, {
      userId,
      status: status === "true",
      apiKey: env.CONVEX_INTERNAL_KEY,
    }),
  );

  if (error) {
    console.error(error);
    throw new Error(`Failed to update newsletter status for user: ${userId}`);
  }
}

export const Route = createFileRoute("/api/mail")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { error } = await tryCatch(handleMailRequest(request));
        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to update newsletter status" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return Response.redirect(appUrls.web, 302);
      },
      POST: async ({ request }) => {
        const { error } = await tryCatch(handleMailRequest(request));
        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to update newsletter status" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
