import { useCallback, useEffect, useRef, useState } from "react";

export interface Notice {
  message: string;
  kind: "success" | "error";
}

/** The message a `TopNotice` shows, and the call that raises it: it goes away by itself after a few seconds. */
export function useNotice(): { notice: Notice | null; show(message: string, kind?: Notice["kind"]): void } {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const show = useCallback((message: string, kind: Notice["kind"] = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setNotice({ message, kind });
    timer.current = setTimeout(() => setNotice(null), kind === "error" ? 4000 : 2500);
  }, []);
  return { notice, show };
}
