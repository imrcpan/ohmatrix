import { Image } from "react-native";
import { Pulse, SkeletonBlock } from "@ohmatrix/ui";
import { useMediaUrl } from "../useMedia.js";

const SIZE = 18;

/** A custom emoji reaction: the key is the `mxc://` address of its picture. */
export function CustomEmoji(props: { mxc: string }) {
  const url = useMediaUrl(props.mxc, { width: SIZE * 2, height: SIZE * 2, fit: "scale" });
  if (!url) {
    return (
      <Pulse>
        <SkeletonBlock width={SIZE} height={SIZE} circle />
      </Pulse>
    );
  }
  return <Image source={{ uri: url }} style={{ width: SIZE, height: SIZE }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
