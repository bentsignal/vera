import { AwsV4Signer } from "aws4fetch";

import { optionalEnvironment } from "./lib";

// bunny.net Storage is Vera's media provider. The app uploads straight to it
// through presigned URLs on its S3-compatible endpoint, and everything is
// served from the pull zone's CDN hostname. A host without these variables
// falls back to Convex file storage (see files.ts).

export const UPLOAD_URL_LIFETIME_SECONDS = 15 * 60;

export function bunnyStorageConfig() {
  const endpoint = optionalEnvironment("BUNNY_S3_ENDPOINT");
  const zone = optionalEnvironment("BUNNY_STORAGE_ZONE");
  const secret = optionalEnvironment("BUNNY_S3_SECRET");
  const cdnUrl = optionalEnvironment("BUNNY_CDN_URL");
  if (
    endpoint === null ||
    zone === null ||
    secret === null ||
    cdnUrl === null
  ) {
    return null;
  }
  return {
    cdnUrl,
    endpoint,
    prefix: optionalEnvironment("BUNNY_PATH_PREFIX") ?? "media",
    region: optionalEnvironment("BUNNY_S3_REGION") ?? "ny",
    secret,
    zone,
  };
}

export type BunnyStorageConfig = NonNullable<
  ReturnType<typeof bunnyStorageConfig>
>;

/**
 * A presigned PUT for one object path. bunny.net enforces the signature and
 * path, but not the signed length or content type (checked 2026-11), so
 * files.ts checks each upload's size after it lands, and the CDN decides
 * what a browser may show by the type served (infra/media-cdn). A `size` of 0 (unknown)
 * leaves the length out of the signed headers.
 */
export async function presignStorageUpload(
  config: BunnyStorageConfig,
  path: string,
  contentType: string,
  size: number,
) {
  const url = new URL(`${config.endpoint}/${config.zone}/${path}`);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_LIFETIME_SECONDS));
  const headers = {
    "Content-Type": contentType,
    ...(size > 0 && { "Content-Length": String(size) }),
  };
  const signer = new AwsV4Signer({
    accessKeyId: config.zone,
    headers,
    method: "PUT",
    region: config.region,
    secretAccessKey: config.secret,
    service: "s3",
    signQuery: true,
    url: url.toString(),
  });
  const signed = await signer.sign();
  return {
    headers,
    publicUrl: `${config.cdnUrl}/${path}`,
    url: signed.url.toString(),
  };
}

async function storageRequest(
  config: BunnyStorageConfig,
  method: "DELETE" | "HEAD",
  path: string,
) {
  const signer = new AwsV4Signer({
    accessKeyId: config.zone,
    method,
    region: config.region,
    secretAccessKey: config.secret,
    service: "s3",
    url: `${config.endpoint}/${config.zone}/${path}`,
  });
  const signed = await signer.sign();
  return fetch(signed.url, { headers: signed.headers, method });
}

/** An object's size in bytes, or null when there's none at `path`. */
export async function storageObjectSize(
  config: BunnyStorageConfig,
  path: string,
) {
  const response = await storageRequest(config, "HEAD", path);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`bunny.net Storage HEAD failed (${response.status})`);
  }
  return Number(response.headers.get("content-length") ?? 0);
}

export async function deleteStorageObject(
  config: BunnyStorageConfig,
  path: string,
) {
  const response = await storageRequest(config, "DELETE", path);
  if (!response.ok && response.status !== 404) {
    throw new Error(`bunny.net Storage DELETE failed (${response.status})`);
  }
}
