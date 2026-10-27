# OhMatrix on Tauri

The web app (`../web`) in a native window: [Tauri](https://tauri.app) 2, which uses the system's WebKitGTK on Linux. Nothing of the interface is written twice; this folder only holds the window, its icons and how it is packaged. It is its own platform beside `web` and `mobile`, and builds for Linux.

## Run it

Needs [Rust](https://rustup.rs) and, on Fedora, `webkit2gtk4.1-devel gtk3-devel libsoup3-devel librsvg2-devel openssl-devel` (on Debian and Ubuntu `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libssl-dev`).

```
pnpm --filter @ohmatrix/tauri dev                           # the window, on the web app's dev server
pnpm --filter @ohmatrix/tauri exec tauri build --debug --no-bundle    # a debug binary, src-tauri/target/debug/ohmatrix-tauri
pnpm --filter @ohmatrix/tauri exec tauri build --bundles deb          # a package: also rpm, appimage
```

`dev` and `build` first make the icons from `logo/colorful/1.svg` (`pnpm --filter @ohmatrix/tauri icons`; nothing made from the logo is kept in the repository) and build or serve the web app.

## State

The window shows the web app, with these made for the system (`src-tauri/capabilities/default.json` lists what the page may ask of it):

- Notifications for new messages, as the desktop's own, with a click bringing the window back.
- Links open in the system browser.
- Files to send are chosen with the system's file chooser; files dragged onto the window arrive as in a browser (Tauri's own drop handling is off for that).
- Settings, Appearance, has Fonts: any font installed on the system for the whole interface.

Not done yet: saving files (it needs a folder the person can choose), the system key store for sessions, a tray icon, and updates.

Run as a bare binary the window has no desktop entry, so the shell shows a generic icon; installed from the package it shows the logo.
