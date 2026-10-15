export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** The platform's `fetch` (this package knows no platform, so it is reached through `globalThis`), giving up after 6 s. */
const platformFetch: FetchLike = (url) => {
  const g = globalThis as unknown as {
    fetch(url: string, init?: unknown): Promise<{ ok: boolean; json(): Promise<unknown> }>;
    AbortSignal?: { timeout?(ms: number): unknown };
  };
  return g.fetch(url, { signal: g.AbortSignal?.timeout?.(6000) });
};

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** Hosts that only ever speak plain http: this machine, private networks, and the usual dev suffixes. */
export function isLocalHost(host: string): boolean {
  const h = host
    .replace(/:\d+$/, "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (h === "localhost" || h === "::1" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".test") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

/**
 * Turns what the user typed into the homeserver's client API address.
 * - `http://...`: taken literally (local and test servers).
 * - a bare local address (`localhost:8008`, `192.168.1.5:8008`): such servers have no certificate, so plain http.
 * - a bare name such as `matrix.org` or `https://matrix.org`: looked up through `.well-known/matrix/client`
 *   (the way Matrix servers delegate, e.g. matrix.org -> matrix-client.matrix.org); if that is missing or
 *   unusable, the name itself is used over https.
 */
export async function resolveHomeserver(input: string, fetchFn: FetchLike = platformFetch): Promise<string> {
  const typed = input.trim();
  if (/^http:\/\//i.test(typed)) return trimSlash(typed);
  const host = typed.replace(/^https:\/\//i, "").replace(/\/.*$/, "");
  if (!/^https:\/\//i.test(typed) && isLocalHost(host)) return `http://${host}`;
  const fallback = /^https:\/\//i.test(typed) && /\/.+/.test(typed.replace(/^https:\/\//i, "")) ? trimSlash(typed) : `https://${host}`;
  if (fallback !== `https://${host}`) return fallback; // an explicit path: the user knows the address
  try {
    const res = await fetchFn(`https://${host}/.well-known/matrix/client`);
    if (res.ok) {
      const base = ((await res.json()) as { "m.homeserver"?: { base_url?: unknown } })["m.homeserver"]?.base_url;
      if (typeof base === "string" && /^https?:\/\//i.test(base)) return trimSlash(base);
    }
  } catch {
    /* offline, CORS or no well-known: fall back */
  }
  return fallback;
}
