import type {
  DiscoverPdsOptions as AddressDiscoveryOptions,
  DiscoveredPds,
} from "@decentralized-convex/address";
import {
  parseAddress,
  discoverPds as resolvePds,
} from "@decentralized-convex/address";

import { assertPdsSupportsApi } from "./compatibility.ts";

export interface DiscoverPdsOptions extends AddressDiscoveryOptions {
  address: string;
  api: object;
}

export interface DiscoveredPdsSelection {
  home: DiscoveredPds;
  username: string;
}

export async function discoverPds({
  address,
  api,
  ...options
}: DiscoverPdsOptions): Promise<DiscoveredPdsSelection> {
  const { domain, username } = parseAddress(address);
  const home = assertPdsSupportsApi(await resolvePds(domain, options), api);
  return { home, username };
}
