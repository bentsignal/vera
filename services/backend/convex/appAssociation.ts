import { httpAction } from "./_generated/server";

// iOS and Android only let the Vera app create passkeys for the relying party
// domain once that domain lists the app in these two files.

function list(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
    },
  });
}

/** `PASSKEY_APPLE_APP_IDS`: `<TEAM ID>.<bundle identifier>` entries. */
export const appleAppSiteAssociation = httpAction(() =>
  Promise.resolve(
    json({ webcredentials: { apps: list("PASSKEY_APPLE_APP_IDS") } }),
  ),
);

/**
 * `PASSKEY_ANDROID_PACKAGE` and `PASSKEY_ANDROID_CERT_SHA256` (the signing
 * certificate fingerprints, colon-separated hex).
 */
export const androidAssetLinks = httpAction(() => {
  const [packageName = ""] = list("PASSKEY_ANDROID_PACKAGE");
  const fingerprints = list("PASSKEY_ANDROID_CERT_SHA256");
  return Promise.resolve(
    json(
      packageName === "" || fingerprints.length === 0
        ? []
        : [
            {
              relation: [
                "delegate_permission/common.get_login_creds",
                "delegate_permission/common.handle_all_urls",
              ],
              target: {
                namespace: "android_app",
                package_name: packageName,
                sha256_cert_fingerprints: fingerprints,
              },
            },
          ],
    ),
  );
});
