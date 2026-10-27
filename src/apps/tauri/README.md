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

A window that shows the web app, and nothing the page may ask of the system beyond what a browser allows (`src-tauri/capabilities/default.json` lists no permissions). Not done yet: the system key store for sessions, notifications, a tray icon, links opening in the browser, and updates.

Run as a bare binary the window has no desktop entry, so the shell shows a generic icon; installed from the package it shows the logo.
