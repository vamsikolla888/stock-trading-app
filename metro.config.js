const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Tool-managed git worktrees (Kilo Code keeps full checkouts of this repo under .kilo/)
// are copies, not part of the app: without this Metro crawls and watches every file in
// them — a second package.json, src/ and lockfile — which slows startup and floods the
// terminal with duplicate-module noise.
const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);
config.resolver.blockList = [...blockList, /[\\/]\.kilo[\\/].*/];

module.exports = withNativeWind(config, { input: './global.css' });
