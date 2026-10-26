import { useEffect } from "react";
import { File, Paths } from "expo-file-system";
import { useNavigationContainerRef } from "expo-router";

// The screen the app was on when it restarted into an update, saved before
// the restart and reopened after it, so a restart reads as a blink.

type NavigationRef = ReturnType<typeof useNavigationContainerRef>;
type RootState = NonNullable<Parameters<NavigationRef["resetRoot"]>[0]>;

/** A screen saved longer ago than this belongs to some other restart. */
const RESTORE_WITHIN_MS = 30_000;
/** How long to wait for the navigator to mount before giving up on it. */
const RESTORE_FRAMES = 60;

let navigation: NavigationRef | undefined;

function screenFile() {
  return new File(Paths.cache, "screen-before-update.json");
}

export function forgetScreen() {
  try {
    screenFile().delete();
  } catch {
    // Never saved.
  }
}

interface Navigated {
  readonly index?: number;
  readonly routes: readonly {
    readonly name: string;
    readonly params?: object;
    readonly state?: Navigated;
  }[];
}

/**
 * Only the screens' names and params. Restoring this partial state rebuilds
 * each navigator, which drops any screen the update renamed or removed.
 */
// eslint-disable-next-line no-restricted-syntax -- It calls itself, and TypeScript can't infer a return type that refers to itself.
function partialState(state: Navigated): Navigated {
  return {
    index: state.index,
    routes: state.routes.map((route) => ({
      name: route.name,
      params: route.params,
      state: route.state && partialState(route.state),
    })),
  };
}

/** The name of the screen in front, at the end of the focused routes. */
export function focusedScreen() {
  if (navigation?.isReady() !== true) return undefined;
  return focusedIn(navigation.getRootState());
}

function focusedIn(root: Navigated) {
  let route = root.routes[root.index ?? 0];
  while (route?.state !== undefined) {
    route = route.state.routes[route.state.index ?? 0];
  }
  return route?.name;
}

export function saveScreen(now: number) {
  if (navigation?.isReady() !== true) return;
  try {
    const state = partialState(navigation.getRootState());
    screenFile().write(JSON.stringify({ savedAt: now, state }));
  } catch {
    // The app reopens on Home instead.
  }
}

function isRootState(value: unknown): value is RootState {
  return (
    typeof value === "object" &&
    value !== null &&
    "routes" in value &&
    Array.isArray(value.routes)
  );
}

/** A saved screen, if it's from the restart that started this launch. */
function recentScreen(saved: unknown) {
  if (typeof saved !== "object" || saved === null) return undefined;
  if (!("savedAt" in saved) || !("state" in saved)) return undefined;
  const { savedAt, state } = saved;
  if (typeof savedAt !== "number" || !isRootState(state)) return undefined;
  return Date.now() - savedAt <= RESTORE_WITHIN_MS ? state : undefined;
}

/** The screen the app was on before restarting into an update, read once. */
function takeSavedScreen() {
  const file = screenFile();
  if (!file.exists) return undefined;
  try {
    const text = file.textSync();
    forgetScreen();
    return recentScreen(JSON.parse(text));
  } catch {
    forgetScreen();
    return undefined;
  }
}

/**
 * Lets an update restart save which screen is open, and reopens the screen
 * saved by the restart that started this launch. Returns the cleanup.
 */
function attachNavigation(ref: NavigationRef) {
  navigation = ref;
  const saved = takeSavedScreen();
  let frame: number | undefined;
  let framesLeft = RESTORE_FRAMES;
  function restore() {
    if (saved === undefined) return;
    if (ref.isReady()) {
      ref.resetRoot(saved);
      return;
    }
    framesLeft -= 1;
    if (framesLeft > 0) frame = requestAnimationFrame(restore);
  }
  restore();
  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (navigation === ref) navigation = undefined;
  };
}

/** Connects update restarts to the app's navigation. */
export function UpdateNavigation() {
  const ref = useNavigationContainerRef();
  // eslint-disable-next-line no-restricted-syntax -- The navigation container lives outside React's data flow: restarts read its state, and the screen saved before one is restored into it once.
  useEffect(() => attachNavigation(ref), [ref]);
  return null;
}
