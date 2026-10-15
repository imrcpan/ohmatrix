import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * The height of the on-screen keyboard now, 0 when it is hidden. Android only says once the keyboard has finished
 * opening or closing; iOS says before it starts, which is what keeps the content moving with it.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
