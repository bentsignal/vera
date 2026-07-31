import { useEffect, useRef, useState } from "react";

const FPS = 20;
const MS_PER_FRAME = 1000 / FPS;
const INITIAL_CHARS_PER_SEC = 128;

export interface SmoothTextOptions {
  /**
   * The number of characters to display per second.
   */
  charsPerSec?: number;
  /**
   * Whether to initially start streaming.
   * If this later turns to false, it'll continue streaming.
   * This will start streaming the first value it sees.
   */
  startStreaming?: boolean;
}

interface SmoothState {
  tick: number;
  cursor: number;
  lastUpdate: number;
  lastUpdateLength: number;
  charsPerMs: number;
  initial: boolean;
}

/**
 * A hook that smoothly displays text as it is streamed.
 *
 * @param text The text to display. Pass in the full text each time.
 * @param charsPerSec The number of characters to display per second.
 * @returns A tuple of the visible text and the state of the smooth text,
 * including the current cursor position and whether it's still streaming.
 * This allows you to decide if it's too far behind and you want to adjust
 * the charsPerSec or just prefer the full text.
 */
export function useSmoothText(
  text: string,
  {
    charsPerSec = INITIAL_CHARS_PER_SEC,
    startStreaming = false,
  }: SmoothTextOptions = {},
) {
  const [visibleText, setVisibleText] = useState(
    startStreaming ? "" : text || "",
  );
  const stateRef = useRef<SmoothState | null>(null);
  const [cursor, setCursor] = useState(visibleText.length);

  const isStreaming = cursor < text.length;

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to drive smooth-text animation via setInterval
  useEffect(() => {
    stateRef.current ??= {
      tick: Date.now(),
      cursor: visibleText.length,
      lastUpdate: Date.now(),
      lastUpdateLength: text.length,
      charsPerMs: charsPerSec / 1000,
      initial: true,
    };
    const state = stateRef.current;
    if (state.cursor >= text.length) {
      return;
    }
    if (state.lastUpdateLength !== text.length) {
      const timeSinceLastUpdate = Date.now() - state.lastUpdate;
      const latestCharsPerMs =
        (text.length - state.lastUpdateLength) / timeSinceLastUpdate;
      const rateError = latestCharsPerMs - state.charsPerMs;
      const charLag = state.lastUpdateLength - state.cursor;
      const lagRate = charLag / timeSinceLastUpdate;
      const nextCharsPerMs =
        latestCharsPerMs +
        (state.initial ? 0 : Math.max(0, (rateError + lagRate) / 2));
      state.initial = false;
      state.charsPerMs = Math.min(
        (2 * nextCharsPerMs + state.charsPerMs) / 3,
        state.charsPerMs * 2,
      );
    }
    state.tick = Math.max(state.tick, Date.now() - MS_PER_FRAME);
    state.lastUpdate = Date.now();
    state.lastUpdateLength = text.length;

    function update() {
      if (state.cursor >= text.length) {
        return;
      }
      const now = Date.now();
      const timeSinceLastUpdate = now - state.tick;
      const charsSinceLastUpdate = Math.floor(
        timeSinceLastUpdate * state.charsPerMs,
      );
      const chars = Math.min(charsSinceLastUpdate, text.length - state.cursor);
      state.cursor += chars;
      state.tick += chars / state.charsPerMs;
      setVisibleText(text.slice(0, state.cursor));
      setCursor(state.cursor);
    }
    update();
    const interval = setInterval(update, MS_PER_FRAME);
    return () => clearInterval(interval);
  }, [text, charsPerSec, visibleText.length]);

  return [visibleText, { cursor, isStreaming }] as const;
}
