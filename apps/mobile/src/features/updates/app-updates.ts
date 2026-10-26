import { useEffect, useSyncExternalStore } from "react";
import { AppState, Keyboard } from "react-native";
import { File, Paths } from "expo-file-system";
import { useNavigationContainerRef } from "expo-router";
import * as Updates from "expo-updates";
import { BREAKING_VERSION } from "@vera/backend/breaking-version";
import { Uniwind } from "uniwind";

import { saveDraftsNow } from "~/features/conversation/drafts";
import { hasUnsentMessages } from "~/features/messaging/outbox";
import { queryClient } from "~/features/session/account-session";
import { releaseSplash } from "./launch-splash";
import { canRestartForUpdate } from "./restart-policy";

// Over-the-air updates go in as soon as they can without interrupting
// anyone, so nobody keeps running old code against a newer backend. Every
// launch and every return from the background checks for one, and so does
// every minute in the foreground; it downloads without showing anything.
// The app then restarts into it behind a screen like the splash and reopens
// on the same screen: at once while it's still opening, otherwise at the
// first quiet moment (see `restart-policy.ts`).
//
// A launch of the bundle built into the binary (a new install from the
// store or TestFlight) may be dozens of updates behind. It keeps the splash
// up while it checks and downloads, for up to 6 seconds, so it opens on
// the latest update; if the download takes longer, the update goes in as
// soon as it lands, without waiting for a pause.
//
// A backend deploy that raises the breaking version (see
// services/backend/breaking-version.ts) can't wait for that: the moment its
// live query reports a version above this app's, the app covers the screen
// with "Updating Vera…", looks for the update every 2 seconds (it's
// published seconds after the deploy), and restarts into it at once.

type NavigationRef = ReturnType<typeof useNavigationContainerRef>;
type RootState = NonNullable<Parameters<NavigationRef["resetRoot"]>[0]>;

/** How often an app in the foreground checks for an update. */
const CHECK_EVERY_MS = 60_000;
/** How long a launch of the built-in bundle holds the splash for an update. */
const EMBEDDED_SPLASH_MS = 6_000;
/** How often the foreground timer runs: checks, and watching for a pause. */
const TICK_MS = 1_000;
/** While an update is required, how often to look for it. */
const REQUIRED_CHECK_MS = 2_000;
/**
 * How long a required update may take to appear. Longer, and this binary
 * is too old for any over-the-air update and needs one from the store.
 */
const REQUIRED_WAIT_MS = 3 * 60_000;
/** A screen saved longer ago than this belongs to some other restart. */
const RESTORE_WITHIN_MS = 30_000;
/** How long to wait for the navigator to mount before giving up on it. */
const RESTORE_FRAMES = 60;

let openedAt = Date.now();
let touchedAt = openedAt;
let checkedAt = 0;
let checking = false;
let downloaded = false;
let restarting = false;
let ticker: ReturnType<typeof setInterval> | undefined;
let navigation: NavigationRef | undefined;

/**
 * Set when the backend needs a newer app: "updating" while the update is
 * on its way, "store" when no over-the-air update can fix this binary.
 */
let required: "store" | "updating" | undefined;
let requiredSince = 0;
const requiredListeners = new Set<() => void>();

function setRequired(next: typeof required) {
  if (required === next) return;
  required = next;
  for (const listener of requiredListeners) listener();
}

function subscribeRequired(listener: () => void) {
  requiredListeners.add(listener);
  return () => requiredListeners.delete(listener);
}

/** Whether the backend needs a newer app than this one; `UpdateCover` shows it. */
export function useRequiredUpdate() {
  return useSyncExternalStore(subscribeRequired, () => required);
}

/** Takes the backend's breaking version from its live query. */
export function noteServerBreakingVersion(version: number) {
  if (version <= BREAKING_VERSION || required !== undefined) return;
  if (__DEV__) {
    // A dev client can't update itself, and other worktrees share the dev
    // PDS: say so instead of covering the app.
    console.warn(
      `This app is on breaking version ${String(BREAKING_VERSION)}, its backend on ${String(version)}: merge main to catch up.`,
    );
    return;
  }
  requiredSince = Date.now();
  setRequired("updating");
  ticker ??= setInterval(tick, TICK_MS);
  void (downloaded ? restartIfUnnoticed() : check());
}

/**
 * Checks for updates on launch, on every return from the background, and
 * every minute in the foreground.
 */
export function installAppUpdates() {
  if (__DEV__ || !Updates.isEnabled || !Updates.isEmbeddedLaunch) {
    releaseSplash();
  } else {
    setTimeout(() => {
      if (!restarting) releaseSplash();
    }, EMBEDDED_SPLASH_MS);
  }
  if (__DEV__ || !Updates.isEnabled) return;
  // "inactive" (Control Center, Face ID, a system alert) isn't an open; only
  // coming back from the background is. A launch in the background, as for a
  // notification, waits for the app to open too.
  let wasInBackground = AppState.currentState === "background";
  AppState.addEventListener("change", (state) => {
    if (state === "background") {
      wasInBackground = true;
      clearInterval(ticker);
      ticker = undefined;
    }
    if (state !== "active" || !wasInBackground) return;
    wasInBackground = false;
    onOpen();
  });
  if (!wasInBackground) onOpen();
}

/** Marks the screen as in use; the root view calls it on every touch. */
export function noteTouch() {
  touchedAt = Date.now();
}

function onOpen() {
  openedAt = Date.now();
  touchedAt = openedAt;
  ticker ??= setInterval(tick, TICK_MS);
  void (downloaded ? restartIfUnnoticed() : check());
}

function tick() {
  const now = Date.now();
  if (downloaded) {
    void restartIfUnnoticed();
    return;
  }
  if (required === "updating" && now - requiredSince >= REQUIRED_WAIT_MS) {
    setRequired("store");
  }
  const every = required === undefined ? CHECK_EVERY_MS : REQUIRED_CHECK_MS;
  if (now - checkedAt >= every) void check();
}

async function check() {
  if (checking) return;
  checking = true;
  checkedAt = Date.now();
  // Offline, or the update server is down: the next check tries again.
  downloaded = await download().catch(() => false);
  checking = false;
  if (downloaded) await restartIfUnnoticed();
  // A restart keeps the splash up; otherwise the app shows.
  if (!restarting) releaseSplash();
}

/** Downloads a newer update, if there is one. */
async function download() {
  // At launch this waits for the update the native side is already
  // downloading, then finds it on disk.
  const update = await Updates.checkForUpdateAsync();
  if (!update.isAvailable && !update.isRollBackToEmbedded) return false;
  const fetched = await Updates.fetchUpdateAsync();
  return fetched.isNew || fetched.isRollBackToEmbedded;
}

async function restartIfUnnoticed() {
  const now = Date.now();
  // A required update goes in at once: the app can't work until it does.
  const ready =
    required !== undefined ||
    canRestartForUpdate({
      active: AppState.currentState === "active",
      embeddedLaunch: Updates.isEmbeddedLaunch,
      keyboardVisible: Keyboard.isVisible(),
      now,
      openedAt,
      pendingMutations: queryClient.isMutating(),
      touchedAt,
      unsentMessages: hasUnsentMessages(),
      viewingMedia: focusedScreen() === "media",
    });
  if (!ready || restarting) return;
  restarting = true;
  saveDraftsNow();
  saveScreen(now);
  try {
    await Updates.reloadAsync({
      reloadScreenOptions: {
        // The splash's colors, so the restart looks like the app opening.
        backgroundColor:
          Uniwind.currentTheme === "dark" ? "#000000" : "#FFFFFF",
        fade: true,
        spinner: { enabled: false },
      },
    });
  } catch {
    // The update goes in on the next launch instead; `restarting` stays set
    // so this launch doesn't keep trying.
    forgetScreen();
    releaseSplash();
  }
}

function screenFile() {
  return new File(Paths.cache, "screen-before-update.json");
}

function forgetScreen() {
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
function focusedScreen() {
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

function saveScreen(now: number) {
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
