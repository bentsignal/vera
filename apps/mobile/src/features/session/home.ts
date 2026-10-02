import { discoverPds } from "@decentralized-convex/address";
import { assertPdsSupportsApi } from "@decentralized-convex/client";
import { pds } from "@vera/backend/pds";

import { env } from "~/env";

/**
 * Looks up the home PDS for this build's account domain through its
 * `_pds` DNS record, and checks that it serves every protocol the app uses.
 */
export async function discoverHome() {
  return assertPdsSupportsApi(await discoverPds(env.veraDomain), pds);
}
