// The models assistant replies run on (convex/agent.ts), through the Convex
// AI Gateway (billed on the Convex bill). Grok answers first; Gemini takes
// over when Grok fails, or when the conversation has a photo only Gemini
// can see.

export interface AssistantModel {
  readonly id: string;
  /** The image formats it reads. A request with any other fails outright. */
  readonly images: readonly string[];
}

export const GROK: AssistantModel = {
  id: "x-ai/grok-4.7",
  // Not GIF or HEIC, the format iPhones save photos in.
  images: ["image/jpeg", "image/png", "image/webp"],
};

export const GEMINI: AssistantModel = {
  id: "google/gemini-4-argon",
  images: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ],
};

/** The formats the gateway fetches from a URL; others are sent inline. */
export const GATEWAY_URL_IMAGES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * The models to try for a reply, in order: those that can see every photo
 * the model is shown come first, Grok before Gemini.
 */
export function modelOrder(imageTypes: readonly string[]) {
  const models = [GROK, GEMINI];
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
