import { useEffect } from "react";
import { t } from "@ohmatrix/i18n";
import { useController, useLocale, useServices } from "./context.js";

/** Turns engine notifications into system notifications, honouring the user's settings and what is on screen. */
export function NotificationsBridge() {
  const controller = useController();
  const services = useServices();
  const locale = useLocale();

  useEffect(() => {
    const sys = services.notifications;
    if (!sys) return;
    return controller.subscribeNotifications((n) => {
      const { prefs, selectedRoomId } = controller.store.getState();
      if (!prefs.notifications || sys.permission() !== "granted") return;
      if (sys.isActive() && selectedRoomId === n.roomId) return; // already looking at that chat
      const text = prefs.notificationPreview ? n.preview : undefined;
      sys.show({
        tag: n.roomId,
        title: n.isDirect ? n.senderName : n.roomName,
        body: text === undefined ? t(locale, "notif.new") : n.isDirect ? text : `${n.senderName}: ${text}`,
        onClick: () => {
          controller.openSidebarPage("chats");
          controller.selectRoom(n.roomId);
        },
      });
    });
  }, [controller, services, locale]);

  return null;
}
