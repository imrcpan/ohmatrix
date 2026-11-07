# OhMatrix Avalonia

Native desktop and mobile client using Avalonia UI and the Rust SDK.

## Structure

- `OhMatrix.Desktop/` — Desktop entry point
- `OhMatrix.Core/` — Shared core library
- `OhMatrix.MatrixSdk/` — FFI to the Rust Matrix SDK (`src/rust`), nothing else
- Additional platform projects will be added as needed

The chat list retains rows by room ID and updates their existing controls when
visible data changes. Reordering and filtering preserve surviving rows and
loaded avatars; rows are discarded when their rooms leave the state. Unrelated
state changes skip the list, and the joining timer updates only waiting rows.

## Build

```bash
# Desktop (current platform)
dotnet build OhMatrix.Desktop

# Run
dotnet run --project OhMatrix.Desktop
```

## Code Style

See [code-style.md](code-style.md) for AOT, C#-only UI, and .csproj requirements.

## Dependencies

- Avalonia 12.1.5
- .NET 11.0
- Rust SDK (via uniffi, to be integrated)

### System libraries

Media is not bundled: the app uses the libraries of the system, found at run time, and each feature is off where its library is missing.

- Playing audio and video messages in the app: VLC (`libvlc`). Without it the files open with the program of the system.
- Calls: GStreamer 1.20 or newer with the `webrtcbin` element, plus the plugins for libnice, Opus and VP8 (on Fedora: `gstreamer1-plugins-bad-free`, `libnice-gstreamer1`, `gstreamer1-plugins-good`, `opus`). Without them the call entries are not offered.
