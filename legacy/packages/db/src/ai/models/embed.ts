import { openai } from "@ai-sdk/openai";

import type { EmbeddingModel } from "./types";

export const embeddingModels = {
  "text-embedding-3-small": {
    provider: "OpenAI",
    name: "Text Embedding 3 Small",
    model: openai.embedding("text-embedding-3-small"),
    cost: { in: 0.02, out: 0, other: 0 },
  },
} as const satisfies Record<string, EmbeddingModel>;
