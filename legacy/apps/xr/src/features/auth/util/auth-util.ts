import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";

export const getSessionData = createServerFn({ method: "GET" }).handler(
  async () => {
    const { userId } = await auth();
    return {
      uid: userId,
    };
  },
);

export const getAuthToken = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getToken } = await auth();
    return (await getToken({ template: "convex" })) ?? undefined;
  },
);
