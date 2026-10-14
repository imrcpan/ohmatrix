/**
 * Read older history a page at a time until `has()` turns true, giving up when pages stop adding anything (the
 * beginning of the room) or after `maxRounds`. Used to bring a message that is not loaded into reach.
 */
export async function loadUntil(opts: {
  has: () => boolean;
  /** Ask for one more page of history. */
  paginate: () => Promise<void>;
  /** How many messages are loaded now; growth tells that a page arrived. */
  count: () => number;
  maxRounds?: number;
  /** Let the page land before looking (the store updates after the request returns). */
  wait?: () => Promise<void>;
  /** Pages in a row that add nothing before concluding the room has no more. */
  stalls?: number;
}): Promise<boolean> {
  const { has, paginate, count } = opts;
  const rounds = opts.maxRounds ?? 40;
  const stallLimit = opts.stalls ?? 2;
  const wait = opts.wait ?? (() => new Promise<void>((r) => setTimeout(() => r(), 200)));
  let stalled = 0;
  for (let i = 0; i < rounds && !has(); i++) {
    const before = count();
    await paginate();
    await wait();
    if (count() === before) {
      if (++stalled >= stallLimit) break;
    } else stalled = 0;
  }
  return has();
}
