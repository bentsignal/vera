import { v } from "convex/values";
import z from "zod";

export const vAspectRatio = v.union(
  v.literal("square"),
  v.literal("landscape"),
  v.literal("portrait"),
);

export const zAspectRatio = z
  .enum(["square", "landscape", "portrait"])
  .optional()
  .default("square")
  .describe(
    `The aspect ratio of the image to generate. If the user specifies a 
  desired aspect ratio, go with that. Otherwise, use your best judgement
  based on the context of the request.`,
  );
export type AspectRatio = z.infer<typeof zAspectRatio>;
type NumberRatios = "1:1" | "16:9" | "9:16";

export const aspectRatioMap = {
  square: "1:1",
  landscape: "16:9",
  portrait: "9:16",
} as const satisfies Record<AspectRatio, NumberRatios>;
