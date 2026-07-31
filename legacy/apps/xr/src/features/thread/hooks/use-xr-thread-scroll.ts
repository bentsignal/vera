import type { VanillaContainer } from "@react-three/uikit";
import { useEffect, useRef, useState } from "react";

import { useMessageStore } from "@acme/features/messages";

export function useXRThreadScroll({
  messagesLoaded,
}: {
  messagesLoaded: boolean;
}) {
  const ref = useRef<VanillaContainer>(null);
  const [scrollCount, setScrollCount] = useState(0);
  const numMessagesSent = useMessageStore((state) => state.numMessagesSent);

  function scrollToBottom() {
    const container = ref.current;
    if (!container) return;
    const maxY = container.maxScrollPosition.value[1];
    if (maxY == null) return;
    container.scrollPosition.value = [0, maxY];
    setScrollCount((prev) => prev + 1);
  }

  // scroll to the bottom when a new message is sent and when messages initially load
  // eslint-disable-next-line no-restricted-syntax -- Syncs scroll position with message count and initial load state
  useEffect(() => {
    if (numMessagesSent > 0 || messagesLoaded) {
      setTimeout(() => {
        scrollToBottom();
      }, 200);
    }
  }, [numMessagesSent, messagesLoaded]);

  return {
    ref,
    scrollCount,
  };
}
