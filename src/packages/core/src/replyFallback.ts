/**
 * A reply of an older client carries the quote in its own body (`> <@a:x> text`, a blank line, then the answer). Without that quote, what is
 * left is the message itself: so a quote of a reply shows what the reply says, and not the chain of what it answered.
 */
export function stripReplyFallback(body: string): string {
  if (!body.startsWith("> ")) return body;
  const i = body.indexOf("\n\n");
  // Whatever separated the quote from the reply, the reply itself never starts with blank lines.
  return i === -1 ? body : body.slice(i + 2).replace(/^\n+/, "");
}
