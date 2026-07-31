import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "update-home-prompts",
  { hourUTC: 12, minuteUTC: 0 },
  internal.ai.suggestions.generate,
);

crons.monthly(
  "delete-old-suggestions",
  { day: 1, hourUTC: 12, minuteUTC: 0 },
  internal.ai.suggestions.cleanup,
);

export default crons;
