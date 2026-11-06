// Metro for the Windows desktop app (React Native Windows), in this monorepo.
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../../..");

// On Windows, require.resolve through a junction can give a path with a drive letter of another case than process.cwd(); Metro's file lookup is
// case-sensitive, so the drive letter is made to match.
function normalizePathDrive(p) {
  if (process.platform === "win32" && p.length >= 2 && p[1] === ":") return process.cwd()[0] + p.slice(1);
  return p;
}
const rnwPath = normalizePathDrive(fs.realpathSync(path.resolve(require.resolve("react-native-windows/package.json"), "..")));

const config = mergeConfig(getDefaultConfig(projectRoot), {
  // The shared packages (src/packages/*) are outside this app's folder: watch them, and look for modules in the
  // workspace root first (the layout is hoisted, see .npmrc).
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(workspaceRoot, "node_modules"), path.resolve(projectRoot, "node_modules")],
    blockList: [
      // `run-windows` and msbuild write into these while Metro runs: Metro must not watch them (it would stop on a busy file).
      new RegExp(`${path.resolve(projectRoot, "windows").replace(/[/\\]/g, "/")}.*`),
      new RegExp(`${rnwPath.replace(/[/\\]/g, "/")}/build/.*`),
      new RegExp(`${rnwPath.replace(/[/\\]/g, "/")}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
  },
  transformer: { getTransformOptions: async () => ({ transform: { experimentalImportSupport: false, inlineRequires: true } }) },
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
