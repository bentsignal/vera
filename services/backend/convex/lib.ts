export function requireEnvironment(name: string) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function actorFromEmail(email: string) {
  const separator = email.indexOf("@");
  const localPart = email.slice(0, separator === -1 ? undefined : separator);
  if (localPart.length === 0) {
    throw new Error("The authenticated account has no usable email address");
  }
  return `${localPart.toLowerCase()}@${requireEnvironment("FEDERATION_DOMAIN").toLowerCase()}`;
}
