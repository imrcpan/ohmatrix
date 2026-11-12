# OhMatrix Avalonia

Native desktop and mobile client using Avalonia UI and the Rust SDK.

## Structure

- `OhMatrix.Desktop/` — Desktop entry point
- `OhMatrix.Core/` — Shared core library: the state, the model and all of the UI
- `OhMatrix.Engine/` — The engines of the app (sign-in, rooms, chat, media, profile, security, verification, calls, stickers) over the Rust SDK
- `OhMatrix.Infra/` — Logging
- `OhMatrix.MatrixSdk/` — FFI to the Rust Matrix SDK (`src/rust`), nothing else
- `OhMatrix.Tests/` — Tests (xUnit, headless Avalonia for the UI)
- `tools/` — Generators, such as `gen-icons.mjs` for the icons
- Additional platform projects will be added as needed

`OhMatrix.Core/` has a folder for each kind of code:

- `State/` — The state of the app, the store, `AppController` and the interfaces of the engines
- `Model/` — The data the app works with (rooms, timeline items, preferences, …)
- `Engine/` — The engines that talk HTTP to the homeserver, and what they need (the address, registration, the mapping of errors)
- `Calls/`, `Audio/` — Calls (signalling, transport, sounds, GStreamer) and playing and recording audio and video (`libvlc`)
- `I18n/`, `Storage/`, `Theming/` — The texts, the files of the session and the preferences, the colours and the themes
- `Ui/` — The views, in the folders below

The views in `OhMatrix.Core/Ui/` are in folders, and a folder uses only the folders before it in this list (the rule is in [code-style.md](code-style.md#ui-folders) and is kept by `UiStructureTests`):

- `Appearance/` — Colours (`ThemeScope`), fonts, radii, icons and the logo
- `Support/` — What pages hang onto (`Lifetime`, `IOverlay`), error texts, times
- `Widgets/` — Buttons, fields, rows, bars and skeleton parts that any page uses
- `Overlays/` — Dialogs, menus and notices over the window
- `Media/` — Pictures, viewers and the file picker
- `Account/`, `Rooms/`, `Chat/Messages/`, `Chat/Composer/` — The parts of a feature: the pages of the account; the chat list, rooms and spaces; one message and what helps to write one
- `Chat/` — The open chat
- `Settings/` — The panes of the settings window
- `Shell/` — The root, the screens and the frame of the app

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
