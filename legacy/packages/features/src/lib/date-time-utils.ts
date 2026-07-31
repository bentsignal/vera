export function getDateTimeString(date: Date) {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getTimeRemaining(target: Date) {
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
    };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    days,
    hours,
    minutes,
  };
}

export function formatCountdownString(
  days: number,
  hours: number,
  minutes: number,
) {
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} and ${hours} hour${
      hours > 1 ? "s" : ""
    }`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${
      minutes > 1 ? "s" : ""
    }`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

export function getESTDate() {
  const now = new Date();
  const estNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  return estNow;
}

export function getMonthBounds() {
  const estNow = getESTDate();
  const startEST = new Date(
    estNow.getFullYear(),
    estNow.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const endEST = new Date(
    estNow.getFullYear(),
    estNow.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const start = convertToUTC(startEST);
  const end = convertToUTC(endEST);
  return { start, end };
}

export function getDayBounds() {
  const estNow = getESTDate();
  const startEST = new Date(
    estNow.getFullYear(),
    estNow.getMonth(),
    estNow.getDate(),
    0,
    0,
    0,
    0,
  );
  const endEST = new Date(
    estNow.getFullYear(),
    estNow.getMonth(),
    estNow.getDate(),
    23,
    59,
    59,
    999,
  );
  const start = convertToUTC(startEST);
  const end = convertToUTC(endEST);
  return { start, end };
}

export function convertToUTC(date: Date) {
  const now = new Date();
  const estNow = getESTDate();
  const offset = now.getTime() - estNow.getTime();
  return new Date(date.getTime() + offset);
}

export interface CurrentDateTime {
  hours: number;
  minutes: number;
  month: string;
  day: string;
  year: string;
}

export function getCurrentDateTime({ timezone }: { timezone: string }) {
  const date = new Date();

  const timeString = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const [hours, minutes] = timeString.split(":").map(Number);

  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: timezone,
  });
  const day = date.toLocaleString("en-US", {
    day: "numeric",
    timeZone: timezone,
  });
  const year = date.toLocaleString("en-US", {
    year: "numeric",
    timeZone: timezone,
  });

  return {
    hours: hours ?? 0,
    minutes: minutes ?? 0,
    month,
    day,
    year,
  };
}
