import { useState } from "react";
import { Text } from "react-native";
import { fontFamily, useTheme } from "./theme.js";
import type { Run } from "./richtextModel.js";

export type { Run } from "./richtextModel.js";

/** Renders runs as nested Text. Links open in a new tab on the web; mentions are pills. */
export function RichText(props: {
  runs: readonly Run[];
  style: object;
  color: string;
  linkColor: string;
  mentionColor: string;
  mentionBg: string;
  onLink?: ((href: string) => void) | undefined;
  selectable?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const children = props.runs.map((run, i) => {
    if (run.text === "\n" || run.br) return "\n";
    if (run.text === "") return null;
    const style: object[] = [];
    if (run.bold) style.push({ fontWeight: "700" as const });
    if (run.italic) style.push({ fontStyle: "italic" as const });
    if (run.underline) style.push({ textDecorationLine: "underline" as const });
    if (run.strike) style.push({ textDecorationLine: "line-through" as const });
    if (run.code) style.push({ fontFamily: "monospace" });
    if (run.prefix) style.push({});
    const prefix = run.prefix ?? "";
    if (run.spoiler && !revealed)
      return (
        <Text key={i} onPress={() => setRevealed(true)} style={style} {...({ title: "Tap to reveal" } as object)}>
          {prefix}
          {run.text.replace(/[^\n]/g, "•")}
        </Text>
      );
    if (run.userId)
      return (
        <Text
          key={i}
          accessibilityLabel={`Mention ${run.text.replace(/^@/, "")}`}
          onPress={() => props.onLink?.(`https://matrix.to/#/${run.userId}`)}
          style={[...style, { color: props.mentionColor, backgroundColor: props.mentionBg, fontWeight: "600" as const }]}
        >
          {prefix}
          {run.text}
        </Text>
      );
    if (run.href)
      return (
        <Text key={i} onPress={() => props.onLink?.(run.href!)} style={[...style, { color: props.linkColor, textDecorationLine: "underline" as const }]}>
          {prefix}
          {run.text}
        </Text>
      );
    return (
      <Text key={i} style={style}>
        {prefix}
        {run.text}
      </Text>
    );
  });
  return (
    <Text selectable={props.selectable ?? true} style={props.style}>
      {children}
    </Text>
  );
}

/** Convenience: the colour set the bubble uses for links and mention pills. */
export function useLinkColors() {
  const { colors } = useTheme();
  return { linkColor: colors.accent, mentionColor: colors.accent, mentionBg: colors.mentionBg, fontFamily };
}
