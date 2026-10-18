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

/**
 * Turns what the user typed into the homeserver's client API address. Plain http is never assumed: it is used only when typed.
 * - `http://...`: taken literally (local and test servers have to be written this way).
 * - a bare name such as `matrix.org`, or `https://matrix.org`: looked up through `.well-known/matrix/client`
 *   (the way Matrix servers delegate, e.g. matrix.org -> matrix-client.matrix.org); if that is missing or
 *   unusable, the name itself is used over https.
 */
export async function resolveHomeserver(input: string, fetchFn: FetchLike = platformFetch): Promise<string> {
  const typed = input.trim();
  if (/^http:\/\//i.test(typed)) return trimSlash(typed);
  const host = typed.replace(/^https:\/\//i, "").replace(/\/.*$/, "");
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
