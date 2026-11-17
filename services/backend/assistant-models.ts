// The models assistant replies run on (convex/agent.ts), through the Convex
// AI Gateway (billed on the Convex bill). Gemini 4 Hydrogen answers first;
// GPT-6.2 Sol, from another provider, takes over when it fails. Chosen
// from 12 models compared on real conversations and bug reports
// (2026-11-17, 60 replays each): Haiku 5.5 was as fast but drafted false
// "I passed it to the team" claims (4 in 30 bug reports, all caught by
// reply-claims.ts) where these drafted none; Hydrogen's replies were the
// shortest and most natural, and Shawn preferred it on his phone. Sonnet
// and Opus 5.5 refuse the required tool call; Muse Ember, the fastest,
// wrote carelessly about serious topics. A deployment can set
// `ASSISTANT_MODELS` (gateway model IDs, comma-separated, in order) to try
// others.

export interface AssistantModel {
  readonly id: string;
  /** The image formats it reads. A request with any other fails outright. */
  readonly images: readonly string[];
}

/** What every current model reads; HEIC reaches them as JPEG (assistant-images.ts). */
const IMAGES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const HYDROGEN: AssistantModel = {
  id: "google/gemini-4-hydrogen",
  images: IMAGES,
};

export const SOL: AssistantModel = {
  id: "openai/gpt-6.2-sol",
  images: IMAGES,
};

const KNOWN = [HYDROGEN, SOL];

/** The models in order: `ASSISTANT_MODELS`'s, if set, or Hydrogen then Sol. */
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
