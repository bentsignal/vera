import type { ReactNode } from "react";
import { createContext, use, useState } from "react";

type GroupMembers = readonly [
  members: string[],
  setMembers: (members: string[]) => void,
];

const GroupMembersContext = createContext<GroupMembers | null>(null);

/**
 * The people picked for a new group, shared by New Message's steps: the
 * picker adds them, and the name step can remove them again, which the
 * picker shows on the way back.
 */
export function GroupMembersProvider({ children }: { children: ReactNode }) {
  const state = useState<string[]>([]);
  return <GroupMembersContext value={state}>{children}</GroupMembersContext>;
}

export function useGroupMembers() {
  const state = use(GroupMembersContext);
  if (state === null) {
    throw new Error("useGroupMembers needs a GroupMembersProvider");
  }
  return state;
}
