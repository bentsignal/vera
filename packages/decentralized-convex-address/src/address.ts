export interface DecentralizedAddress {
  domain: string;
  username: string;
}

export function parseAddress(value: string): DecentralizedAddress {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  const username = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);

  if (separator < 1 || username.length === 0 || !isDomain(domain)) {
    throw new Error(`Invalid decentralized address: ${value}`);
  }

  return { domain, username };
}

export function formatAddress(address: DecentralizedAddress) {
  return `${address.username.trim().toLowerCase()}@${address.domain
    .trim()
    .toLowerCase()}`;
}

export function addressToTarget(value: string) {
  const address = parseAddress(value);
  return {
    id: formatAddress(address),
    url: `https://${address.domain}`,
  };
}

function isDomain(value: string) {
  if (value.length === 0 || value.includes("/") || value.includes(":")) {
    return false;
  }
  return value === "localhost" || value.includes(".");
}
