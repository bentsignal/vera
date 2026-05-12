import { Polar } from "@polar-sh/sdk";

import { env } from "../convex.env";

export function getPolarClient() {
  return new Polar({
    accessToken: env.POLAR_ORGANIZATION_TOKEN,
    server: env.POLAR_SERVER,
  });
}
