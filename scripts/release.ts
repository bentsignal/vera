// Mobile releases: what changed since the last one, whether it can ship
// over the air, and the build, upload, TestFlight, and tagging steps. The
// `vera-release` agent skill says when to run each; docs/releasing.md
// explains the model.
//
//   pnpm release <command>
//
//   plan                                changes since the last release, and OTA or store build per platform
//   backend dev                         push main's functions to the shared dev deployment
//   backend production                  deploy main's functions to production (tags backend/deploy/...)
//   build internal [--android]          internal build (Vera Dev, dev PDS), uploaded for an install link
//   build production                    iOS App Store build with release Xcode, uploaded to TestFlight
//   build production --android          Android app bundle (vera.chat), submitted to Play internal testing
//   build ... --artifact <ipa|apk|aab>  upload and tag an existing build of this commit instead of building
//   ota internal|production "msg"       over-the-air update for every platform whose binary matches
//   ota production "msg" --with-backend builds the update, deploys the backend, then publishes the
//                                       update at once, so open apps wait seconds, not minutes
//   ... --next-release-done             production builds and updates refuse to run while
//                                       docs/next-release.md lists steps, until this confirms
//                                       the ones due by then are done
//   testflight <build> <notes.md>  What to Test, Friends group, Beta App Review
//   appstore <build>               attach a build to the App Store version and submit it
//   asc <METHOD> <path> [json]     raw App Store Connect API call
//
// Secrets stay outside the repo: the App Store Connect key and its IDs come
// from ~/.appstoreconnect/vera.env, and the Play service account key is
// ~/.config/vera/play-service-account.json.
import { execFileSync, spawnSync } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const MOBILE = join(ROOT, "apps/mobile");
const APP_ID = "6818656155";
const FRIENDS_GROUP = "19b050f9-a1aa-4ee8-9c84-3ef3f8716fa4";
// Every build (test and store) uses release Xcode, so Shawn tests what ships.
const RELEASE_XCODE = "/Applications/Xcode-27.app/Contents/Developer";
const SHARED_DEV_DEPLOYMENT = "dev:perceptive-magpie-29";
// eas.json's submit.production.android reads it from
// PLAY_SERVICE_ACCOUNT_KEY_PATH, so no home path is committed.
const PLAY_SERVICE_ACCOUNT_KEY = join(
  homedir(),
  ".config/vera/play-service-account.json",
);
const BACKEND_PATHS = ["services/backend", "packages", "pnpm-lock.yaml"];
// What each channel's binaries are built with (eas.json): internal builds
// are Vera Dev, the dev variant (app.config.ts).
const BUILD_ENV = {
  internal: {
    APP_VARIANT: "development",
    EXPO_PUBLIC_VERA_DOMAIN: "dev.vera.chat",
  },
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

type Platform = "android" | "ios";
const PLATFORMS: readonly Platform[] = ["ios", "android"];

/** Release tags of a platform's binaries: store (App Store, Play) and internal. */
function binaryTagPattern(platform: Platform, channel: Channel) {
  const kind = channel === "production" ? "build" : "internal";
  return platform === "ios" ? `mobile/${kind}/*` : `mobile/android/${kind}/*`;
}

/**
 * The runtime version app.config.ts sets for a platform (`RUNTIME_VERSION`):
 * an update reaches only binaries built with the same one. Both channels
 * use it; their updates are kept apart by channel.
 */
function runtimeVersion(platform: Platform) {
  const source = readFileSync(join(MOBILE, "app.config.ts"), "utf8");
  const block = /const RUNTIME_VERSION = \{([\s\S]*?)\};/.exec(source)?.[1];
  const value = new RegExp(`${platform}: "([^"]+)"`).exec(block ?? "")?.[1];
  if (value === undefined) {
    throw new Error(`no ${platform} entry in app.config.ts's RUNTIME_VERSION`);
  }
  return value;
}

/**
 * The native fingerprint of the checked-out code for a channel's binaries:
 * changes whenever a binary would build differently. Store builds record
 * it, so `plan` can say whether native changes are waiting for one. Vera
 * Dev has its own bundle ID, so its fingerprint differs from the store
 * build's.
 */
function fingerprint(platform: Platform, channel: Channel) {
  const json = output(
    "pnpm",
    ["exec", "expo-updates", "fingerprint:generate", "--platform", platform],
    {
      cwd: MOBILE,
      env: {
        APP_VARIANT: channel === "internal" ? "development" : "",
        VERA_NOTIFICATION_EXTENSION: "1",
      },
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

/** The newest tag that reached TestFlight or App Store users. */
function lastRelease() {
  const [tag] = tags("mobile/*").filter(
    (name) =>
      name.startsWith("mobile/build/") ||
      name.startsWith("mobile/android/build/") ||
      name.startsWith("mobile/ota/production/"),
  );
  return tag;
}

function tagDate(tag: string) {
  return git("tag", "--list", tag, "--format=%(creatordate:short)");
}

function runtimeOf(tag: string | undefined) {
  return tag === undefined ? undefined : field(tagMessage(tag), "runtime");
}

/**
 * Whether a binary was built from different native code than the checkout:
 * yes, no, or unknown for builds from before runtime versions were set by
 * hand, whose tags have no `fingerprint:` line (their `runtime:` was the
 * fingerprint, hashed with the old runtime policy, so it can't compare).
 */
function nativeChangedSince(tag: string, platform: Platform, channel: Channel) {
  const built = field(tagMessage(tag), "fingerprint");
  if (built === undefined) return "unknown";
  return built === fingerprint(platform, channel) ? "no" : "yes";
}

/** Files that differ from the last production backend deploy. */
function backendChanges() {
  const [deploy] = tags("backend/deploy/*");
  const base = deploy ?? lastRelease();
  if (base === undefined) return { base: "nothing", files: ["(no history)"] };
  const files = git("diff", "--name-only", base, "HEAD", "--", ...BACKEND_PATHS)
    .split("\n")
    .filter(
      (file) =>
        file !== "" && !file.endsWith(".md") && !file.includes(".test."),
    );
  return { base, files };
}

/**
 * The one-off steps docs/next-release.md lists for the next release: its
 * section headings, indented by level. Empty when there are none.
 */
function nextReleaseSteps() {
  const file = join(ROOT, "docs/next-release.md");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => /^#{2,3} /.test(line))
    .map((line) => line.replace(/^## /, "- ").replace(/^### /, "  - "));
}

/**
 * Production builds and updates are where a missed step reaches users, so
 * they stop while docs/next-release.md lists steps, until
 * `--next-release-done` confirms the ones due by now are done.
 */
function requireNextReleaseSteps() {
  const steps = nextReleaseSteps();
  if (steps.length === 0 || process.argv.includes("--next-release-done")) {
    return;
  }
  throw new Error(
    [
      "docs/next-release.md lists extra steps for this release:",
      ...steps,
      "Read it, do every step due before this command (each says when), verify them, then rerun with --next-release-done.",
    ].join("\n"),
  );
}

function stamp() {
  // UTC, to the second: yyyymmddThhmmss.
  return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
}

function plan() {
  git("fetch", "--quiet", "--tags", "origin");
  const head = git("rev-parse", "--short", "HEAD");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    console.log("warning: HEAD is not origin/main; this plan describes HEAD");
  }
  const release = lastRelease();
  const range = release === undefined ? "HEAD" : `${release}..HEAD`;
  // Changes land as squash commits ("PR title (#n)") or merge commits
  // ("Merge pull request #n", PR title in the body); anything committed
  // straight to main is listed as it is.
  const merges = git("log", "--first-parent", "--format=%s%n%b%x1e", range)
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = "", title = ""] = entry.split("\n");
      const pr = /^Merge pull request #(\d+)/.exec(subject)?.[1];
      if (pr !== undefined) return `- ${title || subject} (#${pr})`;
      return /\(#\d+\)$/.test(subject)
        ? `- ${subject}`
        : `- ${subject} (direct commit)`;
    });

  console.log(`HEAD: ${head}`);
  console.log(
    `last release: ${release === undefined ? "none" : `${release} (${tagDate(release)})`}`,
  );
  for (const platform of PLATFORMS) {
    const runtime = runtimeVersion(platform);
    const [binary] = tags(binaryTagPattern(platform, "production"));
    if (binary === undefined || runtimeOf(binary) !== runtime) {
      console.log(
        `${platform}: store-build required: the runtime is ${runtime}, and the last production build ${binary ?? "(none)"} has ${runtimeOf(binary) ?? "none"}, so no update reaches it`,
      );
    } else {
      const native = nativeChangedSince(binary, platform, "production");
      console.log(
        `${platform}: ota (runtime ${runtime}, the same as ${binary} and every binary on it); native changes waiting for a store build: ${
          native === "unknown"
            ? `unknown (${binary} predates set runtime versions; see the merged PRs' "Native change" lines)`
            : native === "yes"
              ? "yes (optional: older binaries on this runtime keep getting updates)"
              : "none"
        }`,
      );
    }
    const [internal] = tags(binaryTagPattern(platform, "internal"));
    console.log(
      `${platform}: internal build ${
        internal === undefined
          ? "none (only needed to check update or channel behavior)"
          : runtimeOf(internal) === runtime
            ? `${internal} (matches; an internal OTA reaches it)`
            : `${internal} (older runtime)`
      }`,
    );
  }
  const backend = backendChanges();
  console.log(
    backend.files.length === 0
      ? `backend: unchanged since ${backend.base}`
      : `backend: changed since ${backend.base} (${backend.files.length} files); ship it with \`pnpm release ota production "<notes>" --with-backend\`, or \`pnpm release backend production\` alone when the app didn't change`,
  );
  const breaking = breakingVersionChange(backend.base);
  if (breaking !== undefined) {
    console.log(
      `BREAKING: the breaking version goes from ${breaking.from} to ${breaking.to}. Open apps cover the screen with "Updating Vera…" the moment the backend deploys, so ship with --with-backend: the update has to be out seconds later.`,
    );
  }
  console.log(`\nmerged since ${release ?? "the start"}:`);
  console.log(merges.length === 0 ? "- nothing" : merges.join("\n"));
  console.log(
    "\nEach merged PR's description has a Release notes section (backend, native change, deploy).",
  );
  const steps = nextReleaseSteps();
  console.log(
    steps.length === 0
      ? "\nextra release steps: none (docs/next-release.md)"
      : [
          "\nEXTRA RELEASE STEPS (docs/next-release.md): this release must do every one, in order. Read the file, put them in the plan and the report.",
          ...steps,
        ].join("\n"),
  );
}

/** The breaking version in a commit's `services/backend/breaking-version.ts`. */
function breakingVersionAt(ref: string) {
  const source = spawnSync(
    "git",
    ["show", `${ref}:services/backend/breaking-version.ts`],
    { cwd: ROOT, encoding: "utf8" },
  );
  return /BREAKING_VERSION = (\d+)/.exec(source.stdout)?.[1];
}

/** The breaking version's change since a commit, when it changed. */
function breakingVersionChange(base: string) {
  if (base === "nothing") return undefined;
  const from = breakingVersionAt(base);
  const to = breakingVersionAt("HEAD");
  // Its first appearance breaks nothing: older apps don't watch it.
  return from === undefined || from === to ? undefined : { from, to };
}

function backend(target: string | undefined) {
  const env = readFileSync(join(ROOT, "services/backend/.env.local"), "utf8");
  if (target === "dev") {
    if (existsSync(join(ROOT, "services/backend/.isolated-backend"))) {
      throw new Error(
        "this worktree uses an isolated backend; release from a checkout on the shared dev deployment",
      );
    }
    if (!env.includes(`CONVEX_DEPLOYMENT=${SHARED_DEV_DEPLOYMENT}`)) {
      throw new Error(
        `services/backend/.env.local must select ${SHARED_DEV_DEPLOYMENT}`,
      );
    }
    requireCleanMain();
    run("npx", ["convex", "dev", "--once"], {
      cwd: join(ROOT, "services/backend"),
    });
    return;
  }
  if (target === "production") {
    requireCleanMain();
    run("npx", ["convex", "deploy", "--yes"], {
      cwd: join(ROOT, "services/backend"),
    });
    tag(`backend/deploy/${stamp()}`, [`commit: ${git("rev-parse", "HEAD")}`]);
    return;
  }
  throw new Error("usage: backend dev|production");
}

/** Reads the runtime version a built IPA will accept updates for. */
function ipaRuntime(ipa: string) {
  const declared = output("sh", [
    "-c",
    `unzip -p "${ipa}" 'Payload/*.app/Expo.plist' | plutil -extract EXUpdatesRuntimeVersion raw -`,
  ]);
  return resolveRuntime(
    declared,
    ipa,
    "Payload/*.app/EXUpdates.bundle/fingerprint",
  );
}

/**
 * Binaries from before runtime versions were set by hand (the fingerprint
 * policy) declare `file:fingerprint`, and the hash computed at build time
 * sits in a file inside them. Others declare the runtime itself.
 */
function resolveRuntime(declared: string, archive: string, file: string) {
  if (declared !== "file:fingerprint") return declared;
  return output("unzip", ["-p", archive, file]).trim();
}

function requireNewTag(name: string) {
  if (git("tag", "--list", name) !== "") {
    throw new Error(`tag ${name} already exists`);
  }
}

function tag(name: string, lines: string[]) {
  requireNewTag(name);
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

function build(profile: string | undefined, flags: string[]) {
  if (profile !== "internal" && profile !== "production") {
    throw new Error(
      "usage: build internal|production [--android] [--artifact <ipa|apk|aab>]",
    );
  }
  requireCleanMain();
  if (profile === "production") requireNextReleaseSteps();
  // Reuses a finished build from this commit (say, after a failed upload)
  // instead of building again; the runtime check still applies.
  const artifactIndex = flags.indexOf("--artifact");
  const artifact = artifactIndex === -1 ? undefined : flags[artifactIndex + 1];
  if (flags.includes("--android")) {
    buildAndroid(profile, artifact);
    return;
  }
  const ipa = artifact ?? join(tmpdir(), `vera-${profile}-${Date.now()}.ipa`);
  const apple = appleEnv();
  if (artifact === undefined)
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
          // fastlane from Homebrew; CocoaPods from rbenv, which only
          // login shells set up.
          PATH: `/opt/homebrew/bin:${homedir()}/.rbenv/shims:${process.env.PATH ?? ""}`,
          DEVELOPER_DIR: RELEASE_XCODE,
        },
      },
    );
  const runtime = requireRuntime(ipaRuntime(ipa), "ios");
  const buildNumber = output("sh", [
    "-c",
    `unzip -p "${ipa}" 'Payload/*.app/Info.plist' | plutil -extract CFBundleVersion raw -`,
  ]);
  const name = binaryTagPattern("ios", profile).replace("*", buildNumber);
  requireNewTag(name);
  if (profile === "internal") {
    installPage(
      ipa,
      `internal/ios/${buildNumber}`,
      `Internal build ${buildNumber}.`,
    );
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
  }
  tag(name, [
    `runtime: ${runtime}`,
    `fingerprint: ${fingerprint("ios", profile)}`,
    `commit: ${git("rev-parse", "HEAD")}`,
  ]);
  console.log(`ipa: ${ipa}\nbuild: ${buildNumber}\nruntime: ${runtime}`);
}

/**
 * Vera Dev's install page on bunny.net (scripts/install-page.sh); EAS's free
 * plan caps uploads of local builds.
 */
function installPage(artifact: string, prefix: string, description: string) {
  const url = output(join(ROOT, "scripts/install-page.sh"), [
    artifact,
    prefix,
    description,
  ]);
  console.log(`install page: ${url}`);
}

/** Fails before anything is uploaded if updates could never reach the build. */
function requireRuntime(runtime: string, platform: Platform) {
  const expected = runtimeVersion(platform);
  if (runtime !== expected) {
    throw new Error(
      `the build's runtime ${runtime} is not this checkout's ${platform} runtime version ${expected} (app.config.ts); updates would never reach it`,
    );
  }
  return runtime;
}

function aapt2() {
  const tools = join(
    process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk"),
    "build-tools",
  );
  const [latest] = output("ls", [tools]).split("\n").sort().reverse();
  if (latest === undefined)
    throw new Error(`no Android build-tools in ${tools}`);
  return join(tools, latest, "aapt2");
}

/**
 * Android `internal` builds are Vera Dev APKs on an install page; production
 * builds are app bundles for Play internal testing. See docs/android.md.
 */
function buildAndroid(profile: Channel, artifact: string | undefined) {
  const extension = profile === "internal" ? "apk" : "aab";
  const archive =
    artifact ?? join(tmpdir(), `vera-${profile}-${Date.now()}.${extension}`);
  if (!archive.endsWith(`.${extension}`)) {
    throw new Error(`${profile} Android builds are .${extension} files`);
  }
  if (profile === "production" && !existsSync(PLAY_SERVICE_ACCOUNT_KEY)) {
    throw new Error(`${PLAY_SERVICE_ACCOUNT_KEY} is missing`);
  }
  const androidHome =
    process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
  if (artifact === undefined)
    run(
      "eas",
      [
        "build",
        "-p",
        "android",
        "--profile",
        profile,
        "--local",
        "--non-interactive",
        "--output",
        archive,
      ],
      {
        cwd: MOBILE,
        env: {
          ANDROID_HOME: androidHome,
          JAVA_HOME: output("/usr/libexec/java_home", ["-v", "17"]),
        },
      },
    );
  const { runtime: declared, versionCode } =
    profile === "internal" ? apkInfo(archive) : bundleInfo(archive);
  const runtime = requireRuntime(declared, "android");
  const name = binaryTagPattern("android", profile).replace("*", versionCode);
  requireNewTag(name);
  if (profile === "internal") {
    installPage(
      archive,
      `internal/android/${versionCode}`,
      `Internal build ${versionCode}.`,
    );
  } else {
    // Track and release status: eas.json's submit.production.android.
    run(
      "eas",
      [
        "submit",
        "-p",
        "android",
        "--profile",
        "production",
        "--path",
        archive,
        "--non-interactive",
      ],
      {
        cwd: MOBILE,
        env: { PLAY_SERVICE_ACCOUNT_KEY_PATH: PLAY_SERVICE_ACCOUNT_KEY },
      },
    );
  }
  tag(name, [
    `runtime: ${runtime}`,
    `fingerprint: ${fingerprint("android", profile)}`,
    `commit: ${git("rev-parse", "HEAD")}`,
  ]);
  console.log(
    `${extension}: ${archive}\nversion code: ${versionCode}\nruntime: ${runtime}`,
  );
}

/** An APK's runtime and versionCode, from aapt2. */
function apkInfo(apk: string) {
  const resources = output(aapt2(), ["dump", "resources", apk]);
  const runtime = resolveRuntime(
    /expo_runtime_version[^\n]*\n\s*\(\) "([^"]+)"/.exec(resources)?.[1] ??
      "unknown",
    apk,
    "assets/fingerprint",
  );
  const versionCode =
    /versionCode='(\d+)'/.exec(
      output(aapt2(), ["dump", "badging", apk]),
    )?.[1] ?? "unknown";
  return { runtime, versionCode };
}

/**
 * An app bundle's runtime and versionCode. aapt2 can't read an .aab, and
 * bundletool isn't installed, so both come from the bundle's protobuf files
 * (aapt2's Resources.proto).
 *
 * The runtime is the `expo_runtime_version` string resource, in
 * base/resources.pb: a ResourceTable whose packages (field 2) hold types
 * (3), each with a name (2) and entries (3); an entry has a name (2) and
 * config values (6), whose value (2) holds an item (4) whose string (2)
 * holds the text (1). A bundle from before runtime versions were set by
 * hand says `file:fingerprint` there (see resolveRuntime).
 *
 * The versionCode comes from the bundle's own manifest rather than EAS
 * (whose remote counter may have moved on since the build, as with
 * --artifact). In a bundle, base/manifest/AndroidManifest.xml is aapt2's
 * protobuf XmlNode: field 1 is the root <manifest> element, its field 4
 * the attributes, and each attribute has a name (field 2) and its value as
 * written (field 3), "5" for versionCode 5.
 */
function bundleInfo(aab: string) {
  const table = execFileSync("unzip", ["-p", aab, "base/resources.pb"], {
    maxBuffer: 256 * 1024 * 1024,
  });
  const declared = protobufFields(table, 2)
    .flatMap((pkg) => protobufFields(pkg, 3))
    .filter((type) => protobufFields(type, 2)[0]?.toString() === "string")
    .flatMap((type) => protobufFields(type, 3))
    .filter(
      (entry) =>
        protobufFields(entry, 2)[0]?.toString() === "expo_runtime_version",
    )
    .flatMap((entry) => protobufFields(entry, 6))
    .flatMap((config) => protobufFields(config, 2))
    .flatMap((value) => protobufFields(value, 4))
    .flatMap((item) => protobufFields(item, 2))
    .map((text) => protobufFields(text, 1)[0]?.toString())[0];
  if (declared === undefined) {
    throw new Error(`no expo_runtime_version in ${aab}'s resources`);
  }
  const runtime = resolveRuntime(declared, aab, "base/assets/fingerprint");
  const manifest = execFileSync(
    "unzip",
    ["-p", aab, "base/manifest/AndroidManifest.xml"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const [root] = protobufFields(manifest, 1);
  const versionCode = protobufFields(root ?? Buffer.alloc(0), 4)
    .map((attribute) => ({
      name: protobufFields(attribute, 2)[0]?.toString(),
      value: protobufFields(attribute, 3)[0]?.toString(),
    }))
    .find((attribute) => attribute.name === "versionCode")?.value;
  if (versionCode === undefined || !/^\d+$/.test(versionCode)) {
    throw new Error(`no versionCode in ${aab}'s manifest`);
  }
  return { runtime, versionCode };
}

/** The length-delimited values of one field in a protobuf message. */
function protobufFields(message: Buffer, field: number) {
  const values: Buffer[] = [];
  let offset = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = message[offset] ?? 0;
      offset += 1;
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80 && offset < message.length);
    return value;
  };
  while (offset < message.length) {
    const key = varint();
    const wireType = key & 7;
    if (wireType === 0) varint();
    else if (wireType === 1) offset += 8;
    else if (wireType === 5) offset += 4;
    else if (wireType === 2) {
      const length = varint();
      if (key >>> 3 === field) {
        values.push(message.subarray(offset, offset + length));
      }
      offset += length;
    } else throw new Error(`unsupported protobuf wire type ${wireType}`);
  }
  return values;
}

function ota(channel: string | undefined, message: string | undefined) {
  if (channel !== "internal" && channel !== "production") {
    throw new Error('usage: ota internal|production "message"');
  }
  if (message === undefined) throw new Error("an update needs a message");
  requireCleanMain();
  if (channel === "production") requireNextReleaseSteps();
  // An update only reaches binaries with the same runtime: publish for the
  // platforms whose latest binary on this channel matches, and refuse when
  // none does.
  const targets = PLATFORMS.filter((platform) => {
    const [binary] = tags(binaryTagPattern(platform, channel));
    const current = runtimeVersion(platform);
    const matches = runtimeOf(binary) === current;
    console.log(
      `${platform}: ${matches ? "publishing" : "skipped"} (latest ${channel} binary ${binary ?? "none"}, runtime ${runtimeOf(binary) ?? "none"}; current ${current})`,
    );
    return matches;
  });
  const [only] = targets;
  if (only === undefined) {
    throw new Error(
      `no ${channel} binary has the current runtime; make a build instead`,
    );
  }
  const env = { ...BUILD_ENV[channel], VERA_NOTIFICATION_EXTENSION: "1" };
  const withBackend = process.argv.includes("--with-backend");
  if (withBackend) {
    if (channel !== "production") {
      throw new Error("--with-backend deploys production; use it with ota production");
    }
    // Bundle first (the slow part, as eas update would), then deploy the
    // backend and publish the update straight after it, so an open app on
    // the old code waits seconds for its update instead of minutes.
    rmSync(join(MOBILE, "dist"), { force: true, recursive: true });
    run(
      "npx",
      [
        "expo",
        "export",
        "--output-dir",
        "dist",
        "--dump-sourcemap",
        "--dump-assetmap",
        ...targets.flatMap((platform) => ["--platform", platform]),
      ],
      { cwd: MOBILE, env },
    );
    backend("production");
  }
  const json = output(
    "eas",
    [
      "update",
      ...(withBackend ? ["--skip-bundler", "--input-dir", "dist"] : []),
      "--channel",
      channel,
      "--environment",
      channel === "production" ? "production" : "development",
      "--platform",
      targets.length === PLATFORMS.length ? "all" : only,
      "--message",
      message,
      "--non-interactive",
      "--json",
    ],
    // The same app config as the channel's binaries: their PDS, the
    // extension, and on internal the dev variant.
    { cwd: MOBILE, env },
  );
  const updates = JSON.parse(json) as {
    group: string;
    id: string;
    platform: string;
    runtimeVersion: string;
  }[];
  const [first] = updates;
  if (first === undefined) throw new Error("eas update returned no update");
  tag(`mobile/ota/${channel}/${stamp()}`, [
    `group: ${first.group}`,
    // Per platform: the runtime it targets and the ID Settings → About shows.
    ...updates.flatMap((update) => [
      `${update.platform}-runtime: ${update.runtimeVersion}`,
      `${update.platform}-update: ${update.id}`,
    ]),
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
  const existing = (await asc(
    "GET",
    `/v1/builds/${buildId}/betaAppReviewSubmission`,
  )) as { data: { attributes: { betaReviewState: string } } | null };
  if (existing.data !== null) {
    console.log(
      `already in Beta App Review: ${existing.data.attributes.betaReviewState}`,
    );
    return;
  }
  // Fails loudly: Friends only get the build once this succeeds.
  await asc("POST", "/v1/betaAppReviewSubmissions", {
    data: {
      relationships: { build: { data: { id: buildId, type: "builds" } } },
      type: "betaAppReviewSubmissions",
    },
  });
  console.log(
    "submitted for Beta App Review (Friends see it once Apple approves)",
  );
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
  case "backend":
    backend(args[0]);
    break;
  case "build":
    build(args[0], args.slice(1));
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
        .slice(0, 20)
        .join("\n"),
    );
    process.exitCode = 2;
}
