export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/**
 * Turns what the user typed into the homeserver's client API address.
 * - `http://...`: taken literally (local and test servers).
 * - a bare name such as `matrix.org` or `https://matrix.org`: looked up through `.well-known/matrix/client`
 *   (the way Matrix servers delegate, e.g. matrix.org -> matrix-client.matrix.org); if that is missing or
 *   unusable, the name itself is used over https.
 */
export async function resolveHomeserver(input: string, fetchFn: FetchLike = (u) => fetch(u)): Promise<string> {
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
