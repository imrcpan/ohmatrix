# OhMatrix for Linux

The desktop app for Linux, drawn with [react-native-linux](https://github.com/react-native-linux/react-native-linux): React Native's Fabric renderer on Skia, straight into a Wayland window, with Hermes running the JavaScript. There is no Electron, GTK, Qt or webview.

## State

A scaffold that runs: Metro makes a bundle for the `linux` platform, and `rnl_window` opens it in a Wayland window, where the placeholder `App` draws. Not done yet:

- The shared app (`@ohmatrix/app`), an engine and the platform services are not wired in.
- Window, tray, notifications, the system key store and updates.
- The React Native version of the host (0.87.1) and of the shared packages (0.86.3) differ.

## Run it

react-native-linux is not on npm, so it is built from a checkout, once:

```
git clone https://github.com/react-native-linux/react-native-linux.git
cd react-native-linux
pnpm install --frozen-lockfile
pnpm run doctor --core --window      # names what is missing on this machine (on Fedora: clang, ninja-build, libcurl-devel and the wayland, vulkan, freetype, fontconfig, xkbcommon, icu, boost, fmt, glog, double-conversion development packages)
pnpm --filter @react-native-linux/core vendor
pnpm --filter @react-native-linux/core vendor:skia
pnpm --filter @react-native-linux/core vendor:fonts
CC=clang CXX=clang++ cmake --preset dev -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++
cmake --build build/dev --target rnl_window
```

Use clang: GCC 16 stops on React Native's headers. Then, from this folder, with `RNL_DIR` naming the checkout:

```
export RNL_DIR=/path/to/react-native-linux
pnpm bundle
$RNL_DIR/build/dev/bin/rnl_window --fabric build/index.bundle.js
```

`--screenshot out.png --frames 120` runs it for that many frames and writes the picture (a few frames is too early: the first ones are empty). `bundle` writes `build/index.bundle.js`; Metro reads react-native-linux's resolver from `RNL_DIR`, which swaps in the Linux versions of React Native's platform files, and files named `*.linux.ts(x)` are picked for this platform.

## Things to know

- react-native-linux is pre-alpha: no npm package, no Metro or app template of its own yet, `TextInput` still being checked, and only Wayland is a first-class target.
- It is built on React Native 0.87.1; the shared packages here use 0.86.3. The placeholder runs with the bundle made from 0.86.3's JavaScript; the shared app has not been tried on it.
