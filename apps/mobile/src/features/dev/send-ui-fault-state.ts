/** A bounded, explicitly armed, one-shot diagnostic. Never a send-release rule. */
export function createUIFault() {
  let milliseconds = 0;
  return {
    arm: (duration: number, active: boolean) => {
      if (!active)
        throw new Error("Start the DEV send probe before arming a UI stall");
      if (!Number.isInteger(duration) || duration < 1 || duration > 1500) {
        throw new RangeError("The one-shot UI stall must be 1..1500 ms");
      }
      milliseconds = duration;
    },
    take: () => {
      const next = milliseconds;
      milliseconds = 0;
      return next;
    },
    clear: () => {
      milliseconds = 0;
    },
  };
}
