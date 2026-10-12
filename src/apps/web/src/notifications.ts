import type { NotificationPermission, SystemNotifications } from "@ohmatrix/core";

/** Web Notification API behind the platform-neutral SystemNotifications interface. */
export function createWebNotifications(): SystemNotifications {
  const supported = typeof Notification !== "undefined";
  return {
    permission: () => (supported ? (Notification.permission as NotificationPermission) : "unsupported"),
    request: async () => (supported ? ((await Notification.requestPermission()) as NotificationPermission) : "unsupported"),
    isActive: () => document.visibilityState === "visible" && document.hasFocus(),
    show({ title, body, tag, onClick }) {
      if (!supported || Notification.permission !== "granted") return;
      const n = new Notification(title, { body, tag });
      n.onclick = () => {
        window.focus();
        n.close();
        onClick();
      };
    },
  };
}
