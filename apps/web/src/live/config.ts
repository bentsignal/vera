export interface HomeServer {
  convexUrl: string;
  domain: string;
  id: "a" | "b";
  siteUrl: string;
}

export const homes: readonly HomeServer[] = [
  createHome(
    "a",
    import.meta.env.VITE_HOME_A_CONVEX_URL,
    import.meta.env.VITE_HOME_A_SITE_URL,
  ),
  createHome(
    "b",
    import.meta.env.VITE_HOME_B_CONVEX_URL,
    import.meta.env.VITE_HOME_B_SITE_URL,
  ),
];

export const conversation = {
  id: "room:general",
  targets: homes.map((home) => ({
    id: `member@${home.domain}`,
    url: home.convexUrl,
  })),
};

function createHome(
  id: HomeServer["id"],
  convexUrl: string,
  siteUrl: string,
): HomeServer {
  return {
    convexUrl,
    domain: new URL(convexUrl).hostname,
    id,
    siteUrl,
  };
}
