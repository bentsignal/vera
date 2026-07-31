import z from "zod";

import type { CurrentDateTime } from "../../../lib/date_time_utils";

export const SourceSchema = z.object({
  url: z.string(),
  content: z.string(),
  title: z.string().optional().nullable(),
  favicon: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
});
export type Source = z.infer<typeof SourceSchema>;

export type SearchReturnType = {
  sources: Source[];
  currentDateTime: {
    timezone: string;
    dateTime: CurrentDateTime;
  };
} | null;
