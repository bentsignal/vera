import { AwsV4Signer } from "aws4fetch";

import { optionalEnvironment } from "./lib";

// bunny.net Storage is Vera's media provider. The app uploads straight to it
// through presigned URLs on its S3-compatible endpoint, and everything is
// served from the pull zone's CDN hostname. A host without these variables
// falls back to Convex file storage (see files.ts).

const UPLOAD_URL_LIFETIME_SECONDS = 15 * 60;

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
 * path, but not the signed length or content type, so the size limits in
 * files.ts are advisory for a malicious client.
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
    "Content-Length": String(size),
    "Content-Type": contentType,
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
