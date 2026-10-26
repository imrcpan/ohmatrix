// Metro for the Linux desktop app, in this monorepo.
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../../..");

// react-native-linux is not on npm: its checkout is named by RNL_DIR (the folder `git clone` made), and its resolver, which swaps in the
// Linux versions of React Native's platform files (`Platform`, colours, native components), is read from there.
const rnlDir = process.env.RNL_DIR;
if (!rnlDir) throw new Error("Set RNL_DIR to the react-native-linux checkout (see README.md).");
const { linuxResolverConfig } = require(path.join(rnlDir, "packages/cli/src/linux-resolver-config.ts"));
const linux = linuxResolverConfig(projectRoot);

const config = mergeConfig(getDefaultConfig(projectRoot), {
  // The shared packages (src/packages/*) are outside this app's folder: watch them, and look for modules in the
  // workspace root first (the layout is hoisted, see .npmrc).
  watchFolders: [workspaceRoot, path.join(rnlDir, "packages/core")],
  resolver: {
    platforms: linux.platforms,
    nodeModulesPaths: [path.resolve(workspaceRoot, "node_modules"), path.resolve(projectRoot, "node_modules")],
    resolveRequest: linux.resolveRequest,
  },
});

// The sources are written the ESM way: `import "./Foo.js"` for a file that is Foo.ts or Foo.tsx. Vite and tsc know that;
// Metro does not, so a relative `.js` import that is not there is looked for as TypeScript.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const base = moduleName.slice(0, -3);
    for (const ext of [".ts", ".tsx"]) {
      try {
        return resolve(context, base + ext, platform);
      } catch {
        /* try the next one, and then the name as it was written */
      }
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
