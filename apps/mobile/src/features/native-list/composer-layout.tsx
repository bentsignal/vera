import type { ReactNode } from "react";

import type { ComposerBinding, ComposerHost } from "./contract";
import { MessageListComposer } from "./native";

/** Shared legacy and bound paths transport this same gap exactly once. */
export const COMPOSER_GAP = 8;

/** The paired prop is absent on binaries that cannot mount its host. */
export function composerBinding(owner: string, release: number) {
  return MessageListComposer === null
    ? undefined
    : ({ owner, release, gap: COMPOSER_GAP } satisfies ComposerBinding);
}

/**
 * No drawing or sizing of its own. Native observes this mounted host after
 * the surface's props and layout, keeping ordinary composer growth on UI.
 * Old binaries and the RN list keep the existing bar without another host.
 */
export function ComposerLayout({
  enabled,
  owner,
  sequence,
  children,
}: ComposerHost & { enabled: boolean; children: ReactNode }) {
  if (!enabled || MessageListComposer === null) return children;
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
