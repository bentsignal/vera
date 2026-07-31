import { useEffect, useState } from "react";

import { getTimeRemaining } from "../lib/date-time-utils";

interface UseCountdownProps {
  target: Date;
  updateInterval: number;
}

export function useCountdown({ target, updateInterval }: UseCountdownProps) {
  const initialTime = getTimeRemaining(target);
  const [minutes, setMinutes] = useState(initialTime.minutes);
  const [hours, setHours] = useState(initialTime.hours);
  const [days, setDays] = useState(initialTime.days);

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to sync with setInterval timer
  useEffect(() => {
    function updateCountdown() {
      const { days, hours, minutes } = getTimeRemaining(target);
      setMinutes(minutes);
      setHours(hours);
      setDays(days);
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, updateInterval * 1000 * 60);

    return () => clearInterval(interval);
  }, [target, updateInterval]);

  return {
    minutes,
    hours,
    days,
  };
}
