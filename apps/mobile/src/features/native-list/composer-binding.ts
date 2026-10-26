import type { ComposerBinding } from "./contract";
import { MessageListComposer } from "./native";

/** Shared legacy and bound paths transport this same gap exactly once. */
export const COMPOSER_GAP = 8;

/** The paired prop is absent on binaries that cannot mount its host. */
export function composerBinding(owner: string, release: number) {
  return MessageListComposer === null
    ? undefined
    : ({ owner, release, gap: COMPOSER_GAP } satisfies ComposerBinding);
}
