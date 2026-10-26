import { Text, View } from "react-native";

/** Stands where the shared app will be: enough to see that a bundle loads and draws. */
export function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111111" }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: "#FFFFFF" }}>OhMatrix</Text>
    </View>
  );
}
