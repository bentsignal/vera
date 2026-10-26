import type { ReactNode } from "react";

import type { ComposerHost } from "./contract";
import { MessageListComposer } from "./native";

/**
 * No drawing or sizing of its own. Native observes this mounted host after
 * the surface's props and layout, keeping ordinary composer growth on UI.
 * Binaries without `composerLayout` keep the existing bar without a host.
 */
export function ComposerLayout({
  owner,
  sequence,
  children,
}: ComposerHost & { children: ReactNode }) {
  if (MessageListComposer === null) return children;
  return (
    <MessageListComposer
      owner={owner}
      sequence={sequence}
      collapsable={false}
      accessible={false}
      style={{ alignSelf: "stretch" }}
    >
      {children}
    </MessageListComposer>
  );
}
