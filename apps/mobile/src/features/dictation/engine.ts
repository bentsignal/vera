import type { EventEmitter } from "expo";
import { requireOptionalNativeModule } from "expo";

/** How often the microphone's level comes in, about (see the native module). */
export const LEVEL_MS = 60;

// A `Record`, not an interface, so it fits `EventEmitter`'s events map.
type DictationEvents = Record<"onLevel", (event: { level: number }) => void>;

type DictationModule = InstanceType<typeof EventEmitter<DictationEvents>> & {
  support: () => { available: boolean; onDevice: boolean };
  requestPermissionsAsync: () => Promise<{
    granted: boolean;
    denied?: "microphone" | "speech";
  }>;
  startAsync: () => Promise<void>;
  finishAsync: () => Promise<string>;
  cancel: () => void;
};

type Subscription = ReturnType<DictationModule["addListener"]>;

/** What turns speech into text: the native module, or a dev stand-in. */
export interface DictationEngine {
  permissions: () => ReturnType<DictationModule["requestPermissionsAsync"]>;
  /** Starts listening, sending the microphone's level (0 to 1) to `onLevel`. */
  start: (onLevel: (level: number) => void) => Promise<void>;
  /** Stops listening, with everything heard. */
  finish: () => Promise<string>;
  cancel: () => void;
}

// `modules/dictation`, loaded optionally: builds made before it was added
// have no microphone in the composer.
const native = requireOptionalNativeModule<DictationModule>("VeraDictation");

function supported() {
  try {
    return native?.support().available ?? false;
  } catch {
    return false;
  }
}

function nativeEngine(module: DictationModule) {
  let levels: Subscription | undefined;
  function stopLevels() {
    levels?.remove();
    levels = undefined;
  }
  return {
    permissions: () => module.requestPermissionsAsync(),
    start: (onLevel) => {
      stopLevels();
      levels = module.addListener("onLevel", (event) => onLevel(event.level));
      return module.startAsync();
    },
    finish: () => module.finishAsync().finally(stopLevels),
    cancel: () => {
      stopLevels();
      module.cancel();
    },
  } satisfies DictationEngine;
}

const onPhone = native === null || !supported() ? null : nativeEngine(native);

/**
 * A stand-in that "hears" `text`, for checking the composer in a
 * simulator without speaking (`globalThis.veraDev.dictation`).
 */
function fakeEngine(text: string) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  return {
    permissions: () => Promise.resolve({ granted: true }),
    start: (onLevel) => {
      timer = setInterval(() => {
        step += 1;
        // Words and the pauses between them.
        const speaking = step % 14 < 10;
        onLevel(speaking ? 0.35 + 0.6 * Math.abs(Math.sin(step * 1.7)) : 0.04);
      }, LEVEL_MS);
      return Promise.resolve();
    },
    finish: () => {
      clearInterval(timer);
      return new Promise((resolve) => setTimeout(() => resolve(text), 500));
    },
    cancel: () => clearInterval(timer),
  } satisfies DictationEngine;
}

let fake: DictationEngine | undefined;

/** Dev only: dictation "hears" `text` instead of the microphone; null stops. */
export function fakeDictation(text: string | null) {
  fake = text === null ? undefined : fakeEngine(text);
}

/** The engine to dictate with, or null where this phone can't. */
export function dictationEngine() {
  return fake ?? onPhone;
}
