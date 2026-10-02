import { discoverPds } from "@decentralized-convex/address";
import { assertPdsSupportsApi } from "@decentralized-convex/client";
import { pds } from "@vera/backend/pds";

/**
 * Looks up the home PDS for an account domain through its `_pds` DNS
 * record, and checks that it serves every protocol the app uses.
 */
export async function discoverHome(domain: string) {
  return assertPdsSupportsApi(await discoverPds(domain), pds);
}
