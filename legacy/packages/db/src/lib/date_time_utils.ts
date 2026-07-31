export function getESTDate() {
  const now = new Date();
  const estNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  return estNow;
}

export function convertToUTC(date: Date) {
  const now = new Date();
  const estNow = getESTDate();
  const offset = now.getTime() - estNow.getTime();
  return new Date(date.getTime() + offset);
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
  const [hours = 0, minutes = 0] = timeString.split(":").map(Number);

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
    hours,
    minutes,
    month,
    day,
    year,
  };
}
