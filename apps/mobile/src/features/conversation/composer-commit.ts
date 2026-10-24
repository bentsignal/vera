import { useLayoutEffect, useSyncExternalStore } from "react";

import type { ComposerReport } from "./composer-height";
import { clearIsCommitted } from "./send-commit";

/** A send's own committed clear, including unchanged height and no callback. */
export function useComposerCommit(
  { bar, sendCommit, roomCloses }: ComposerReport,
  clear: number,
  files: readonly string[],
) {
  const send = useSyncExternalStore(sendCommit.subscribe, sendCommit.read);
  useLayoutEffect(() => {
    if (roomCloses || !clearIsCommitted(send, clear, files)) return;
    const host = bar.current;
    // This host disappears with its composer; no old instance can ACK a new one.
    if (host === null) return;
    sendCommit.acknowledge(send.sequence, host.getBoundingClientRect().height);
  });
}
