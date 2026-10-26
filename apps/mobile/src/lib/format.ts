const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortWeekdayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
});
const monthDayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const monthDayYearFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
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

/**
 * A message's own time: the time alone today, then the day before it,
 * "Yesterday · 9:14 PM", "Thu · 3:05 PM" within the week, "Oct 12 · 11:30
 * AM", and the year once it isn't this year's. VoiceOver and TalkBack get
 * `separator` ", " instead of the dot.
 */
export function formatMessageTime(
  date: Date,
  now = new Date(),
  separator = " · ",
) {
  const days = daysBefore(date, now);
  if (days <= 0) return formatTime(date);
  const day =
    days === 1
      ? "Yesterday"
      : days < 7
        ? shortWeekdayFormat.format(date)
        : date.getFullYear() === now.getFullYear()
          ? monthDayFormat.format(date)
          : monthDayYearFormat.format(date);
  return `${day}${separator}${formatTime(date)}`;
}

/** Inbox timestamps: time today, then "Yesterday", weekday, and date. */
export function formatInboxTimestamp(date: Date, now = new Date()) {
  const days = daysBefore(date, now);
  if (days === 0) return formatTime(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return weekdayFormat.format(date);
  return shortDateFormat.format(date);
}

/**
 * How long ago, shortly: "Just now", "5m ago", "2h ago", "3d ago", then
 * the date after a week.
 */
export function formatTimeAgo(date: Date, now = new Date()) {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDateFormat.format(date);
}

const headerDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * iMessage-style time headers between bursts of messages: "Today", a
 * weekday within the week, then a short date, each with the time.
 */
export function formatTimeHeader(date: Date, now = new Date()) {
  const days = daysBefore(date, now);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days < 7
          ? weekdayFormat.format(date)
          : headerDateFormat.format(date);
  return { day, time: formatTime(date) };
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
