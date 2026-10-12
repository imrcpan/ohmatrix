/**
 * Incremental list updates. Mirrors matrix-rust-sdk's VectorDiff, so native engines map 1:1
 * and the JS engine can emit the same shape. Keeps long timelines/room lists O(change), not O(n).
 */
export type ListUpdate<T> =
  | { op: "reset"; items: T[] }
  | { op: "insert"; index: number; item: T }
  | { op: "set"; index: number; item: T }
  | { op: "remove"; index: number }
  | { op: "move"; from: number; to: number };

export function applyUpdates<T>(list: readonly T[], updates: readonly ListUpdate<T>[]): T[] {
  const out = list.slice();
  for (const u of updates) {
    switch (u.op) {
      case "reset":
        out.splice(0, out.length, ...u.items);
        break;
      case "insert":
        out.splice(u.index, 0, u.item);
        break;
      case "set":
        out[u.index] = u.item;
        break;
      case "remove":
        out.splice(u.index, 1);
        break;
      case "move": {
        const [x] = out.splice(u.from, 1);
        if (x !== undefined) out.splice(u.to, 0, x);
        break;
      }
    }
  }
  return out;
}
