import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Platform, ScrollView, Text, View } from "react-native";
import { clearLog, logLines, logText, onLog, type LogLine } from "@ohmatrix/core";
import { fontFamily, IconButton, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { PageHeader } from "./settings/kit.js";

const MONO = "monospace";
/** New lines are shown at most this often: a burst of hundreds of lines is one update, not hundreds. */
const REFRESH_MS = 300;
const WARN = "#E0A100";

/** One line. Memoised: the list is refreshed whenever lines are added, and the lines that were there must not be drawn again. */
const Row = memo(function Row(props: { line: LogLine; text: string; danger: string }) {
  const { line } = props;
  const color = line.level === "error" ? props.danger : line.level === "warn" ? WARN : props.text;
  return (
    <Text selectable style={{ fontFamily: MONO, fontSize: 12, lineHeight: 17, paddingVertical: 2, paddingHorizontal: 14, color }}>
      <Text style={{ opacity: 0.5 }}>{`${new Date(line.ts).toISOString().slice(11, 23)} `}</Text>
      {line.text}
    </Text>
  );
});

/**
 * The app's log (what the JavaScript of the app wrote to the console since it started, the last 2000 lines), in a monospaced font with
 * long lines wrapped. The buttons copy it and empty it.
 *
 * On a phone the list is an inverted, virtualised one (the newest line first, so the bottom is where it starts and stays while lines are
 * added, and only the lines near the screen exist): drawing all 2000 lines, some of them long, made the page crawl. A browser draws them
 * all without trouble, and an inverted list there loses the wheel's inertia, so the web has a plain scrolling view that follows the end.
 */
export function LogPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const nav = useNavBottom();
  const [lines, setLines] = useState(logLines);
  const [copied, setCopied] = useState(false);
  const web = Platform.OS === "web";

  // The page follows the log, but not line by line: when something is added, it is refreshed once, a little later.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      timer = null;
      setLines(logLines());
    };
    const off = onLog(() => {
      timer ??= setTimeout(refresh, REFRESH_MS);
    });
    refresh();
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    const text = logText(lines);
    try {
      if (services.copyText) await services.copyText(text);
      else await (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard?.writeText(text);
      setCopied(true);
    } catch {
      /* nothing to say: the log is still on the screen to be read */
    }
  };

  const renderItem = useCallback(({ item }: { item: LogLine }) => <Row line={item} text={colors.text} danger={colors.danger} />, [colors.text, colors.danger]);

  // Newest first, for the inverted list. A new array only when the log was refreshed.
  const newestFirst = useRef<{ from: readonly LogLine[]; list: LogLine[] }>({ from: [], list: [] });
  if (!web && newestFirst.current.from !== lines) newestFirst.current = { from: lines, list: lines.slice().reverse() };

  const scroll = useRef<ScrollView>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        title={t("logs")}
        onBack={() => controller.sidebarBack()}
        backLabel={t("advanced.options")}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconButton icon={copied ? "check" : "copy"} label={t("copy")} size={22} onPress={() => void copy()} />
            <IconButton icon="trash" label={t("logs.clear")} size={22} onPress={clearLog} />
          </View>
        }
      />
      {lines.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("logs.empty")}</Text>
        </View>
      ) : web ? (
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 + nav }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {lines.map((l) => (
            <Row key={l.id} line={l} text={colors.text} danger={colors.danger} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={newestFirst.current.list}
          inverted
          keyExtractor={(l) => String(l.id)}
          renderItem={renderItem}
          style={{ flex: 1 }}
          // Offset 0 is the bottom: while the view is there, a new line keeps it there; scrolled up to read, it stays where it is.
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
          contentContainerStyle={{ paddingTop: 16 + nav, paddingBottom: 4 }}
          initialNumToRender={25}
          maxToRenderPerBatch={20}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
}
