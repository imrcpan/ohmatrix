import { Text, type TextProps } from "react-native";

/** An external link: react-native-web renders a Text with `href` as an anchor, though its types do not list the prop. */
export function Link({ href, ...rest }: TextProps & { href: string }) {
  const web = { href, hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } };
  return <Text role="link" {...rest} {...web} />;
}
