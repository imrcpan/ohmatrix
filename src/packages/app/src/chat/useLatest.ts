import { useRef } from "react";

/** A ref that always holds the latest value, so a callback created once can read current state without being recreated. */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
