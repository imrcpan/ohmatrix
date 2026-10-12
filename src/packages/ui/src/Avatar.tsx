import { useState } from "react";
import { Image, Text, View } from "react-native";
import { fontFamily, peerColor } from "./theme.js";

function initials(name: string): string {
  const clean = name.replace(/^[@#!]/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]![0], parts[1]![0]] : [...clean].slice(0, 2);
  return chars.join("").toUpperCase() || "?";
}

/** Circular avatar with deterministic colour + initials (no remote images yet). */
export function Avatar(props: { id: string; name: string; size?: number; src?: string | undefined }) {
  const size = props.size ?? 52;
  const [failed, setFailed] = useState<string | null>(null);
  if (props.src && failed !== props.src) {
    return (
      <Image
        source={{ uri: props.src }}
        onError={() => setFailed(props.src ?? null)}
        accessibilityLabel={props.name}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: peerColor(props.id) }}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: peerColor(props.id), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily, fontWeight: "600", fontSize: size * 0.38 }} selectable={false}>
        {initials(props.name)}
      </Text>
    </View>
  );
}
