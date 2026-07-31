import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";

export const fetchClerkAuth = createServerFn({ method: "GET" }).handler(
  async () => {
    const { userId, getToken, isAuthenticated } = await auth();
    const token = userId
      ? ((await getToken({ template: "convex" })) ?? null)
      : null;

    if (isAuthenticated && token) {
      return {
        isSignedIn: true as const,
        userId,
        token,
      };
    }
    return {
      isSignedIn: false as const,
    };
  },
);

export const clerkAuthQueryOptions = queryOptions({
  queryKey: ["__root", "clerkAuth"] as const,
  queryFn: () => fetchClerkAuth(),
  staleTime: Infinity,
  gcTime: Infinity,
});

export function buildRedirectUrl(prompt: string) {
  const params = new URLSearchParams();
  params.set("q", prompt);
  return `/new?${params.toString()}`;
}
