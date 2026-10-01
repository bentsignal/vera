/** Stable DNS record format marker, not an ecosystem version. */
export const PDS_DISCOVERY_RECORD_FORMAT = "pds1";
export const PDS_DNS_LABEL = "_pds";

export interface PdsManifest {
  accountDomain: string;
  auth?: {
    issuer: string;
    jwksUrl: string;
  };
  capabilities?: readonly {
    id: string;
    lastChanged: string;
  }[];
  deploymentUrl: string;
  httpUrl: string;
  lastChanged: string;
  version: string;
}

export interface DiscoveredPds {
  domain: string;
  manifest: PdsManifest;
  manifestUrl: string;
}

export interface DiscoverPdsOptions {
  fetch?: typeof fetch;
  resolveTxt?: (name: string) => Promise<readonly string[]>;
}

export async function discoverPds(
  addressOrDomain: string,
  options: DiscoverPdsOptions = {},
): Promise<DiscoveredPds> {
  const domain = accountDomain(addressOrDomain);
  const fetcher = options.fetch ?? fetch;
  const records = await (options.resolveTxt === undefined
    ? resolveTxtWithDoh(`${PDS_DNS_LABEL}.${domain}`, fetcher)
    : options.resolveTxt(`${PDS_DNS_LABEL}.${domain}`));
  const manifestUrl = selectManifestUrl(records);
  const response = await fetcher(manifestUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`PDS manifest request failed (${response.status})`);
  }
  const manifest = parsePdsManifest(await response.json());
  if (manifest.accountDomain !== domain) {
    throw new Error(
      `PDS manifest belongs to ${manifest.accountDomain}, not ${domain}`,
    );
  }
  return { domain, manifest, manifestUrl };
}

export function accountDomain(addressOrDomain: string) {
  const input = addressOrDomain.trim().toLowerCase();
  const separator = input.lastIndexOf("@");
  const domain = (
    separator === -1 ? input : input.slice(separator + 1)
  ).replace(/\.$/, "");
  if (!isDomain(domain)) {
    throw new Error("Enter a valid username@domain address");
  }
  return domain;
}

export function parsePdsTxtRecord(record: string) {
  const fields = Object.fromEntries(
    record
      .split(";")
      .map((field) => field.trim())
      .filter(Boolean)
      .map((field) => {
        const separator = field.indexOf("=");
        return separator === -1
          ? [field, ""]
          : [field.slice(0, separator), field.slice(separator + 1)];
      }),
  );
  if (fields.v !== PDS_DISCOVERY_RECORD_FORMAT || fields.url === undefined) {
    return null;
  }
  return requireHttpsUrl(fields.url, "PDS manifest URL");
}

export function decodeDnsTxtData(data: string) {
  const segments = [...data.matchAll(/"((?:\\.|[^"\\])*)"/g)];
  if (segments.length === 0) return data.trim();
  return segments
    .map((segment) => parseJsonString(`"${segment[1] ?? ""}"`))
    .join("");
}

function parseJsonString(value: string) {
  // JSON.parse is typed as `any`; DNS TXT segments are validated immediately.
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "string") throw new Error("Invalid DNS TXT segment");
  return parsed;
}

function selectManifestUrl(records: readonly string[]) {
  const matches = records
    .map(parsePdsTxtRecord)
    .filter((url): url is string => url !== null);
  if (matches.length === 0) {
    throw new Error(
      `No ${PDS_DISCOVERY_RECORD_FORMAT} record found at the _pds DNS name`,
    );
  }
  if (matches.length > 1) {
    throw new Error("Multiple PDS discovery records were found");
  }
  const match = matches[0];
  if (match === undefined) throw new Error("PDS discovery failed");
  return match;
}

async function resolveTxtWithDoh(name: string, fetcher: typeof fetch) {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", "TXT");
  const response = await fetcher(url, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) {
    throw new Error(`DNS lookup failed (${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.Status !== 0) {
    throw new Error("The PDS DNS record could not be resolved");
  }
  if (!Array.isArray(payload.Answer)) return [];
  return payload.Answer.flatMap((answer) =>
    isRecord(answer) && answer.type === 16 && typeof answer.data === "string"
      ? [decodeDnsTxtData(answer.data)]
      : [],
  );
}

function parsePdsManifest(value: unknown): PdsManifest {
  if (!isRecord(value)) throw new Error("The PDS manifest is not an object");
  const accountDomainValue = accountDomain(requireString(value.accountDomain));
  const auth = value.auth;
  return {
    accountDomain: accountDomainValue,
    ...(auth === undefined ? {} : { auth: parseAuth(auth) }),
    ...(value.capabilities === undefined
      ? {}
      : { capabilities: parseCapabilities(value.capabilities) }),
    deploymentUrl: requireHttpsUrl(
      requireString(value.deploymentUrl),
      "Convex deployment URL",
    ),
    httpUrl: requireHttpsUrl(requireString(value.httpUrl), "PDS HTTP URL"),
    lastChanged: requireVersion(value.lastChanged, "PDS last-changed version"),
    version: requireVersion(value.version, "PDS ecosystem version"),
  };
}

function parseAuth(value: unknown) {
  if (!isRecord(value)) throw new Error("Invalid PDS auth descriptor");
  return {
    issuer: requireHttpsUrl(requireString(value.issuer), "Auth issuer"),
    jwksUrl: requireHttpsUrl(requireString(value.jwksUrl), "JWKS URL"),
  };
}

function parseCapabilities(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid PDS capabilities");
  return value.map((capability) => {
    if (!isRecord(capability)) {
      throw new Error("Invalid PDS capability");
    }
    return {
      id: requireString(capability.id),
      lastChanged: requireVersion(
        capability.lastChanged,
        "capability last-changed version",
      ),
    };
  });
}

function requireVersion(value: unknown, label: string) {
  const version = requireString(value);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${label} is invalid`);
  }
  return version;
}

function requireHttpsUrl(input: string, label: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url.toString().replace(/\/$/, "");
}

function requireString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("PDS manifest contains an invalid string");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDomain(value: string) {
  return (
    value.length <= 253 &&
    value.includes(".") &&
    value.split(".").every((label) => {
      return (
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
      );
    })
  );
}
