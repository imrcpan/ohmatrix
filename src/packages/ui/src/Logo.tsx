import { Platform } from "react-native";
import { SvgXml } from "react-native-svg";
import { withoutFilters } from "./logoXml.js";

/** The app's logo, drawn from its SVG markup, `size` px square (the logo keeps its own proportions inside). */
export function Logo(props: { xml: string; size: number }) {
  return <SvgXml xml={Platform.OS === "web" ? props.xml : withoutFilters(props.xml)} width={props.size} height={props.size} />;
}
