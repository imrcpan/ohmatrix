import { useColorScheme } from "react-native";

const light = { bg: "#ffffff", surface: "#f2f4f7", text: "#14171a", muted: "#5b6672", accent: "#2481cc", line: "#e3e7ec" };
const dark = { bg: "#0e1116", surface: "#181c23", text: "#f1f3f5", muted: "#97a1ad", accent: "#4aa3e8", line: "#262c35" };

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
