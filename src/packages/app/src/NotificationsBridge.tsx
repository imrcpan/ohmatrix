import { useEffect } from "react";
import { t } from "@ohmatrix/i18n";
import { useAccountManager, useLocale, useServices } from "./context.js";

/**
 * Turns engine notifications into system notifications, honouring the user's settings and what is on screen. It listens to
 * every account, not just the one showing; a click opens the account the message came to, then the chat.
 */
export function NotificationsBridge() {
  const manager = useAccountManager();
  const services = useServices();
  const locale = useLocale();

  useEffect(() => {
    const sys = services.notifications;
    if (!sys) return;
    return manager.subscribeNotifications((userId, n) => {
      const controller = manager.controllerOf(userId);
      if (!controller) return;
      const { prefs, selectedRoomId } = controller.store.getState();
      if (!prefs.notifications || sys.permission() !== "granted") return;
      const showing = manager.store.getState().currentKey === userId;
      if (showing && sys.isActive() && selectedRoomId === n.roomId) return; // already looking at that chat
      const text = prefs.notificationPreview ? n.preview : undefined;
      sys.show({
        // One notification per chat; the account is part of the tag, so two accounts in the same room do not replace each other.
        tag: `${userId}${n.roomId}`,
        title: n.isDirect ? n.senderName : n.roomName,
        body: text === undefined ? t(locale, "notif.new") : n.isDirect ? text : `${n.senderName}: ${text}`,
        onClick: () => {
          manager.switchTo(userId);
          const c = manager.controllerOf(userId);
          c?.openSidebarPage("chats");
          c?.selectRoom(n.roomId);
        },
      });
    });
  }, [manager, services, locale]);

  return null;
}
