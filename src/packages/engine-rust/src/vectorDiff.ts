import type { ListUpdate } from "@ohmatrix/core";

/**
 * One change to one of matrix-rust-sdk's observable lists (the room list, a timeline), as the bindings deliver it.
 * `T` is the SDK's element, so the same shape serves rooms and timeline items; `RoomListEntriesUpdate` and
 * `TimelineDiff` differ only in how the variants are tagged, which the callers translate.
 */
export type VectorDiff<T> =
  | { kind: "Append"; values: T[] }
  | { kind: "Clear" }
  | { kind: "PushFront"; value: T }
  | { kind: "PushBack"; value: T }
  | { kind: "PopFront" }
  | { kind: "PopBack" }
  | { kind: "Insert"; index: number; value: T }
  | { kind: "Set"; index: number; value: T }
  | { kind: "Remove"; index: number }
  | { kind: "Truncate"; length: number }
  | { kind: "Reset"; values: T[] };

/**
 * Turns a batch of SDK changes into our `ListUpdate`s, converting each element with `convert`. `size` is how many
 * elements the list holds before the batch: it is what makes `PopBack`, `PushBack`, `Append` and `Truncate` into
 * indexed operations, and it is updated as the batch goes. Elements the caller does not show (`convert` returns
 * null) keep their place in the list but are not shown, so indexes refer to the SDK's list, not ours.
 */
export function fromVectorDiff<T, U>(diffs: readonly VectorDiff<T>[], size: { n: number }, convert: (value: T) => U): ListUpdate<U>[] {
  const out: ListUpdate<U>[] = [];
  for (const d of diffs) {
    switch (d.kind) {
      case "Append":
        for (const v of d.values) out.push({ op: "insert", index: size.n++, item: convert(v) });
        break;
      case "Clear":
        size.n = 0;
        out.push({ op: "reset", items: [] });
        break;
      case "PushFront":
        out.push({ op: "insert", index: 0, item: convert(d.value) });
        size.n++;
        break;
      case "PushBack":
        out.push({ op: "insert", index: size.n++, item: convert(d.value) });
        break;
      case "PopFront":
        out.push({ op: "remove", index: 0 });
        size.n--;
        break;
      case "PopBack":
        out.push({ op: "remove", index: --size.n });
        break;
      case "Insert":
        out.push({ op: "insert", index: d.index, item: convert(d.value) });
        size.n++;
        break;
      case "Set":
        out.push({ op: "set", index: d.index, item: convert(d.value) });
        break;
      case "Remove":
        out.push({ op: "remove", index: d.index });
        size.n--;
        break;
      case "Truncate":
        // Everything from `length` on goes; removing from the end keeps every index valid as we go.
        while (size.n > d.length) out.push({ op: "remove", index: --size.n });
        break;
      case "Reset":
        size.n = d.values.length;
        out.push({ op: "reset", items: d.values.map(convert) });
        break;
    }
  }
  return out;
}

/**
 * What the generated bindings hand over for one change of a list: the variant in `tag` and its data in `inner`. The
 * room list (`RoomListEntriesUpdate`) and a timeline (`TimelineDiff`) have the same eleven variants.
 */
export interface SdkDiff<T> {
  tag: string;
  inner?: { values?: T[]; value?: T; index?: number; length?: number } | undefined;
}

/** Our `VectorDiff` for the SDK's. A variant we do not know is a bug in the bindings and is reported as one. */
export function fromSdkDiff<T>(d: SdkDiff<T>): VectorDiff<T> {
  const i = d.inner ?? {};
  switch (d.tag) {
    case "Append":
      return { kind: "Append", values: i.values ?? [] };
    case "Clear":
      return { kind: "Clear" };
    case "PushFront":
      return { kind: "PushFront", value: i.value as T };
    case "PushBack":
      return { kind: "PushBack", value: i.value as T };
    case "PopFront":
      return { kind: "PopFront" };
    case "PopBack":
      return { kind: "PopBack" };
    case "Insert":
      return { kind: "Insert", index: i.index ?? 0, value: i.value as T };
    case "Set":
      return { kind: "Set", index: i.index ?? 0, value: i.value as T };
    case "Remove":
      return { kind: "Remove", index: i.index ?? 0 };
    case "Truncate":
      return { kind: "Truncate", length: i.length ?? 0 };
    case "Reset":
      return { kind: "Reset", values: i.values ?? [] };
    default:
      throw new Error(`unknown list change "${d.tag}" from the bindings`);
  }
}
