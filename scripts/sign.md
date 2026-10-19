# Android signing

Release APKs are signed after the build, with a key kept outside the repository. A key is the app's identity: an update is accepted only if it has the same signature, so **a lost key means every user reinstalls**.

## 1. Make the key (once)

```
keytool -genkeypair -v -keystore ohmatrix-release.jks -alias ohmatrix \
  -keyalg RSA -keysize 4096 -validity 36500
```

- Name (CN): `OhMatrix`; organisation: `OhMatrix`; leave the rest empty. It goes into every APK, so no personal details.
- Password: 24+ random letters and digits from a password manager. One password for the keystore and the key.
- Back up the `.jks` in two offline places, and the password somewhere else. Never put either in the repository, a commit or a log.

## 2. Record the fingerprints

```
keytool -list -v -keystore ohmatrix-release.jks -alias ohmatrix
```

- **SHA-256**: keep it, and publish it with each release; it is how anyone checks an APK.
- **SHA-1**: add it to the Firebase API key's Android restriction (package `org.ohmatrix.app`).

## 3. Build, then sign

```
scripts/build-android.sh --version 1.2.3

read -rs OHM_KEYSTORE_PASSWORD && export OHM_KEYSTORE_PASSWORD
scripts/sign-android.sh \
  --keystore ~/keys/ohmatrix-release.jks --key-alias ohmatrix \
  --expect-sha256 <the SHA-256 from step 2> \
  ~/release/android/OhMatrix_android_1.2.3_*.apk
```

The signed files are written to `~/release/android/signed/`. The script fails, and writes nothing, if the certificate is not the one you gave or is the debug key.

## 4. Check a published APK

```
apksigner verify --print-certs OhMatrix_android_1.2.3_arm64-v8a.apk
```

`Signer #1 certificate SHA-256 digest` must equal the recorded fingerprint.

## Notes

- The first release-signed install on a phone that has a debug-signed build needs an uninstall first (the app's data goes with it).
- Using GitHub Actions: keep the keystore (base64) and passwords in secrets of a protected environment, restore the file at signing time, sign only on version tags, delete it afterwards. The build step never needs the key.
- Not in the repository: the keystore, its password, and `google-services.json`.
