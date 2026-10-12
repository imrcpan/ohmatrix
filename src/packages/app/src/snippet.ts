export interface Snippet {
  before: string;
  match: string;
  after: string;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A short excerpt of `text` around the first occurrence of `term` (case-insensitive), with "..." where it is cut,
 * so a search result shows the hit in context. Without a hit the start of the text is returned.
 */
export function makeSnippet(text: string, term: string, radius = 36): Snippet {
  const flat = collapse(text);
  const needle = collapse(term).toLowerCase();
  const at = needle ? flat.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return { before: "", match: "", after: flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}...` : flat };
  const from = Math.max(0, at - radius);
  const to = Math.min(flat.length, at + needle.length + radius);
  return {
    before: `${from > 0 ? "..." : ""}${flat.slice(from, at).trimStart()}`,
    match: flat.slice(at, at + needle.length),
    after: `${flat.slice(at + needle.length, to).trimEnd()}${to < flat.length ? "..." : ""}`,
  };
}
