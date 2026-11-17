// The models assistant replies run on (convex/agent.ts), through the Convex
// AI Gateway (billed on the Convex bill). Claude Haiku answers first; Kimi
// takes over when Haiku fails. Chosen from a comparison on real
// conversations (2026-11-16): neither dropped a message in 280 replies,
// where Grok 4.7 lost one in about 20, and Haiku answered in about half
// Kimi's time for a fifth of the cost; Shawn preferred it on his phone
// (2026-11-17). A deployment can set `ASSISTANT_MODELS` (gateway model
// IDs, comma-separated, in order) to try others.

export interface AssistantModel {
  readonly id: string;
  /** The image formats it reads. A request with any other fails outright. */
  readonly images: readonly string[];
}

/** What every current model reads; HEIC reaches them as JPEG (assistant-images.ts). */
const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const KIMI: AssistantModel = {
  id: "moonshotai/kimi-k3.1-pro",
  images: IMAGES,
};

export const HAIKU: AssistantModel = {
  id: "anthropic/claude-haiku-5.5",
  images: IMAGES,
};

const KNOWN = [HAIKU, KIMI];

/** The models in order: `ASSISTANT_MODELS`'s, if set, or Haiku then Kimi. */
export function configuredModels(setting: string | null | undefined) {
  const ids = (setting ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) return KNOWN;
  return ids.map(
    (id) => KNOWN.find((model) => model.id === id) ?? { id, images: IMAGES },
  );
}

/**
 * The models to try for a reply, in order: those that can see every photo
 * the model is shown come first.
 */
export function modelOrder(
  imageTypes: readonly string[],
  models: readonly AssistantModel[] = KNOWN,
) {
  function seesAll(model: AssistantModel) {
    return imageTypes.every((type) =>
      model.images.includes(type.toLowerCase()),
    );
  }
  return [
    ...models.filter(seesAll),
    ...models.filter((model) => !seesAll(model)),
  ];
}
