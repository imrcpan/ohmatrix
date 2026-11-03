/**
 * The user a link points at, when it is a matrix.to link to a person (`https://matrix.to/#/@alice:example.org`, the way a mention is written
 * in a message); undefined for any other link. Such a link is not followed out of the app: the app is the client, and shows the person's page.
 */
export function userOfLink(url: string): string | undefined {
  const m = /^https?:\/\/matrix\.to\/#\/((?:@|%40)[^/?#\s]+)/i.exec(url.trim());
  if (!m) return undefined;
  try {
    const id = decodeURIComponent(m[1]!); // %40alice%3Aexample.org
    return /^@[^:\s]+:[^\s]+$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
