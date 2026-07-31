import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { defaultTheme, isTheme } from "~/lib/theme";

export const SIDEBAR_COOKIE_NAME = "sidebar_state";

const fetchCookies = createServerFn({ method: "GET" }).handler(() => {
  const themeCookie = getCookie("theme");
  const theme =
    themeCookie && isTheme(themeCookie) ? themeCookie : defaultTheme;
  const stars = getCookie("stars") === "true";
  const sidebarOpen = getCookie(SIDEBAR_COOKIE_NAME) === "true";

  return { theme, stars, sidebarOpen };
});

export const cookiesQueryOptions = queryOptions({
  queryKey: ["__root", "cookies"],
  queryFn: () => fetchCookies(),
  staleTime: Infinity,
  gcTime: Infinity,
});
