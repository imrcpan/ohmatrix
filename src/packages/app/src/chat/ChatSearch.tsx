import { useState } from "react";
import { ScrollView, View } from "react-native";
import { IconButton, SearchField, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "../context.js";
import { MessageResults } from "../MessageResults.js";
import { HEADER_HEIGHT } from "./ChatHeader.js";

/**
 * Search inside one chat: a results list that covers the chat below its header. Picking a result closes it and
 * jumps to the message. Mounted only while searching, so the term starts empty every time.
 */
export function ChatSearch(props: { roomId: string; onClose(): void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [term, setTerm] = useState("");
  return (
    <View
      accessibilityLabel={t("search.inChat")}
      style={{ position: "absolute", top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0, zIndex: 4, backgroundColor: colors.bg }}
    >
      <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchField value={term} onChangeText={setTerm} placeholder={t("search.inChat")} autoFocus />
        </View>
        <IconButton icon="close" label={t("search.close")} size={20} color={colors.textSecondary} onPress={props.onClose} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <MessageResults
          term={term}
          roomId={props.roomId}
          showRoom={false}
          onPick={(r) => {
            props.onClose();
            controller.openMessage(r.roomId, r.eventId);
          }}
        />
      </ScrollView>
    </View>
  );
}
