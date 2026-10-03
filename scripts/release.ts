// Mobile releases: what changed since the last one, whether it can ship
// over the air, and the build, upload, TestFlight, and tagging steps. The
// `vera-release` agent skill says when to run each; RELEASING.md explains
// the model.
//
//   node --experimental-strip-types scripts/release.ts <command>
//
//   plan                           changes since the last release, and OTA or store build
//   build internal                 local internal build (dev PDS), uploaded for an install link
//   build production               local App Store build with release Xcode, uploaded to TestFlight
//   ota internal|production "msg"  publish an over-the-air update to a channel
//   testflight <build> <notes.md>  What to Test, Friends group, Beta App Review
//   appstore <build>               attach a build to the App Store version and submit it
//   asc <METHOD> <path> [json]     raw App Store Connect API call
//
// Secrets stay outside the repo: the App Store Connect key and its IDs come
// from ~/.appstoreconnect/vera.env.
import { execFileSync, spawnSync } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const MOBILE = join(ROOT, "apps/mobile");
const APP_ID = "6818656155";
const FRIENDS_GROUP = "19b050f9-a1aa-4ee8-9c84-3ef3f8716fa4";
const RELEASE_XCODE = "/Applications/Xcode-27.app/Contents/Developer";
const BUILD_ENV = {
  internal: { EXPO_PUBLIC_VERA_DOMAIN: "dev.vera.chat" },
  production: { EXPO_PUBLIC_VERA_DOMAIN: "vera.chat" },
} as const;
type Channel = keyof typeof BUILD_ENV;

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
}

function output(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function git(...args: string[]) {
  return output("git", args);
}

/** Exported variables from ~/.appstoreconnect/vera.env. */
function appleEnv() {
  const file = join(homedir(), ".appstoreconnect/vera.env");
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z_]+)=["']?(.*?)["']?\s*$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = match[2]
        .replace("$HOME", homedir())
        .replace(/^~/, homedir());
    }
  }
  return values;
}

async function asc(method: string, path: string, body?: unknown) {
  const env = appleEnv();
  const keyPath = env.EXPO_ASC_API_KEY_PATH;
  const keyId = env.EXPO_ASC_KEY_ID;
  const issuer = env.EXPO_ASC_ISSUER_ID;
  if (keyPath === undefined || keyId === undefined || issuer === undefined) {
    throw new Error(
      "vera.env needs EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID",
    );
  }
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode(
    {
      aud: "appstoreconnect-v1",
      exp: now + 900,
      iat: now,
      iss: issuer,
    },
  )}`;
  const signature = createSign("SHA256")
    .update(unsigned)
    .sign({ dsaEncoding: "ieee-p1363", key: readFileSync(keyPath, "utf8") })
    .toString("base64url");
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${unsigned}.${signature}`,
      "Content-Type": "application/json",
    },
    method,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}\n${text}`);
  }
  return text === "" ? {} : (JSON.parse(text) as { data?: unknown });
}

/** The iOS runtime version (native fingerprint) of the checked-out code. */
function fingerprint() {
  const json = output(
    "npx",
    ["expo-updates", "fingerprint:generate", "--platform", "ios"],
    {
      cwd: MOBILE,
      env: { VERA_NOTIFICATION_EXTENSION: "1" },
    },
  );
  return (JSON.parse(json) as { hash: string }).hash;
}

function tags(pattern: string) {
  const list = git("tag", "--list", pattern, "--sort=-creatordate");
  return list === "" ? [] : list.split("\n");
}

function tagMessage(tag: string) {
  return git("tag", "--list", tag, "--format=%(contents)");
}

function field(message: string, name: string) {
  return new RegExp(`^${name}: (.+)$`, "m").exec(message)?.[1]?.trim();
}

function lastRelease() {
  const [tag] = tags("mobile/*").filter(
    (name) => !name.startsWith("mobile/ota/internal/"),
  );
  return tag;
}

function plan() {
  git("fetch", "--quiet", "--tags", "origin");
  const head = git("rev-parse", "--short", "HEAD");
  const release = lastRelease();
  const [build] = tags("mobile/build/*");
  const shipped =
    build === undefined ? undefined : field(tagMessage(build), "runtime");
  const current = fingerprint();
  const range = release === undefined ? "HEAD" : `${release}..HEAD`;
  const merges = git(
    "log",
    "--first-parent",
    "--merges",
    "--format=%s%n%b%x1e",
    range,
  )
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = "", title = ""] = entry.split("\n");
      const pr = /#(\d+)/.exec(subject)?.[1];
      return `- ${title || subject}${pr === undefined ? "" : ` (#${pr})`}`;
    });

  console.log(`HEAD: ${head}`);
  console.log(
    `last release: ${release ?? "none"}${release === undefined ? "" : ` (${git("log", "-1", "--format=%cs", release)})`}`,
  );
  console.log(
    `last store build: ${build ?? "none"}, runtime ${shipped ?? "unknown"}`,
  );
  console.log(`current runtime: ${current}`);
  if (shipped === current) {
    console.log("kind: ota (no native change since the last store build)");
  } else {
    console.log(
      "kind: store-build (native code changed, or no expo-updates build has shipped yet)",
    );
  }
  const backend =
    release === undefined
      ? "unknown"
      : git(
          "diff",
          "--name-only",
          release,
          "HEAD",
          "--",
          "services/backend",
          "packages",
        )
          .split("\n")
          .filter(
            (file) =>
              file !== "" && !file.endsWith(".md") && !file.includes(".test."),
          );
  console.log(
    `backend: ${
      backend === "unknown" || backend.length > 0
        ? "changed; deploy to production before the app ships (npx convex deploy)"
        : "unchanged"
    }`,
  );
  const [internal] = tags("mobile/internal/*");
  const internalRuntime =
    internal === undefined ? undefined : field(tagMessage(internal), "runtime");
  console.log(
    `internal build: ${internal ?? "none"}${
      internalRuntime === current
        ? " (matches; an internal OTA reaches it)"
        : " (stale; make a new internal build to test)"
    }`,
  );
  console.log(`\nmerged since ${release ?? "the start"}:`);
  console.log(merges.length === 0 ? "- nothing" : merges.join("\n"));
}

/** Reads the runtime version a built IPA will accept updates for. */
function ipaRuntime(ipa: string) {
  const plist = output("sh", [
    "-c",
    `unzip -p "${ipa}" 'Payload/*.app/Expo.plist' | plutil -extract EXUpdatesRuntimeVersion raw -`,
  ]);
  return plist;
}

function tag(name: string, lines: string[]) {
  run("git", ["tag", "-a", name, "-m", [name, "", ...lines].join("\n")]);
  run("git", ["push", "origin", name]);
  console.log(`tagged ${name}`);
}

function requireCleanMain() {
  git("fetch", "--quiet", "origin", "main");
  if (git("status", "--porcelain") !== "")
    throw new Error("the checkout has uncommitted changes");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("releases build from origin/main; check it out first");
  }
}

function build(profile: string | undefined) {
  if (profile !== "internal" && profile !== "production") {
    throw new Error("usage: build internal|production");
  }
  requireCleanMain();
  const ipa = join(tmpdir(), `vera-${profile}-${Date.now()}.ipa`);
  const apple = appleEnv();
  run(
    "eas",
    [
      "build",
      "-p",
      "ios",
      "--profile",
      profile,
      "--local",
      "--non-interactive",
      "--output",
      ipa,
    ],
    {
      cwd: MOBILE,
      env: {
        ...apple,
        PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}`,
        ...(profile === "production" ? { DEVELOPER_DIR: RELEASE_XCODE } : {}),
      },
    },
  );
  const runtime = ipaRuntime(ipa);
  const buildNumber = output("sh", [
    "-c",
    `unzip -p "${ipa}" 'Payload/*.app/Info.plist' | plutil -extract CFBundleVersion raw -`,
  ]);
  const commit = git("rev-parse", "HEAD");
  if (profile === "internal") {
    run(
      "eas",
      ["upload", "-p", "ios", "--build-path", ipa, "--non-interactive"],
      { cwd: MOBILE },
    );
    tag(`mobile/internal/${buildNumber}`, [
      `runtime: ${runtime}`,
      `commit: ${commit}`,
    ]);
  } else {
    run("xcrun", [
      "altool",
      "--upload-app",
      "-f",
      ipa,
      "-t",
      "ios",
      "--apiKey",
      apple.EXPO_ASC_KEY_ID ?? "",
      "--apiIssuer",
      apple.EXPO_ASC_ISSUER_ID ?? "",
    ]);
    tag(`mobile/build/${buildNumber}`, [
      `runtime: ${runtime}`,
      `commit: ${commit}`,
    ]);
  }
  console.log(`ipa: ${ipa}\nbuild: ${buildNumber}\nruntime: ${runtime}`);
}

function ota(channel: string | undefined, message: string | undefined) {
  if (channel !== "internal" && channel !== "production") {
    throw new Error('usage: ota internal|production "message"');
  }
  if (message === undefined) throw new Error("an update needs a message");
  requireCleanMain();
  const json = output(
    "eas",
    [
      "update",
      "--channel",
      channel,
      "--environment",
      channel === "production" ? "production" : "development",
      "--platform",
      "ios",
      "--message",
      message,
      "--non-interactive",
      "--json",
    ],
    {
      cwd: MOBILE,
      // The fingerprint must match the store build's, which has the extension.
      env: {
        ...BUILD_ENV[channel as Channel],
        VERA_NOTIFICATION_EXTENSION: "1",
      },
    },
  );
  const updates = JSON.parse(json) as {
    group: string;
    runtimeVersion: string;
  }[];
  const update = updates[0];
  if (update === undefined) throw new Error("eas update returned no update");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  tag(`mobile/ota/${channel}/${stamp}`, [
    `runtime: ${update.runtimeVersion}`,
    `group: ${update.group}`,
    `commit: ${git("rev-parse", "HEAD")}`,
    "",
    message,
  ]);
}

async function findBuild(buildNumber: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = (await asc(
      "GET",
      `/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&fields[builds]=version,processingState`,
    )) as { data: { attributes: { processingState: string }; id: string }[] };
    const found = result.data[0];
    if (found?.attributes.processingState === "VALID") return found.id;
    if (
      found?.attributes.processingState === "INVALID" ||
      found?.attributes.processingState === "FAILED"
    ) {
      throw new Error(
        `build ${buildNumber} is ${found.attributes.processingState}`,
      );
    }
    console.log(
      `build ${buildNumber}: ${found?.attributes.processingState ?? "not in App Store Connect yet"}; waiting`,
    );
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  throw new Error(`build ${buildNumber} did not finish processing`);
}

async function testflight(
  buildNumber: string | undefined,
  notesFile: string | undefined,
) {
  if (buildNumber === undefined || notesFile === undefined) {
    throw new Error("usage: testflight <build> <notes.md>");
  }
  const whatsNew = readFileSync(notesFile, "utf8").trim();
  const buildId = await findBuild(buildNumber);
  const localizations = (await asc(
    "GET",
    `/v1/builds/${buildId}/betaBuildLocalizations`,
  )) as {
    data: { attributes: { locale: string }; id: string }[];
  };
  const english = localizations.data.find(
    (entry) => entry.attributes.locale === "en-US",
  );
  await (english === undefined
    ? asc("POST", "/v1/betaBuildLocalizations", {
        data: {
          attributes: { locale: "en-US", whatsNew },
          relationships: { build: { data: { id: buildId, type: "builds" } } },
          type: "betaBuildLocalizations",
        },
      })
    : asc("PATCH", `/v1/betaBuildLocalizations/${english.id}`, {
        data: {
          attributes: { whatsNew },
          id: english.id,
          type: "betaBuildLocalizations",
        },
      }));
  console.log(
    "What to Test set; the Team group gets every build automatically",
  );
  await asc("POST", `/v1/betaGroups/${FRIENDS_GROUP}/relationships/builds`, {
    data: [{ id: buildId, type: "builds" }],
  });
  console.log("added to Friends");
  try {
    await asc("POST", "/v1/betaAppReviewSubmissions", {
      data: {
        relationships: { build: { data: { id: buildId, type: "builds" } } },
        type: "betaAppReviewSubmissions",
      },
    });
    console.log(
      "submitted for Beta App Review (Friends see it once Apple approves)",
    );
  } catch (error) {
    console.log(`Beta App Review submission: ${String(error)}`);
  }
}

async function appstore(buildNumber: string | undefined) {
  if (buildNumber === undefined) throw new Error("usage: appstore <build>");
  const buildId = await findBuild(buildNumber);
  const version = /version: "([^"]+)"/.exec(
    readFileSync(join(MOBILE, "app.config.ts"), "utf8"),
  )?.[1];
  if (version === undefined) throw new Error("no version in app.config.ts");
  const versions = (await asc(
    "GET",
    `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${version}`,
  )) as { data: { attributes: { appStoreState: string }; id: string }[] };
  let versionId = versions.data[0]?.id;
  if (versionId === undefined) {
    const created = (await asc("POST", "/v1/appStoreVersions", {
      data: {
        attributes: { platform: "IOS", versionString: version },
        relationships: { app: { data: { id: APP_ID, type: "apps" } } },
        type: "appStoreVersions",
      },
    })) as { data: { id: string } };
    versionId = created.data.id;
  }
  await asc("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
    data: { id: buildId, type: "builds" },
  });
  const submission = (await asc("POST", "/v1/reviewSubmissions", {
    data: {
      attributes: { platform: "IOS" },
      relationships: { app: { data: { id: APP_ID, type: "apps" } } },
      type: "reviewSubmissions",
    },
  })) as { data: { id: string } };
  await asc("POST", "/v1/reviewSubmissionItems", {
    data: {
      relationships: {
        appStoreVersion: { data: { id: versionId, type: "appStoreVersions" } },
        reviewSubmission: {
          data: { id: submission.data.id, type: "reviewSubmissions" },
        },
      },
      type: "reviewSubmissionItems",
    },
  });
  await asc("PATCH", `/v1/reviewSubmissions/${submission.data.id}`, {
    data: {
      attributes: { submitted: true },
      id: submission.data.id,
      type: "reviewSubmissions",
    },
  });
  console.log(
    `version ${version} (build ${buildNumber}) submitted for App Review`,
  );
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "plan":
    plan();
    break;
  case "build":
    build(args[0]);
    break;
  case "ota":
    ota(args[0], args[1]);
    break;
  case "testflight":
    await testflight(args[0], args[1]);
    break;
  case "appstore":
    await appstore(args[0]);
    break;
  case "asc":
    console.log(
      JSON.stringify(
        await asc(
          args[0] ?? "GET",
          args[1] ?? "/v1/apps",
          args[2] === undefined ? undefined : JSON.parse(args[2]),
        ),
        null,
        2,
      ),
    );
    break;
  default:
    console.log(
      readFileSync(new URL(import.meta.url), "utf8")
        .split("\n")
        .slice(0, 18)
        .join("\n"),
    );
    process.exitCode = 2;
}
