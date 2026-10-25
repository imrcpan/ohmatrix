import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { TopNotice } from "@ohmatrix/ui";

export interface Notice {
  message: string;
  kind: "success" | "error" | "progress";
}

/** `ms` is how long a message stays; by default a few seconds, and for a message about something going on, until the next one. */
type Show = (message: string, kind?: Notice["kind"], ms?: number) => void;
const NoticeContext = createContext<{ show: Show }>({ show: () => {} });

/**
 * The short message at the top of the screen. There is one for the whole app, drawn over whatever is showing: it stays whichever page is
 * left or opened meanwhile, and goes away by itself after a few seconds (a message about something going on stays until the next one).
 */
export function NoticeProvider(props: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const show = useCallback<Show>((message, kind = "success", ms) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNotice({ message, kind });
    const stay = ms ?? (kind === "progress" ? undefined : kind === "error" ? 4000 : 2500);
    if (stay !== undefined) timer.current = setTimeout(() => setNotice(null), stay);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <NoticeContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {props.children}
        {notice && <TopNotice message={notice.message} kind={notice.kind} top={12} />}
      </View>
    </NoticeContext.Provider>
  );
}

/** The call that raises the app's notice. */
export function useNotice(): { show: Show } {
  return useContext(NoticeContext);
}
