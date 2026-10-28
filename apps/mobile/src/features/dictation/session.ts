import { useSyncExternalStore } from "react";
import { Alert, Linking } from "react-native";
import { Easing, makeMutable, withTiming } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

import type { DictationEngine } from "./engine";
import { readDraft, saveDraftText } from "~/features/conversation/drafts";
import { showToast } from "~/features/toast/store";
import { errorBuzz, selectionTick } from "~/lib/native-extras";
import { dictationEngine, LEVEL_MS } from "./engine";
import { withDictation } from "./joined";

// One dictation at a time, for the whole app. It belongs to the draft it
// was started in, and keeps going while you look at other conversations
// or switch apps; that draft's composer shows it whenever it's on screen.

/** The levels the waveform keeps; more than it can show. */
export const LEVEL_COUNT = 72;
/**
 * The confirm button's spinner shows at least this long, so a quick
 * transcription doesn't flash it.
 */
const LEAST_SPINNER_MS = 350;
/** The waveform has faded out this long after dictation ends. */
const CLEAR_AFTER_MS = 300;
/** Gives up waiting for the last words after this long. */
const FINISH_TIMEOUT_MS = 8000;

export type DictationPhase = "finishing" | "idle" | "recording";

interface State {
  /** The draft being dictated into, from `draftKey`. */
  readonly key: string | null;
  readonly phase: DictationPhase;
}

const IDLE = { key: null, phase: "idle" } satisfies State;

let state: State | undefined;

function current() {
  return state ?? IDLE;
}
const listeners = new Set<() => void>();

/**
 * The same, for the UI thread, where the composer animates: the draft
 * being dictated into ("" for none), its phase (0 idle, 1 recording, 2
 * finishing), and whether it ended by cancelling.
 */
export const dictating = {
  key: makeMutable(""),
  phase: makeMutable(0),
  cancelled: makeMutable(false),
};

/** No level yet, for every bar. (A worklet isn't hoisted, so it's first.) */
function silence() {
  "worklet";
  return Array.from({ length: LEVEL_COUNT }, () => 0);
}

/**
 * The microphone's recent levels, 0 to 1: the `n`th since dictation
 * started is at `n % LEVEL_COUNT`, so each new one changes one place.
 */
export const levels = makeMutable(silence());
/** How many levels have come in since dictation started. */
export const levelCount = makeMutable(0);
/**
 * How far the waveform is from where the newest level puts it, in bars: 1
 * as a level arrives, easing to 0 by the next, so it moves steadily left.
 */
export const levelShift = makeMutable(0);

const PHASES = { finishing: 2, idle: 0, recording: 1 } as const;

function set(next: State, cancelled = false) {
  state = next;
  dictating.cancelled.set(cancelled);
  dictating.key.set(next.key ?? "");
  dictating.phase.set(PHASES[next.phase]);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function addLevel(level: number) {
  "worklet";
  const count = levelCount.get();
  levels.modify((list) => {
    "worklet";
    list[count % LEVEL_COUNT] = level;
    return list;
  });
  levelCount.set(count + 1);
  levelShift.set(1);
  levelShift.set(withTiming(0, { duration: LEVEL_MS, easing: Easing.linear }));
}

function clearLevels() {
  "worklet";
  levels.set(silence());
  levelCount.set(0);
  levelShift.set(0);
}

interface Running {
  /** Changes with each dictation, so a stale one can tell. */
  readonly id: number;
  readonly engine: DictationEngine;
  /** Resolves true once it's listening, false if it never will. */
  started: Promise<boolean>;
}

let running: Running | undefined;

/** Whether dictation `id` is still the one running. */
function isRunning(id: number) {
  return running?.id === id;
}
let nextId = 1;

function end(id: number, cancelled: boolean) {
  if (!isRunning(id)) return;
  running = undefined;
  set(IDLE, cancelled);
  // Once the waveform has faded out, so the next starts from silence
  // without redrawing every bar as it appears.
  setTimeout(() => scheduleOnUI(clearLevels), CLEAR_AFTER_MS);
}

function explainDenied(denied: "microphone" | "speech" | undefined) {
  Alert.alert(
    denied === "speech"
      ? "Allow Speech Recognition"
      : "Allow Microphone Access",
    "To dictate messages, allow Vera in Settings.",
    [
      { style: "cancel", text: "Not Now" },
      { onPress: () => void Linking.openSettings(), text: "Settings" },
    ],
  );
}

async function begin(id: number, engine: DictationEngine) {
  try {
    const permission = await engine.permissions();
    if (!isRunning(id)) return false;
    if (!permission.granted) {
      end(id, true);
      explainDenied(permission.denied);
      return false;
    }
    await engine.start((level) => scheduleOnUI(addLevel, level));
    if (isRunning(id)) return true;
    // Cancelled while it started.
    engine.cancel();
    return false;
  } catch {
    if (isRunning(id)) {
      end(id, true);
      Alert.alert("Couldn't Start Dictation", "Try again in a moment.");
    }
    return false;
  }
}

/** Whether this phone can dictate. */
export function canDictate() {
  return dictationEngine() !== null;
}

/**
 * Starts dictating into the draft `key`. Only one at a time: while
 * another draft is being dictated into, it buzzes and says so instead.
 */
export function startDictation(key: string) {
  const engine = dictationEngine();
  if (engine === null || current().key === key) return;
  if (current().key !== null) {
    errorBuzz();
    showToast("Already dictating elsewhere");
    return;
  }
  const id = nextId++;
  selectionTick();
  running = { engine, id, started: Promise.resolve(false) };
  set({ key, phase: "recording" });
  running.started = begin(id, engine);
}

/** Stops dictating into `key`, dropping what was heard. */
export function cancelDictation(key: string) {
  if (current().key !== key || running === undefined) return;
  running.engine.cancel();
  end(running.id, true);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function heardBy(engine: DictationEngine) {
  return Promise.race([
    engine.finish(),
    wait(FINISH_TIMEOUT_MS).then(() => ""),
  ]).catch(() => "");
}

/**
 * Stops dictating into `key` and adds what was heard to its draft,
 * resolving the draft's new text (null if it was cancelled meanwhile). The
 * draft is saved even if its composer has closed since.
 */
export async function finishDictation(key: string) {
  const dictation = running;
  const { phase } = current();
  if (current().key !== key || phase !== "recording" || !dictation) {
    return null;
  }
  set({ key, phase: "finishing" });
  const [listening] = await Promise.all([
    dictation.started,
    wait(LEAST_SPINNER_MS),
  ]);
  const heard = listening ? await heardBy(dictation.engine) : "";
  if (!isRunning(dictation.id)) return null;
  const text = withDictation(readDraft(key).text, heard);
  saveDraftText(key, text);
  end(dictation.id, false);
  return text;
}

/** The dictation's phase for the draft `key` ("idle" for any other's). */
export function useDictationPhase(key: string) {
  const shown = useSyncExternalStore(subscribe, current);
  return shown.key === key ? shown.phase : "idle";
}
