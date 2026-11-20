import type { MentionCandidate } from "./mention-text";
import { useProfiles } from "~/features/messaging/profiles";

/**
 * Who can be @mentioned, with their names and photos once something is
 * being typed. A channel's members are everyone in its space, which its
 * screen doesn't load for anything else, so they load only then, a moment
 * before an @ could need them. (A group's are loaded already.)
 */
export function useMentionNames(
  candidates: readonly MentionCandidate[] | undefined,
  typing: boolean,
) {
  const profileOf = useProfiles(
    typing ? (candidates?.map(({ accountId }) => accountId) ?? []) : [],
  );
  if (!typing) return candidates;
  return candidates?.map((candidate) => {
    const { avatarUrl, displayName } = profileOf(candidate.accountId);
    return { ...candidate, avatarUrl, displayName };
  });
}
