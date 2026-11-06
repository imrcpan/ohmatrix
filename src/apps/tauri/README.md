# OhMatrix on Tauri

The web app (`../web`) in a native window: [Tauri](https://tauri.app) 2, which uses the system's WebKitGTK on Linux. Nothing of the interface is written twice; this folder only holds the window, its icons and how it is packaged. It is its own platform beside `web` and `mobile`, and builds for Linux and Windows (on Windows the window shows the system's WebView2).

## Run it

Needs [Rust](https://rustup.rs) and, on Fedora, `webkit2gtk4.1-devel gtk3-devel libsoup3-devel librsvg2-devel openssl-devel` (on Debian and Ubuntu `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libssl-dev`).

```
pnpm --filter @ohmatrix/tauri dev                           # the window, on the web app's dev server
pnpm --filter @ohmatrix/tauri exec tauri build --debug --no-bundle    # a debug binary, src-tauri/target/debug/ohmatrix-tauri
pnpm --filter @ohmatrix/tauri exec tauri build --bundles deb          # a package: also rpm, appimage
```

### Windows

Needs [Rust](https://rustup.rs) with the `x86_64-pc-windows-msvc` toolchain (not the GNU one), the C++ build tools of Visual Studio 2022 (the "Desktop development with C++" workload, with a Windows 11 SDK), and the WebView2 runtime (Windows 11 has it). The commands are the same as on Linux; a package is an NSIS installer (`tauri.windows.conf.json`):

```
pnpm --filter @ohmatrix/tauri exec tauri build --debug --no-bundle    # src-tauri\target\debug\ohmatrix-tauri.exe
pnpm --filter @ohmatrix/tauri exec tauri build --bundles nsis         # the installer, per user (no administrator needed)
```

The window's icon file for Windows (`icons/icon.ico`) is made with the others from the logo.

`dev` and `build` first make the icons from `logo/colorful/1.svg` (`pnpm --filter @ohmatrix/tauri icons`; nothing made from the logo is kept in the repository) and build or serve the web app.

## State

The window shows the web app, with these made for the system (`src-tauri/capabilities/default.json` lists what the page may ask of it):

- Notifications for new messages, as the desktop's own, with a click bringing the window back.
- Links open in the system browser.
- Files to send are chosen with the system's file chooser; files dragged onto the window arrive as in a browser (Tauri's own drop handling is off for that).
- Files to save go into the Downloads folder, under a name that is free, with a notification saying so.
- A tray icon (Show, Quit): closing the window hides it there and the app keeps running, so notifications keep coming. Where there is no tray, closing quits as usual.
- The window opens with the size and place it was closed with (a Wayland desktop decides the place itself).
- Settings, Appearance, has Fonts: any font installed on the system for the whole interface.

Not done yet: a folder for saved files that the person can choose, the system key store for sessions, and updates.

Run as a bare binary the window has no desktop entry, so the shell shows a generic icon; installed from the package it shows the logo.
