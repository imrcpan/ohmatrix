import { SvgXml } from "react-native-svg";

/** The app's logo, drawn from its SVG markup, `size` px square (the logo keeps its own proportions inside). */
export function Logo(props: { xml: string; size: number }) {
  return <SvgXml xml={props.xml} width={props.size} height={props.size} />;
}
