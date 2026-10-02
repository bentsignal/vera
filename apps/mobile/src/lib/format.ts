const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
});
const longDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function daysBefore(date: Date, now: Date) {
  return Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY_MS,
  );
}

export function isSameDay(a: Date, b: Date) {
  return daysBefore(a, b) === 0;
}

export function formatTime(date: Date) {
  return timeFormat.format(date);
}

/** Inbox timestamps: time today, then "Yesterday", weekday, and date. */
export function formatInboxTimestamp(date: Date, now = new Date()) {
  const days = daysBefore(date, now);
  if (days === 0) return formatTime(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayFormat.format(date);
  return shortDateFormat.format(date);
}

/** Day separators in a conversation. */
export function formatDaySeparator(date: Date, now = new Date()) {
  const days = daysBefore(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return longDateFormat.format(date);
}

export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
