export { addressToTarget, formatAddress, parseAddress } from "./address.ts";
export type { DecentralizedAddress } from "./address.ts";
export {
  accountDomain,
  decodeDnsTxtData,
  discoverPds,
  parsePdsTxtRecord,
  PDS_DISCOVERY_RECORD_FORMAT,
  PDS_DNS_LABEL,
} from "./discovery.ts";
export type {
  DiscoverPdsOptions,
  DiscoveredPds,
  PdsManifest,
} from "./discovery.ts";
