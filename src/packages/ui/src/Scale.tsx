import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { ScaleContext } from "./viewport.js";

/**
 * Scales a subtree: lays it out in a window `scale` times smaller, then magnifies it from the top-left
 * corner (React Native has no page zoom). Touches follow the transform. Native Modals are separate
 * windows, so each one wraps its content in this too.
 */
export function ScaleRoot(props: { scale: number; children: ReactNode }) {
  const win = useWindowDimensions();
  if (props.scale === 1) return <>{props.children}</>;
  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <View
        style={[
          { width: win.width / props.scale, height: win.height / props.scale, transform: [{ scale: props.scale }] },
          { transformOrigin: "top left" } as object,
        ]}
      >
        {props.children}
      </View>
    </View>
  );
}

export function ScaleProvider(props: { scale: number; children: ReactNode }) {
  return (
    <ScaleContext.Provider value={props.scale}>
      <ScaleRoot scale={props.scale}>{props.children}</ScaleRoot>
    </ScaleContext.Provider>
  );
}
