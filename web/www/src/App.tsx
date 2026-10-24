import { Image, StyleSheet, Text, View } from "react-native";
import logo from "./logo.svg";

export function App() {
  return (
    <View style={styles.page}>
      <Image source={{ uri: logo }} style={styles.logo} accessibilityLabel="OhMatrix" />
      <Text role="heading" style={styles.title}>
        OhMatrix
      </Text>
      <Text style={styles.subtitle}>A Matrix client for every screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: "100vh" as unknown as number, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  logo: { width: 96, height: 96 },
  title: { fontSize: 36, fontWeight: "700" },
  subtitle: { fontSize: 18 },
});
