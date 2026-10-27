import { isPermissionGranted, onAction, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { NotificationPermission, SystemNotifications } from "@ohmatrix/core";

/**
 * The desktop's notifications through the Tauri plugin. The permission is the system's, so `permission` has to answer at once from what was
 * last asked: it starts as `default`, and is made known when the page starts (`refresh`) and after each `request`.
 */
export function createTauriNotifications(): SystemNotifications & { refresh(): Promise<void> } {
  let permission: NotificationPermission = "default";
  let focused = true;
  const clicks = new Map<string, () => void>();

  void getCurrentWindow().onFocusChanged(({ payload }) => {
    focused = payload;
  });
  // A click on a notification reports the notification, whose `extra` names the chat it was for.
  void onAction((event) => {
    const tag = event.notification?.extra?.["tag"];
    if (typeof tag !== "string") return;
    void getCurrentWindow()
      .show()
      .then(() => getCurrentWindow().setFocus());
    clicks.get(tag)?.();
  });

  return {
    kind: "system",
    permission: () => permission,
    async refresh() {
      permission = (await isPermissionGranted()) ? "granted" : "default";
    },
    async request() {
      const answer = await requestPermission();
      permission = answer === "granted" ? "granted" : answer === "denied" ? "denied" : "default";
      return permission;
    },
    isActive: () => focused && document.visibilityState === "visible",
    show({ title, body, tag, onClick }) {
      if (permission !== "granted") return;
      clicks.set(tag, onClick);
      sendNotification({ title, body, extra: { tag } });
    },
  };
}
