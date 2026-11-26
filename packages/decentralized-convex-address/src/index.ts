export { decentralizedConvexPackage } from "../metadata.ts";
export {
  ADDRESS_PATTERN,
  addressToTarget,
  formatAddress,
  isAddress,
  parseAddress,
} from "./address.ts";
export type { DecentralizedAddress } from "./address.ts";
export { DEFAULT_RESERVED_USERNAMES, isReservedUsername } from "./reserved.ts";
export {
  accountDomain,
  decodeDnsTxtData,
  discoverPds,
  parsePdsManifest,
  parsePdsTxtRecord,
  PDS_DISCOVERY_RECORD_FORMAT,
  PdsNotFoundError,
  PDS_DNS_LABEL,
} from "./discovery.ts";
export type {
  DiscoverPdsOptions,
  DiscoveredPds,
  PdsManifest,
} from "./discovery.ts";
export {
  fetchPublic,
  isPrivateIpAddress,
  isPublicWebUrl,
  PublicFetchRefused,
  resolveHostWithDoh,
} from "./public-fetch.ts";
export type {
  PublicFetchOptions,
  PublicUrlOptions,
  ResolveHost,
} from "./public-fetch.ts";
