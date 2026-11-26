// Fetching an address someone else chose (a link in a message, another
// server's key file) without letting it reach what's beside the server:
// every hop of a redirect is checked before it's followed, only the standard
// web ports are used, and a name is looked up first so one that points at a
// private address is refused too.
//
// The lookup is DNS over HTTPS: Convex's default runtime has no DNS API of
// its own. `fetch` then looks the name up again by itself, so a name whose
// answer changes between the two lookups can still get through. A
// self-hosted PDS should also block private addresses at its network edge
// (services/backend/README.md, "Self-hosting").

/** IPv4 ranges that aren't the public internet, as [first octets, bits]. */
const PRIVATE_IPV4: readonly (readonly [number, number, number])[] = [
  [0, 0, 8], // "this" network
  [10, 0, 8], // private
  [100, 64, 10], // carrier-grade NAT
  [127, 0, 8], // loopback
  [169, 254, 16], // link-local, including cloud metadata services
  [172, 16, 12], // private
  [192, 0, 24], // protocol assignments
  [192, 168, 16], // private
  [198, 18, 15], // benchmarking
  [224, 0, 3], // multicast and reserved
];

function ipv4Value(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function isPrivateIpv4Value(address: number) {
  return PRIVATE_IPV4.some(([a, b, bits]) => {
    const start = a * 2 ** 24 + b * 2 ** 16;
    return address >= start && address < start + 2 ** (32 - bits);
  });
}

/**
 * Whether an IPv6 address (as the URL parser writes it, lowercase and
 * compressed) is outside the public internet. Addresses that carry an IPv4
 * one inside (mapped, NAT64, 6to4) are refused whole.
 */
function isPrivateIpv6(host: string) {
  return (
    // Unspecified, loopback, and IPv4-mapped or -compatible.
    host.startsWith("::") ||
    host.startsWith("64:ff9b:") ||
    host.startsWith("2002:") ||
    /^f[cd]/.test(host) ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("ff")
  );
}

/** Whether an IP address, v4 or v6, is outside the public internet. */
export function isPrivateIpAddress(address: string) {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) return isPrivateIpv6(host);
  const value = ipv4Value(host);
  return value === null || isPrivateIpv4Value(value);
}

/** Whether a host is written as an IP address rather than a name. */
function isIpLiteral(host: string) {
  return host.includes(":") || /^[\d.]+$/.test(host);
}

export interface PublicUrlOptions {
  /** Refuse plain http as well. */
  readonly httpsOnly?: boolean;
}

function parseUrl(value: string | URL) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Whether a host, name or address, is one on the public internet. */
function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) return !isPrivateIpAddress(host);
  return (
    host.includes(".") &&
    !/(?:^|\.)(?:localhost|local|internal|lan|home\.arpa)\.?$/.test(host)
  );
}

/**
 * Whether the server may fetch a URL, by its text alone: http(s) on the
 * standard port, to a public host. Names on the local network and private,
 * loopback, and link-local addresses are refused.
 */
export function isPublicWebUrl(
  value: string | URL,
  { httpsOnly = false }: PublicUrlOptions = {},
) {
  const url = parseUrl(value);
  if (url === null) return false;
  const schemes = httpsOnly ? ["https:"] : ["https:", "http:"];
  // The URL parser drops a scheme's default port, so anything left is
  // some other port.
  return (
    schemes.includes(url.protocol) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    isPublicHost(url.hostname)
  );
}

/** What a hostname resolves to, for checking before a fetch. */
export type ResolveHost = (host: string) => Promise<readonly string[]>;

/** Looks a name's A and AAAA records up over DNS over HTTPS. */
export function resolveHostWithDoh(fetcher: typeof fetch = fetch): ResolveHost {
  return async (host) => {
    const answers = await Promise.all(
      (["A", "AAAA"] as const).map(async (type) => {
        const url = new URL("https://cloudflare-dns.com/dns-query");
        url.searchParams.set("name", host);
        url.searchParams.set("type", type);
        const response = await fetcher(url, {
          headers: { accept: "application/dns-json" },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`DNS lookup failed (${response.status})`);
        }
        const payload: unknown = await response.json();
        const status = field(payload, "Status");
        // NXDOMAIN: there's nothing to reach.
        if (status === 3) return [];
        if (status !== 0) throw new Error("DNS lookup failed");
        const answer = field(payload, "Answer");
        return Array.isArray(answer)
          ? answer.flatMap((record: unknown) => {
              const kind = field(record, "type");
              const data = field(record, "data");
              return (kind === 1 || kind === 28) && typeof data === "string"
                ? [data]
                : [];
            })
          : [];
      }),
    );
    return answers.flat();
  };
}

export class PublicFetchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicFetchRefused";
  }
}

export interface PublicFetchOptions extends PublicUrlOptions {
  /** The fetch each hop uses (and the DNS lookup, unless `resolveHost`). */
  readonly fetch?: typeof fetch;
  /** Redirects followed before giving up. */
  readonly maxRedirects?: number;
  readonly resolveHost?: ResolveHost;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Where a response redirects to, or null when it isn't a redirect. */
function redirectOf(response: Response, from: URL) {
  const location = response.headers.get("location");
  return REDIRECT_STATUSES.has(response.status) && location !== null
    ? new URL(location, from)
    : null;
}

/**
 * A GET `fetch` for an address someone else chose: each URL, the first and
 * every redirect, must pass `isPublicWebUrl` and resolve only to public
 * addresses before it's requested. Throws `PublicFetchRefused` for one
 * that doesn't. The response's `url` is the last hop's.
 */
export async function fetchPublic(
  input: string | URL,
  init: Omit<RequestInit, "body" | "method"> = {},
  options: PublicFetchOptions = {},
): Promise<Response> {
  const fetcher = options.fetch ?? fetch;
  const resolve = options.resolveHost ?? resolveHostWithDoh(fetcher);
  const maxRedirects = options.maxRedirects ?? 5;
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    await requirePublic(url, options, resolve);
    const response = await fetcher(url, {
      ...init,
      method: "GET",
      redirect: "manual",
    });
    const next = redirectOf(response, url);
    if (next === null) return withUrl(response, url);
    await response.body?.cancel();
    if (hop >= maxRedirects) throw new PublicFetchRefused("Too many redirects");
    url = next;
  }
}

async function requirePublic(
  url: URL,
  options: PublicUrlOptions,
  resolve: ResolveHost,
) {
  if (!isPublicWebUrl(url, options)) {
    throw new PublicFetchRefused(`Refused to fetch ${url.origin}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) return;
  const addresses = await resolve(host);
  if (addresses.length === 0 || addresses.some(isPrivateIpAddress)) {
    throw new PublicFetchRefused(`Refused to fetch ${url.origin}`);
  }
}

/** The response, with `url` set to where it came from. */
function withUrl(response: Response, url: URL) {
  if (response.url === url.href) return response;
  Object.defineProperty(response, "url", { value: url.href });
  return response;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}
