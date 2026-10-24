import type { RefObject } from "react";
import type { TextInput, View } from "react-native";
import { useId, useLayoutEffect, useRef } from "react";
import { PixelRatio, Platform } from "react-native";

import type { ComposerReport } from "~/features/conversation/composer-height";
import { env } from "~/env";

interface Host {
  getBoundingClientRect?: () => { height: number; y: number };
}
type Step = "before send" | "commit" | "height callback" | "sample";
interface Mark {
  at: number;
  wall: number;
  owner: string;
  send: number;
  step: Step;
  bar: { height: number; y: number } | null;
  field: { height: number; y: number } | null;
  input: { height: number; y: number } | null;
  live: number;
  fontScale: number;
  platform: string;
  empty: boolean;
  placeholder: string;
  reported?: number;
}

const available = (__DEV__ || env.profileBundle) && env.devTools;
let active = false;
let marks = new Array<Mark>();
const samplers = new Map<string, () => void>();

function rect(host: Host | null) {
  if (host?.getBoundingClientRect === undefined) return null;
  const { height, y } = host.getBoundingClientRect();
  return { height, y };
}

/** Explicitly enabled, bounded, local diagnostics. No release state or timers. */
export const sendTiming = {
  start: () => {
    active = available;
    marks = [];
    return { active };
  },
  stop: () => {
    active = false;
  },
  report: () => marks.slice(),
  sample: () => {
    if (active) for (const sample of samplers.values()) sample();
    return marks.slice();
  },
};

/**
 * Observes existing send renders, including same-height sends. It adds no
 * React state, schedules no frames, and never supplies a height to the list.
 * A commit rect is a shadow-tree measurement, not a UI completion claim.
 */
export function useSendProbe(
  report: ComposerReport,
  field: RefObject<View | null>,
  input: RefObject<TextInput | null>,
  { draft, hint }: { draft: string; hint: string },
) {
  const { bar, live } = report;
  const owner = useId();
  const send = useRef(0);

  function mark(step: Step, reported?: number) {
    if (!active || send.current === 0) return;
    marks.push({
      at: performance.now(),
      wall: Date.now(),
      owner,
      send: send.current,
      step,
      bar: rect(bar.current),
      field: rect(field.current),
      input: rect(input.current),
      live: live.get(),
      fontScale: PixelRatio.getFontScale(),
      platform: Platform.OS,
      empty: draft === "",
      placeholder: hint,
      ...(reported === undefined ? {} : { reported }),
    });
    if (marks.length > 200) marks.splice(0, marks.length - 200);
  }

  // Read this commit's host layout, including same-height clears with no onLayout event.
  useLayoutEffect(() => {
    if (!available) return undefined;
    mark("commit");
    samplers.set(owner, () => mark("sample"));
    return () => {
      samplers.delete(owner);
    };
  });

  return {
    begin: () => {
      if (!active) return;
      send.current += 1;
      mark("before send");
    },
    report: {
      ...report,
      onHeight: (height: number) => {
        report.onHeight(height);
        mark("height callback", height);
      },
    },
  };
}
