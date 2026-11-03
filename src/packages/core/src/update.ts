/** Looking for a newer version of the app among the releases of its repository on GitHub. */

/** Where the releases are, and where the newest one is asked for (the newest that is not a draft and not a pre-release). */
export const RELEASES_PAGE = "https://github.com/imrcpan/ohmatrix/releases";
export const LATEST_RELEASE_API = "https://api.github.com/repos/imrcpan/ohmatrix/releases/latest";

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface Release {
  /** The version, without the leading v (the tag is v1.2.3). */
  version: string;
  /** The page of the release. */
  page: string;
  assets: ReleaseAsset[];
}

/** The numbers of "1.2.3" or "v1.2.3" (anything after them, like -rc1, is left out); null when it is not a version. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether `latest` is a newer version than `current`. A current version that is not one (a development build) is older than any. */
export function isNewer(latest: string, current: string | undefined): boolean {
  const a = parseVersion(latest);
  if (!a) return false;
  const b = (current && parseVersion(current)) || [0, 0, 0];
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  return false;
}

/** The release from the JSON the GitHub API answers with; null when it is not a release with a version. */
export function parseRelease(json: unknown): Release | null {
  const o = json as { tag_name?: unknown; html_url?: unknown; assets?: unknown } | null;
  if (!o || typeof o.tag_name !== "string" || !parseVersion(o.tag_name)) return null;
  const assets = (Array.isArray(o.assets) ? o.assets : []).flatMap((a: { name?: unknown; browser_download_url?: unknown }) =>
    typeof a?.name === "string" && typeof a.browser_download_url === "string" ? [{ name: a.name, url: a.browser_download_url }] : [],
  );
  return { version: o.tag_name.replace(/^v/, ""), page: typeof o.html_url === "string" ? o.html_url : RELEASES_PAGE, assets };
}

/** The APK of the release for the first of `abis` that has one (the order is the phone's preference); undefined when there is none. */
export function pickApk(assets: readonly ReleaseAsset[], abis: readonly string[]): ReleaseAsset | undefined {
  for (const abi of abis) {
    const found = assets.find((a) => a.name.endsWith(`_${abi}.apk`));
    if (found) return found;
  }
  return undefined;
}

/** What of `fetch` is used (this package has no browser types, and knows no platform: the platform's own is reached through `globalThis`). */
export type ReleaseFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: unknown },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const platformFetch: ReleaseFetch = (url, init) => {
  const g = globalThis as unknown as { fetch: ReleaseFetch; AbortSignal?: { timeout?(ms: number): unknown } };
  return g.fetch(url, { ...init, signal: g.AbortSignal?.timeout?.(10000) });
};

/** Asks GitHub for the newest release, giving up after 10 s. Throws when it cannot be reached or does not answer with a release. */
export async function fetchLatestRelease(fetchImpl: ReleaseFetch = platformFetch): Promise<Release> {
  const response = await fetchImpl(LATEST_RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = parseRelease(await response.json());
  if (!release) throw new Error("no release found");
  return release;
}
