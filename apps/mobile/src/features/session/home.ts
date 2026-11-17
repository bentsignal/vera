import * as SecureStore from "expo-secure-store";
import {
  discoverPds,
  parsePdsManifest,
  PdsNotFoundError,
} from "@decentralized-convex/address";
import { assertPdsSupportsApi } from "@decentralized-convex/client";
import { pds } from "@vera/backend/pds";

function storageKey(domain: string) {
  return `vera.home.${domain}`;
}

function goneKey(domain: string) {
  return `vera.home-gone.${domain}`;
}

/** Whether each domain's home was gone at its last lookup, read once. */
const goneDomains = new Map<string, boolean>();

/**
 * Whether the domain had no home PDS at its last lookup (`isHomeGone`),
 * such as a server that's been deleted. Its accounts sit out from the
 * start of the next launch, rather than showing what's saved until the
 * lookup fails again.
 */
export function wasHomeGone(domain: string) {
  let gone = goneDomains.get(domain);
  if (gone === undefined) {
    gone = SecureStore.getItem(goneKey(domain)) !== null;
    goneDomains.set(domain, gone);
  }
  return gone;
}

function rememberGone(domain: string, gone: boolean) {
  if (wasHomeGone(domain) === gone) return;
  goneDomains.set(domain, gone);
  if (gone) SecureStore.setItem(goneKey(domain), "1");
  else void SecureStore.deleteItemAsync(goneKey(domain));
}

/**
 * Whether a lookup found that the domain has no home PDS (no `_pds`
 * record, or its manifest is gone): an answer, so trying again at once
 * won't change it.
 */
export function isHomeGone(error: unknown) {
  return error instanceof PdsNotFoundError;
}

/**
 * Looks up the home PDS for an account domain through its `_pds` DNS
 * record, checks that it serves every protocol the app uses, and saves it
 * for the next launch (`savedHome`), or that it's gone (`wasHomeGone`).
 */
export async function discoverHome(domain: string) {
  let found;
  try {
    found = await discoverPds(domain);
  } catch (error) {
    if (isHomeGone(error)) rememberGone(domain, true);
    throw error;
  }
  rememberGone(domain, false);
  const home = assertPdsSupportsApi(found, pds);
  SecureStore.setItem(
    storageKey(domain),
    JSON.stringify({ manifest: home.manifest, manifestUrl: home.manifestUrl }),
  );
  return home;
}

function fromSaved(domain: string, saved: unknown) {
  if (
    typeof saved !== "object" ||
    saved === null ||
    !("manifest" in saved) ||
    !("manifestUrl" in saved) ||
    typeof saved.manifestUrl !== "string"
  ) {
    return undefined;
  }
  const manifest = parsePdsManifest(saved.manifest);
  if (manifest.accountDomain !== domain) return undefined;
  return assertPdsSupportsApi(
    { domain, manifest, manifestUrl: saved.manifestUrl },
    pds,
  );
}

/**
 * The home PDS found for a domain on an earlier launch, so the app can
 * start before the lookup (two requests) answers again. Undefined when
 * there is none, when the domain's home was gone at its last lookup, or
 * when it doesn't serve every protocol this version of the app uses, such
 * as after an update.
 */
export function savedHome(domain: string) {
  if (wasHomeGone(domain)) return undefined;
  try {
    return fromSaved(
      domain,
      JSON.parse(SecureStore.getItem(storageKey(domain)) ?? "null"),
    );
  } catch {
    return undefined;
  }
}
