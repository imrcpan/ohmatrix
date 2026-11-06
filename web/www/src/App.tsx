import { Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Link } from "./Link.js";
import { features, github, intro, platforms, tagline } from "./content.js";
import logo from "./logo.svg";
import { useColors, type Colors } from "./theme.js";

const WIDE = 760;

export function App() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <View style={[styles.hero, { paddingTop: wide ? 120 : 72 }]}>
        <Image source={{ uri: logo }} style={styles.logo} accessibilityLabel="OhMatrix" />
        <Text role="heading" aria-level={1} style={[styles.title, { color: c.text, fontSize: wide ? 56 : 40 }]}>
          OhMatrix
        </Text>
        <Text style={[styles.tagline, { color: c.text, fontSize: wide ? 28 : 22 }]}>{tagline}</Text>
        <Text style={[styles.intro, { color: c.muted }]}>{intro}</Text>
        <Link href={github} style={[styles.button, { backgroundColor: c.accent }]}>
          View on GitHub
        </Link>
      </View>

      <Section c={c} title="Features">
        <View style={styles.grid}>
          {features.map((f) => (
            <View key={f.title} style={[styles.card, { backgroundColor: c.surface, width: wide ? "31.5%" : "100%" }]}>
              <Text role="heading" aria-level={3} style={[styles.cardTitle, { color: c.text }]}>
                {f.title}
              </Text>
              <Text style={[styles.cardBody, { color: c.muted }]}>{f.body}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section c={c} title="Platforms">
        <View style={styles.platforms}>
          {platforms.map((p) => (
            <View key={p.name} style={[styles.platform, { borderColor: c.line }]}>
              <Text style={[styles.platformName, { color: c.text }]}>{p.name}</Text>
              <Text style={{ color: p.status === "Planned" ? c.muted : c.accent, fontSize: 14 }}>{p.status}</Text>
            </View>
          ))}
        </View>
      </Section>

      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Text style={{ color: c.muted, fontSize: 14 }}>
          <Link href={github} style={{ color: c.accent }}>
            Source code on GitHub
          </Link>
          {" · "}OhMatrix is free software, released under the GNU GPL v3. Matrix is an open standard of the Matrix.org Foundation.
        </Text>
      </View>
    </View>
  );
}

function Section({ c, title, children }: { c: Colors; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text role="heading" aria-level={2} style={[styles.sectionTitle, { color: c.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", alignItems: "center" },
  hero: { alignItems: "center", gap: 14, paddingHorizontal: 24, paddingBottom: 72, maxWidth: 720 },
  logo: { width: 104, height: 104 },
  button: {
    marginTop: 10,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    overflow: "hidden",
  },
  title: { fontWeight: "700" },
  tagline: { fontWeight: "600", textAlign: "center" },
  intro: { fontSize: 18, lineHeight: 28, textAlign: "center" },
  section: { width: "100%", maxWidth: 1040, paddingHorizontal: 24, paddingBottom: 64, gap: 24 },
  sectionTitle: { fontSize: 28, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  card: { borderRadius: 16, padding: 24, gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  cardBody: { fontSize: 16, lineHeight: 24 },
  platforms: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  platform: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, gap: 2, minWidth: 130 },
  platformName: { fontSize: 16, fontWeight: "600" },
  footer: { width: "100%", maxWidth: 1040, borderTopWidth: 1, paddingVertical: 32, paddingHorizontal: 24, marginTop: 8 },
});
