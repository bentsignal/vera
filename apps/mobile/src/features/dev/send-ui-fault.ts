import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { createUIFault } from "./send-ui-fault-state";

const control = createUIFault();
const marks = new Array<{
  owner: string;
  sequence: number;
  phase: string;
  atUI: number;
  receivedAtJS: number;
}>();

function record(owner: string, sequence: number, phase: string, atUI: number) {
  marks.push({ owner, sequence, phase, atUI, receivedAtJS: performance.now() });
  if (marks.length > 64) marks.splice(0, marks.length - 64);
}

/** Fault injection only. This intentionally prevents physical UI mounting. */
function stall(milliseconds: number, owner: string, sequence: number) {
  "worklet";
  const start = performance.now();
  scheduleOnRN(record, owner, sequence, "stall start", start);
  while (performance.now() - start < milliseconds) {
    // Deliberately occupy the UI runtime, bounded by the explicit one-shot arm.
  }
  scheduleOnRN(record, owner, sequence, "stall end", performance.now());
  requestAnimationFrame(() => {
    scheduleOnRN(record, owner, sequence, "next UI frame", performance.now());
  });
}

/** These markers use the UI clock; receivedAtJS is a separate delivery clock. */
export const sendUIFault = {
  arm: control.arm,
  clear: control.clear,
  reset: () => {
    control.clear();
    marks.length = 0;
  },
  report: () => marks.slice(),
};

export function beginSendUIFault(owner: string, sequence: number) {
  const milliseconds = control.take();
  if (milliseconds > 0) scheduleOnUI(stall, milliseconds, owner, sequence);
}
