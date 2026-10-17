import { memo } from "react";
import { Text, View } from "react-native";
import { Chip, fontFamily, useTheme } from "@ohmatrix/ui";
import { useT } from "../context.js";
import type { Row } from "../timelineRows.js";
import { MessageRow } from "./MessageRow.js";
import type { RowActions } from "./rowActions.js";

function UnreadDivider() {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={{ marginVertical: 8, paddingVertical: 4, backgroundColor: colors.serviceChip, alignItems: "center" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: colors.serviceChipText }}>{t("newMessages")}</Text>
    </View>
  );
}

/**
 * One row of the list. Only a message needs any state, so only a message mounts a component with hooks; the other kinds
 * (date, service line, "new messages" divider) are plain, and a row never changes kind in place (their keys differ).
 */
export const TimelineRow = memo(function TimelineRow(props: { row: Row; isGroup: boolean; actions: RowActions; highlighted?: boolean | undefined }) {
  const { row } = props;
  switch (row.type) {
    case "unread":
      return <UnreadDivider />;
    case "date":
      return <Chip text={row.label} />;
    case "service":
      return <Chip text={row.text} />;
    case "message":
      return (
        <MessageRow
          rowKey={row.key}
          item={row.item}
          first={row.first}
          last={row.last}
          newSender={row.newSender}
          stickAbove={row.stickAbove}
          stickBelow={row.stickBelow}
          isGroup={props.isGroup}
          actions={props.actions}
          highlighted={props.highlighted}
        />
      );
  }
});
