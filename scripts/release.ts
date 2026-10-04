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
//   build production --android          Android production APK (vera.chat), uploaded for an install link
//   build ... --artifact <ipa|apk>      upload and tag an existing build of this commit instead of building
//   ota internal|production "msg"       over-the-air update for every platform whose binary matches
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
// Every build (test and store) uses release Xcode, so Shawn tests what ships.
const RELEASE_XCODE = "/Applications/Xcode-27.app/Contents/Developer";
const SHARED_DEV_DEPLOYMENT = "dev:perceptive-magpie-29";
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

/** Release tags of a platform's binaries: store (or production APK) and internal. */
function binaryTagPattern(platform: Platform, channel: Channel) {
  const kind = channel === "production" ? "build" : "internal";
  return platform === "ios" ? `mobile/${kind}/*` : `mobile/android/${kind}/*`;
}

/**
 * The runtime version (native fingerprint) of the checked-out code for a
 * channel's binaries. Vera Dev has its own bundle ID, so its runtime differs
 * from the store build's.
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
  // Changes land as merge commits ("Merge pull request #n", PR title in the
  // body); anything committed straight to main is listed as it is.
  const merges = git("log", "--first-parent", "--format=%s%n%b%x1e", range)
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = "", title = ""] = entry.split("\n");
      const pr = /^Merge pull request #(\d+)/.exec(subject)?.[1];
      return pr === undefined
        ? `- ${subject} (direct commit)`
        : `- ${title || subject} (#${pr})`;
    });

  console.log(`HEAD: ${head}`);
  console.log(
    `last release: ${release === undefined ? "none" : `${release} (${tagDate(release)})`}`,
  );
  for (const platform of PLATFORMS) {
    const [binary] = tags(binaryTagPattern(platform, "production"));
    const shippedRuntime = runtimeOf(binary);
    console.log(
      `${platform}: last production build ${binary ?? "none"}; ${
        shippedRuntime === fingerprint(platform, "production")
          ? "ota (no native change since it)"
          : "store-build (native code changed, or no expo-updates build has shipped)"
      }`,
    );
    const [internal] = tags(binaryTagPattern(platform, "internal"));
    console.log(
      `${platform}: internal build ${
        internal === undefined
          ? "none (only needed to check update or channel behavior)"
          : runtimeOf(internal) === fingerprint(platform, "internal")
            ? `${internal} (matches; an internal OTA reaches it)`
            : `${internal} (older native code)`
      }`,
    );
  }
  const backend = backendChanges();
  console.log(
    backend.files.length === 0
      ? `backend: unchanged since ${backend.base}`
      : `backend: changed since ${backend.base} (${backend.files.length} files); run \`pnpm release backend production\` before the app ships`,
  );
  console.log(`\nmerged since ${release ?? "the start"}:`);
  console.log(merges.length === 0 ? "- nothing" : merges.join("\n"));
  console.log(
    "\nEach merged PR's description has a Release notes section (backend, native change, deploy).",
  );
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
 * With the fingerprint policy the binary declares `file:fingerprint`, and
 * the hash computed at build time sits in a file inside it.
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
      "usage: build internal|production [--android] [--artifact <ipa|apk>]",
    );
  }
  requireCleanMain();
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
          PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}`,
          DEVELOPER_DIR: RELEASE_XCODE,
        },
      },
    );
  const runtime = requireRuntime(ipaRuntime(ipa), "ios", profile);
  const buildNumber = output("sh", [
    "-c",
    `unzip -p "${ipa}" 'Payload/*.app/Info.plist' | plutil -extract CFBundleVersion raw -`,
  ]);
  const name = binaryTagPattern("ios", profile).replace("*", buildNumber);
  requireNewTag(name);
  if (profile === "internal") {
    installPage(ipa, `internal/ios/${buildNumber}`, `Internal build ${buildNumber}.`);
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
  tag(name, [`runtime: ${runtime}`, `commit: ${git("rev-parse", "HEAD")}`]);
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
function requireRuntime(
  runtime: string,
  platform: Platform,
  channel: Channel,
) {
  const expected = fingerprint(platform, channel);
  if (runtime !== expected) {
    throw new Error(
      `the build's runtime ${runtime} is not this checkout's ${platform} fingerprint ${expected}; updates would never reach it`,
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
 * Android builds are APKs for now (installed from an EAS link): `internal`
 * against the dev PDS, and `production-apk` against vera.chat for testers
 * until Play internal testing exists. See docs/android.md.
 */
function buildAndroid(profile: Channel, artifact: string | undefined) {
  const apk = artifact ?? join(tmpdir(), `vera-${profile}-${Date.now()}.apk`);
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
        profile === "internal" ? "internal" : "production-apk",
        "--local",
        "--non-interactive",
        "--output",
        apk,
      ],
      {
        cwd: MOBILE,
        env: {
          ANDROID_HOME: androidHome,
          JAVA_HOME: output("/usr/libexec/java_home", ["-v", "17"]),
        },
      },
    );
  const resources = output(aapt2(), ["dump", "resources", apk]);
  const runtime = requireRuntime(
    resolveRuntime(
      /expo_runtime_version[^\n]*\n\s*\(\) "([^"]+)"/.exec(resources)?.[1] ??
        "unknown",
      apk,
      "assets/fingerprint",
    ),
    "android",
    profile,
  );
  const versionCode =
    /versionCode='(\d+)'/.exec(
      output(aapt2(), ["dump", "badging", apk]),
    )?.[1] ?? "unknown";
  const name = binaryTagPattern("android", profile).replace("*", versionCode);
  requireNewTag(name);
  if (profile === "internal") {
    installPage(apk, `internal/android/${versionCode}`, `Internal build ${versionCode}.`);
  } else {
    run(
      "eas",
      ["upload", "-p", "android", "--build-path", apk, "--non-interactive"],
      { cwd: MOBILE },
    );
  }
  tag(name, [`runtime: ${runtime}`, `commit: ${git("rev-parse", "HEAD")}`]);
  console.log(`apk: ${apk}\nversion code: ${versionCode}\nruntime: ${runtime}`);
}

function ota(channel: string | undefined, message: string | undefined) {
  if (channel !== "internal" && channel !== "production") {
    throw new Error('usage: ota internal|production "message"');
  }
  if (message === undefined) throw new Error("an update needs a message");
  requireCleanMain();
  // An update only reaches binaries with the same runtime: publish for the
  // platforms whose latest binary on this channel matches, and refuse when
  // none does.
  const targets = PLATFORMS.filter((platform) => {
    const [binary] = tags(binaryTagPattern(platform, channel));
    const current = fingerprint(platform, channel);
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
  const json = output(
    "eas",
    [
      "update",
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
    {
      cwd: MOBILE,
      // The fingerprint must match the channel's binaries, which have the
      // extension (and, on internal, the dev variant).
      env: {
        ...BUILD_ENV[channel],
        VERA_NOTIFICATION_EXTENSION: "1",
      },
    },
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
