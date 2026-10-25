/** What was typed for a server, as its name (`kde.org`, with a port if it has one): a link or an address is cut down to the host. */
export function serverName(typed: string): string | null {
  const host = typed
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^[@#!][^:]*:/, "")
    .replace(/[/?#].*$/, "");
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(host) ? host : null;
}
