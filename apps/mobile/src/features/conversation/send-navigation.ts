import type { SendCommit } from "./send-commit.ts";

/** Current committed geometry; a freeze before publication revokes JS arming. */
export function observedLayout(
  current: SendCommit,
  height: number,
  frozen: boolean,
) {
  if (!Number.isFinite(height) || height <= 0) return current;
  if (current.layout?.height === height && current.layout.frozen === frozen)
    return current;
  const latestArmed =
    frozen && !current.published ? false : current.latestArmed;
  return {
    ...current,
    layout: { height, frozen },
    latestArmed,
  } satisfies SendCommit;
}

/** Generic latest intent only; native owns smooth retargeting and interruption. */
export function sendNavigation(
  read: () => SendCommit,
  publish: (step: string, value: SendCommit) => void,
) {
  return {
    interruptLatest: () => {
      const current = read();
      if (!current.latestRequested) return;
      publish("latest interrupted", {
        ...current,
        latestRequested: false,
        latestArmed: false,
      });
    },
    requestLatest: () => {
      const current = read();
      if (current.sequence === 0 || current.published || current.cancelled)
        return false;
      if (!current.latestRequested)
        publish("latest requested", { ...current, latestRequested: true });
      return true;
    },
    armLatest: (sequence: number) => {
      const current = read();
      if (sequence !== current.sequence || current.cancelled) return;
      publish("latest armed", { ...current, latestArmed: true });
    },
    failLatest: (sequence: number) => {
      const current = read();
      if (sequence !== current.sequence) return;
      publish("latest failed", { ...current, latestRequested: false });
    },
    published: (sequence: number) => {
      const current = read();
      if (sequence !== current.sequence || current.published) return;
      publish("pair published", { ...current, published: true });
    },
  };
}
