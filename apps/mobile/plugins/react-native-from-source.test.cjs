const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  fromSource,
  patchedFile,
  requirePatched,
  PATCH_MARKER,
} = require("./with-react-native-from-source.cjs");

const APP = path.join(__dirname, "..");
const ROOT = path.join(APP, "../..");

test("the Podfile builds React Native from source, keeping other settings", () => {
  const properties = fromSource({ "expo.jsEngine": "hermes" });
  assert.equal(properties["ios.buildReactNativeFromSource"], "true");
  assert.equal(properties["expo.jsEngine"], "hermes");
});

test("the installed react-native has the dictation patch", () => {
  const source = fs.readFileSync(patchedFile(APP), "utf8");
  assert.ok(source.includes(PATCH_MARKER));
  // The parity check itself, in Fabric's comparison of the field's text.
  assert.match(
    source,
    /isDictating = isDictating \|\| _backedTextInputView\.dictationRecognizing;/,
  );
  assert.doesNotThrow(() => requirePatched(APP));
});

test("the patch is registered with pnpm and counts toward the fingerprint", () => {
  const { pnpm } = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const patch = pnpm.patchedDependencies["react-native@0.86.3"];
  assert.equal(patch, "patches/react-native@0.86.3.patch");
  assert.ok(
    fs.readFileSync(path.join(ROOT, patch), "utf8").includes(PATCH_MARKER),
  );
  const fingerprint = require("../fingerprint.config.cjs");
  assert.ok(
    fingerprint.extraSources.some(
      (source) =>
        source.type === "dir" &&
        path.resolve(APP, source.filePath) === path.join(ROOT, "patches"),
    ),
  );
});

test("the app config uses the plugin", () => {
  const config = fs.readFileSync(path.join(APP, "app.config.ts"), "utf8");
  assert.ok(config.includes('"./plugins/with-react-native-from-source.cjs"'));
});

test("a build without the patch fails rather than shipping without it", () => {
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "rn-"));
  const file = path.join(
    dir,
    "node_modules/react-native",
    "React/Fabric/Mounting/ComponentViews/TextInput/RCTTextInputComponentView.mm",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "node_modules/react-native/package.json"),
    '{"name":"react-native"}',
  );
  fs.writeFileSync(file, "// unpatched");
  assert.throws(() => requirePatched(dir), /dictation patch/);
});
