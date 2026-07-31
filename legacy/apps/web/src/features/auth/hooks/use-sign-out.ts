import { useClerk } from "@clerk/tanstack-react-start";

export function useSignOut() {
  const clerk = useClerk();
  // Clerk's TanStack Start SDK soft-navs for redirectUrl/afterSignOutUrl,
  // which leaves the cached clerkAuthQueryOptions and the Convex client's
  // in-memory JWT intact. A hard nav is required to fully tear down.
  return async () => {
    await clerk.signOut();
    window.location.replace("/");
  };
}
