# OhMatrix for Linux

The desktop app for Linux, drawn with [react-native-linux](https://github.com/react-native-linux/react-native-linux): React Native's Fabric renderer on Skia, straight into a Wayland window, with Hermes running the JavaScript. There is no Electron, GTK, Qt or webview.

## State

A scaffold. `index.ts` registers a placeholder `App`, and Metro makes a bundle for the `linux` platform. Not done yet:

- The native host (the `rnl_window` side) is not built or run from here yet.
- The shared app (`@ohmatrix/app`), an engine and the platform services are not wired in.
- Window, tray, notifications, the system key store and updates.

## Bundle

```
pnpm --filter @ohmatrix/desktop-linux bundle
```

writes `build/index.bundle.js`. Files named `*.linux.ts(x)` are picked for this platform.

## Things to know

- react-native-linux is pre-alpha: no npm package, no Metro or app template of its own yet, `TextInput` still being checked, and only Wayland is a first-class target.
- It is built on React Native 0.87.1; the shared packages here use 0.86.3. The bundle comes from 0.86.3's JavaScript, so the two have to be brought together before the app can run on it.
