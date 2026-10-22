import { Image, Pressable, View } from "react-native";
import type { Sticker } from "@ohmatrix/core";
import { Icon, mix, useTheme } from "@ohmatrix/ui";
import { useMediaUrl } from "../useMedia.js";
import { STICKER_TILE } from "./stickerGrid.js";

const TILE = STICKER_TILE;

/** One sticker of the pack: its picture whole (an animation plays). Pressed, it is sent, or, while choosing, chosen or let go. */
export function StickerTile(props: { sticker: Sticker; choosing: boolean; chosen: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const animated = props.sticker.mimeType === "image/gif" || props.sticker.mimeType === "image/webp";
  const uri = useMediaUrl(props.sticker.url, animated ? {} : { width: TILE * 2, height: TILE * 2, fit: "scale" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.sticker.shortcode}
      accessibilityState={{ selected: props.chosen }}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        width: TILE,
        height: TILE,
        borderRadius: 10,
        padding: 4,
        backgroundColor: props.chosen ? mix(colors.bg, colors.accent, 0.18) : pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      {uri ? <Image source={{ uri }} resizeMode="contain" style={{ flex: 1 }} /> : null}
      {props.choosing && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 3,
            top: 3,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: props.chosen ? colors.accent : colors.textTertiary,
            backgroundColor: props.chosen ? colors.accent : colors.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {props.chosen && <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />}
        </View>
      )}
    </Pressable>
  );
}
