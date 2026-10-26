import { useSyncExternalStore } from "react";
import { AppState, Keyboard } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import { BREAKING_VERSION } from "@vera/backend/breaking-version";
import { Uniwind } from "uniwind";

import { saveDraftsNow } from "~/features/conversation/drafts";
import { hasUnsentMessages } from "~/features/messaging/outbox";
import { queryClient } from "~/features/session/account-session";
import { canContinue, GIVE_UP_MS, launchStep } from "./launch-gate";
import { releaseSplash } from "./launch-splash";
import { canRestartForUpdate } from "./restart-policy";
import { focusedScreen, forgetScreen, saveScreen } from "./update-screen";

// Over-the-air updates go in as soon as they can without interrupting
// anyone, so nobody keeps running old code against a newer backend. Every
// launch and every return from the background checks for one, and so does
// every minute in the foreground; it downloads without showing anything.
// The app then restarts into it behind a screen like the splash and reopens
// on the same screen: at once while it's still opening, otherwise at the
// first quiet moment (see `restart-policy.ts`).
//
// A launch (not a return from the background) waits for its update
// instead, so it opens on the latest one: a new install from the store or
// TestFlight may be dozens of updates behind. The splash stays up while
// expo-updates checks and downloads; past 1.5 seconds "Updating Vera…"
// shows, and the app restarts into the update when it lands. A stall, the
// "Continue Without Updating" button, or a time limit always opens the app
// (see `launch-gate.ts`).
//
// A backend deploy that raises the breaking version (see
// services/backend/breaking-version.ts) can't wait for that: the moment its
// live query reports a version above this app's, the app covers the screen
// with "Updating Vera…", looks for the update every 2 seconds (it's
// published seconds after the deploy), and restarts into it at once.

/** How often an app in the foreground checks for an update. */
const CHECK_EVERY_MS = 60_000;
/** How often a launch waiting for its update looks at how it's going. */
const GATE_TICK_MS = 250;
/** How often the foreground timer runs: checks, and watching for a pause. */
const TICK_MS = 1_000;
/** While an update is required, how often to look for it. */
const REQUIRED_CHECK_MS = 2_000;
/**
 * How long a required update may take to appear. Longer, and this binary
 * is too old for any over-the-air update and needs one from the store.
 */
const REQUIRED_WAIT_MS = 3 * 60_000;

let openedAt = Date.now();
let touchedAt = openedAt;
let checkedAt = 0;
let checking = false;
let downloaded = false;
let restarting = false;
let ticker: ReturnType<typeof setInterval> | undefined;

/**
 * Set when the backend needs a newer app: "updating" while the update is
 * on its way, "store" when no over-the-air update can fix this binary.
 */
let required: "store" | "updating" | undefined;
let requiredSince = 0;

/** The launch's wait for its update, while it lasts. */
let gate:
  | {
      readonly startedAt: number;
      heardAt: number;
      coverShownAt: number | undefined;
      readonly stop: () => void;
    }
  | undefined;
/**
 * What the launch's wait shows over the app, if anything: "Updating Vera…",
 * or that with "Continue Without Updating".
 */
let launchCover: "continue" | "updating" | undefined;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setRequired(next: typeof required) {
  if (required === next) return;
  required = next;
  notify();
}

function setLaunchCover(next: typeof launchCover) {
  if (launchCover === next) return;
  launchCover = next;
  notify();
}

/** Whether the backend needs a newer app than this one; `UpdateCover` shows it. */
export function useRequiredUpdate() {
  return useSyncExternalStore(subscribe, () => required);
}

/** What the launch's wait for its update shows; `UpdateCover` shows it. */
export function useLaunchCover() {
  return useSyncExternalStore(subscribe, () => launchCover);
}

/** "Continue Without Updating": the update goes in later instead. */
export function continueWithoutUpdating() {
  openApp();
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
  if (__DEV__ || !Updates.isEnabled) {
    releaseSplash();
    return;
  }
  waitForLaunchUpdate();
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
      keyboardVisible: Keyboard.isVisible(),
      now,
      openedAt,
      pendingMutations: queryClient.isMutating(),
      touchedAt,
      unsentMessages: hasUnsentMessages(),
      viewingMedia: focusedScreen() === "media",
    });
  // While the launch waits for its update, it restarts on its own terms.
  if (!ready || gate !== undefined) return;
  await restart();
}

async function restart() {
  if (restarting) return;
  restarting = true;
  saveDraftsNow();
  saveScreen(Date.now());
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
    openApp();
  }
}

/**
 * Keeps a launch on the splash, then "Updating Vera…", while expo-updates
 * checks for and downloads an update, and restarts into it when it lands.
 * Only a launch in the foreground waits, and only while expo-updates is
 * still working on its launch check: not after a restart into an update, or
 * after a downloaded update failed and the app fell back to the built-in one.
 */
function waitForLaunchUpdate() {
  const context = Updates.latestContext;
  if (
    AppState.currentState === "background" ||
    Updates.isEmergencyLaunch ||
    context.restartCount > 0 ||
    !(context.isStartupProcedureRunning || context.isUpdatePending)
  ) {
    releaseSplash();
    return;
  }
  // The backstop, never cancelled: it opens the app even if a restart
  // hangs or nothing below works. Opening twice is harmless.
  setTimeout(openApp, GIVE_UP_MS);
  const startedAt = Date.now();
  // expo-updates' own state events (`useUpdates` uses them too) report the
  // launch's check and download as they go.
  const subscription = Updates.addUpdatesStateChangeListener(() => {
    if (gate !== undefined) gate.heardAt = Date.now();
    stepLaunch();
  });
  const interval = setInterval(stepLaunch, GATE_TICK_MS);
  gate = {
    coverShownAt: undefined,
    heardAt: startedAt,
    startedAt,
    stop: () => {
      subscription.remove();
      clearInterval(interval);
    },
  };
  stepLaunch();
}

function stepLaunch() {
  if (gate === undefined) return;
  const now = Date.now();
  const state = {
    coverShownAt: gate.coverShownAt,
    heardAt: gate.heardAt,
    now,
    running: Updates.latestContext.isStartupProcedureRunning,
    startedAt: gate.startedAt,
    updateReady: Updates.latestContext.isUpdatePending,
  };
  const step = launchStep(state);
  if (step === "cover") {
    if (gate.coverShownAt === undefined) {
      gate.coverShownAt = now;
      // The cover is the splash's color, so the words fade in over it.
      void SplashScreen.hideAsync();
    }
    setLaunchCover(canContinue(state) ? "continue" : "updating");
  } else if (step === "open") {
    openApp();
  } else if (step === "restart") {
    // The cover, if it's up, stays until the app restarts.
    gate.stop();
    gate = undefined;
    void restart();
  }
}

/** Ends the launch's wait for its update and shows the app as it is. */
function openApp() {
  gate?.stop();
  gate = undefined;
  setLaunchCover(undefined);
  releaseSplash();
}
