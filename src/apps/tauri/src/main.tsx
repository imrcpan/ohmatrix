import { openUrl } from "@tauri-apps/plugin-opener";
import { startWeb } from "@ohmatrix/web/start";
import { createTauriNotifications } from "./notifications.js";
import { listFonts } from "./listFonts.js";
import { pickFiles } from "./pickFiles.js";
import { saveFile } from "./saveFile.js";

const notifications = createTauriNotifications();
await notifications.refresh();
// A link goes to the system's browser: the window itself only ever shows the app.
await startWeb({ notifications, openLink: (url) => void openUrl(url), pickFiles, listFonts, saveFile });
