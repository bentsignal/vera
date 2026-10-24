import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Tells people how the bugs they reported to support are going.
crons.interval(
  "follow bug reports",
  { minutes: 10 },
  internal.supportReports.track,
  {},
);

// Vera's saved web search results are only for follow-ups that day.
crons.daily(
  "clear old web searches",
  { hourUTC: 9, minuteUTC: 0 },
  internal.webSearch.clearOld,
  {},
);

export default crons;
