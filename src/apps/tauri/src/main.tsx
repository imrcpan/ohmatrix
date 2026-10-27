import { openUrl } from "@tauri-apps/plugin-opener";
import { startWeb } from "@ohmatrix/web/start";
import { createTauriNotifications } from "./notifications.js";

const notifications = createTauriNotifications();
await notifications.refresh();
// A link goes to the system's browser: the window itself only ever shows the app.
await startWeb({ notifications, openLink: (url) => void openUrl(url) });
