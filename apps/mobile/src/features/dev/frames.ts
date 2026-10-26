import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import type { FrameReport } from "./frame-summary";
import { summarize } from "./frame-summary";

export type { FrameReport } from "./frame-summary";

interface Recording {
  last: number;
  intervals: number[];
}

declare global {
  var veraFrames: Recording | undefined;
}

/** Starts recording the UI thread's frames, replacing any recording. */
export function startFrames() {
  scheduleOnUI(() => {
    "worklet";
    // Replacing the recording ends the last one's loop.
    const recording = {
      intervals: new Array<number>(),
      last: 0,
    } satisfies Recording;
    globalThis.veraFrames = recording;
    function tick(time: number) {
      "worklet";
      if (globalThis.veraFrames !== recording) return;
      if (recording.last > 0) recording.intervals.push(time - recording.last);
      recording.last = time;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/**
 * Stops recording; the report follows in `frameReport()` a moment later
 * (from the UI thread). Hermes's debugger can't wait on a promise, so
 * scripts poll for it.
 */
export function stopFrames() {
  report = undefined;
  scheduleOnUI(() => {
    "worklet";
    const recording = globalThis.veraFrames;
    globalThis.veraFrames = undefined;
    scheduleOnRN(
      setReport,
      recording === undefined ? null : summarize(recording.intervals),
    );
  });
}

/** The report from the last `stopFrames()`, once it's ready. */
let report: FrameReport | null | undefined;

function setReport(next: FrameReport | null) {
  report = next;
}

export function frameReport() {
  return report;
}
