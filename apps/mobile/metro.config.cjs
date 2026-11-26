// Expo configures Metro for pnpm workspaces automatically.
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const { checkBuildEnvironment } = require("./plugins/build-environment.cjs");

checkBuildEnvironment(process.env);

const config = getDefaultConfig(__dirname);

// Uniwind must stay the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
