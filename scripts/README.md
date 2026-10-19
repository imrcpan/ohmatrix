# scripts/

Build, sign and check scripts. Each script's options are described in the comment at its top; this page is the map.

| Script             | What it does                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `build-web.sh`     | Builds the web app into `~/release/web`.                                                           |
| `build-android.sh` | Builds the Android app, one APK per ABI, into `~/release/android`. Signed with the debug key.      |
| `sign-android.sh`  | Signs built APKs with the release key, after the build.                                            |
| `verify/docker.sh` | Runs the build scripts in a bare Debian container, to see that they need nothing from the machine. |

`lib/` and `setup/` are what the scripts share and what they install (system packages, Node, pnpm, a JDK, Rust, the Android SDK and NDK). They are not run by hand.

## Building

```
scripts/build-web.sh     --version 1.2.3
scripts/build-android.sh --version 1.2.3
```

- `--version` is required. It is shown in Settings, and each ABI gets its own version code from it.
- On a bare Debian each is one command: it installs what is missing, then builds. What is already there is used as it is.
- CPU and memory are not fixed: the compile settings follow what the machine (or container) has. For the Android build the lower limit is about 6 GB of memory.
- `--check` only reports what is missing and whether the machine is big enough; `--skip-setup` installs nothing; `--jobs N` overrides the parallel jobs.
- The result goes to `~/release` (`--release-dir`), with names like `OhMatrix_android_1.2.3_arm64-v8a.apk`.
- Android builds `arm64-v8a`, `armeabi-v7a` and `x86_64` by default (`--targets` to choose). A release build is smaller and slower to build (the Rust library is built with the `dist` profile and one codegen unit).
- Push (FCM, Android) is built in from `src/apps/mobile/google-services.json`; `--google-services FILE` builds with another file. A file that is named and missing is an error. Without any file the app builds with no push and works as before.
- Environment: `OHM_TOOLS` (where tools are installed, default `~/.ohmatrix-tools`), `OHM_OUT` (caches and logs), `OHM_RELEASE_DIR`, `EXPO_PUBLIC_DEFAULT_HOMESERVER` / `VITE_DEFAULT_HOMESERVER` (the server offered on the sign-in screen).

## Signing (Android)

The commands, from making the key to checking a published APK, are in [sign.md](sign.md).

`build-android.sh` never sees the release key. APKs come out signed with the debug key, which is fine for installing on your own phone and not for publishing. Sign them afterwards:

```
OHM_KEYSTORE_PASSWORD=... \
scripts/sign-android.sh --keystore FILE --key-alias ALIAS \
    --expect-sha256 <SHA-256 of the release certificate> APK...
```

- The password is read from the environment, never from an option (options show in the process list). `OHM_KEY_PASSWORD` is the key's password if it differs from the keystore's.
- Each APK is aligned (`zipalign`), then signed (`apksigner`, schemes v2 and v3). Whatever signature it had is replaced.
- The signed APK's certificate must have the SHA-256 you give. If it does not, or it is the debug key, the script fails and writes nothing for that APK. Take the fingerprint from the key as you recorded it (`keytool -list -v`), not from the APK that was just signed.
- Nothing is overwritten: the signed files go to `signed/` next to each APK, or to `--out-dir`.
- There is no fallback to the debug key: a missing keystore, alias or fingerprint is an error.
- The keystore and its password are kept outside the repository, and never in a commit, a log or a reply. The key is the app's identity: an update is accepted only if it is signed by the same key, so a lost key means every user has to reinstall.

## Verifying in a container

```
scripts/verify/docker.sh [--entry web|android|both] [--version A.B.C] [--cpus N] [--memory SIZE] [--keep DIR]
```

It runs the scripts in a bare `debian:bookworm-slim` (no cache, none of the tools), checks that `--check` names what is missing, builds, and checks again. If they get through there, a CI runner needs nothing special. `--keep DIR` keeps the built files on the host.

## Not covered here

- Native changes (the app icon module, Firebase) need a full build; quick JavaScript-only deploys to a phone are done by tools outside this repository.
- `sign-android.sh` was tried with a throwaway key and the debug tools, not yet with the release key or on a CI runner.
