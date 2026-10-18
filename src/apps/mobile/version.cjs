// The version of a build and the number Android orders it by. Plain CommonJS, because app.config.js (read by Expo's CLI) uses it.

const ABIS = { "armeabi-v7a": 1, "arm64-v8a": 2, x86_64: 4 };

/** Splits "a.b.c"; throws for anything else, and for a minor or patch above 99 (the version code has two digits for each). */
function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`version must look like a.b.c (digits only), not '${version}'`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (minor > 99 || patch > 99) throw new Error(`in a.b.c the b and c are at most 99, not '${version}'`);
  if (major > 9999) throw new Error(`in a.b.c the a is at most 9999, not '${version}'`);
  return { major, minor, patch };
}

/**
 * Android's versionCode: a*10000 + b*100 + c, times ten, plus a digit for the ABI. A later version always has a higher code, and
 * the APKs of one version differ from each other (what a store needs to serve one per device). Without an ABI the digit is 0.
 */
function versionCodeOf(version, abi) {
  const { major, minor, patch } = parseVersion(version);
  if (abi !== undefined && !(abi in ABIS)) throw new Error(`unknown ABI '${abi}'`);
  return (major * 10000 + minor * 100 + patch) * 10 + (abi === undefined ? 0 : ABIS[abi]);
}

module.exports = { ABIS, parseVersion, versionCodeOf };
