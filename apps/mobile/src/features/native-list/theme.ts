import { Platform } from "react-native";
import { useCSSVariable } from "uniwind";

import type { Behavior, Theme } from "./contract";
import type { MessageLayout } from "~/features/preferences/store";

// How the native list looks and moves, from the same values the React
// Native list uses: the app's CSS variables (global.css, with the accent
// theme applied over them) and its spacing and timing constants.

/** The CSS variables the theme reads, in `themeOf`'s order. */
const VARIABLES = [
  "--color-background",
  "--color-foreground",
  "--color-muted",
  "--color-subtle",
  "--color-separator",
  "--color-fill",
  "--color-accent",
  "--color-on-accent",
  "--color-bubble-incoming",
  "--color-bubble-outgoing",
  "--color-destructive",
  "--color-background-elevated",
] as const;

/** The light scheme, for a variable that hasn't resolved. */
const LIGHT = [
  "#ffffff",
  "#000000",
  "rgba(60, 60, 67, 0.6)",
  "rgba(60, 60, 67, 0.3)",
  "rgba(60, 60, 67, 0.29)",
  "rgba(118, 118, 128, 0.12)",
  "#007aff",
  "#ffffff",
  "#e9e9eb",
  "#007aff",
  "#ff3b30",
  "#ffffff",
] as const;

/** The tint behind the message a search or notification opened on. */
const HIGHLIGHT = "rgba(124, 124, 255, 0.18)";
/** iMessage's monogram gradient (see `Avatar`). */
const MONOGRAM = { bottom: "#858994", top: "#a6abb8" };

/** Bubbles' corners (`BUBBLE_RADIUS`). */
const BUBBLE_RADIUS = 20;

/** Spacing per layout, as `row-header.ts` and the rows have it. */
const METRICS = {
  bubbles: {
    // The photo beside a run's last bubble (`AVATAR_COLUMN`).
    avatarSize: 28,
    bubbleMaxWidthFraction: 0.75,
    bubbleRadius: BUBBLE_RADIUS,
    horizontalPadding: 16,
    rowGap: 4,
    runGap: 14,
  },
  stacked: {
    // `Avatar` at `row` size.
    avatarSize: 36,
    bubbleMaxWidthFraction: 1,
    bubbleRadius: BUBBLE_RADIUS,
    horizontalPadding: 16,
    rowGap: 6,
    runGap: 20,
  },
} as const satisfies Record<MessageLayout, Theme["metrics"]>;

/** The text styles (global.css's sizes, with the rows' line heights). */
const TYPE = {
  bubbles: {
    body: { lineHeight: 22, size: 17 },
    caption: { lineHeight: 16, size: 12 },
    footnote: { lineHeight: 18, size: 13 },
    jumbo: { lineHeight: 52, size: 48 },
    name: { lineHeight: 16, size: 12 },
  },
  stacked: {
    // Stacked text sets no line height, so it has the font's own at 17:
    // San Francisco's 20.3 pt, or Roboto's 23.24 dp with Android's font
    // padding (bubbles set 22).
    body: { lineHeight: Platform.OS === "android" ? 23.24 : 20.3, size: 17 },
    caption: { lineHeight: 16, size: 12 },
    footnote: { lineHeight: 18, size: 13 },
    jumbo: { lineHeight: 52, size: 48 },
    name: { lineHeight: 20, size: 15 },
  },
} as const satisfies Record<MessageLayout, Theme["type"]>;

function colorAt(values: readonly unknown[], index: number) {
  const value = values[index];
  return typeof value === "string" && value !== "" ? value : LIGHT[index];
}

/** The theme from the variables' values, in `VARIABLES` order. */
export function themeOf(values: readonly unknown[], layout: MessageLayout) {
  function color(index: number) {
    return colorAt(values, index) ?? "#000000";
  }
  return {
    colors: {
      accent: color(6),
      background: color(0),
      backgroundElevated: color(11),
      bubbleIncoming: color(8),
      bubbleOutgoing: color(9),
      destructive: color(10),
      fill: color(5),
      foreground: color(1),
      highlight: HIGHLIGHT,
      monogramBottom: MONOGRAM.bottom,
      monogramTop: MONOGRAM.top,
      muted: color(2),
      onAccent: color(7),
      separator: color(4),
      subtle: color(3),
      textIncoming: color(1),
      textOutgoing: color(7),
    },
    metrics: METRICS[layout],
    type: TYPE[layout],
  } satisfies Theme;
}

/** The theme in the current color scheme and accent, for `layout`. */
export function useNativeTheme(layout: MessageLayout) {
  return themeOf(useCSSVariable([...VARIABLES]), layout);
}

/** RN timings, with more page lead for fast native scrolling. */
export const BEHAVIOR = {
  // A new message fades in as the others make room (`Arrive`).
  fadeMs: 400,
  firehoseFrom: 8,
  firehoseUntil: 3,
  firehoseWindowMs: 2000,
  // `onEndReachedThreshold`. Native can keep more rows ready cheaply; five
  // screens leave time for the network and JS during a 5,500 pt/s fling.
  loadAheadScreens: 5,
  // `GROW_MS`.
  moveMs: 420,
  // `NEAR_LATEST`.
  nearLatestPoints: 80,
} satisfies Behavior;
