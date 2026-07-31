import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { api } from "@acme/db/api";
import { validatePrompt } from "@acme/features/lib/prompt";

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: z.object({
    q: z.string(),
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  pendingMs: 0,
  loader: async ({ context, deps }) => {
    const prompt = validatePrompt(deps.q);

    if (!prompt) {
      throw redirect({ to: "/home" });
    }

    const clientId = crypto.randomUUID();
    await context.convexHttpClient.mutation(api.ai.thread.lifecycle.create, {
      prompt,
      clientId,
    });

    throw redirect({ to: "/chat/$id", params: { id: clientId } });
  },
});
