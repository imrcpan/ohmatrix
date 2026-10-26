import { startWeb } from "@ohmatrix/web/start";
import { createTauriNotifications } from "./notifications.js";

const notifications = createTauriNotifications();
await notifications.refresh();
await startWeb({ notifications });
