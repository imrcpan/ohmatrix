import { useState } from "react";
import { Image, Text, View } from "react-native";
import { fontFamily, peerColor } from "./theme.js";

function initials(name: string): string {
  const clean = name.replace(/^[@#!]/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]![0], parts[1]![0]] : [...clean].slice(0, 2);
  return chars.join("").toUpperCase() || "?";
}

/**
 * Avatar for a person or a room. `shape` is a circle for chats and people, and a rounded square for spaces
 * (Telegram uses the same distinction between a chat and a folder-like container).
 */
export function Avatar(props: { id: string; name: string; size?: number; src?: string | undefined; shape?: "circle" | "square" }) {
  const size = props.size ?? 52;
  const radius = props.shape === "square" ? Math.round(size * 0.28) : size / 2;
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (props.src && failed !== props.src) {
    // The colour of the person is only what stands in until the picture is there: a picture with a transparent background must show what is
    // behind it, not that colour.
    return (
      <Image
        source={{ uri: props.src }}
        onLoad={() => setLoaded(props.src ?? null)}
        onError={() => setFailed(props.src ?? null)}
        accessibilityLabel={props.name}
        style={{ width: size, height: size, borderRadius: radius, ...(loaded === props.src ? {} : { backgroundColor: peerColor(props.id) }) }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: peerColor(props.id), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily, fontWeight: "600", fontSize: size * 0.38 }} selectable={false}>
        {initials(props.name)}
      </Text>
    </View>
  );
}
