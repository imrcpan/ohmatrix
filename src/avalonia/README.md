# OhMatrix Avalonia

Native desktop and mobile client using Avalonia UI and the Rust SDK.

## Structure

- `src/` — Shared libraries (Core, UI components)
- `platform/` — Platform-specific implementations (Windows, Linux, macOS, Android, iOS)
- `heads/` — Entry point projects (Desktop, Mobile)
- `tests/` — Test projects

## Build

```bash
# Desktop (current platform)
dotnet build heads/OhMatrix.Desktop

# Run
dotnet run --project heads/OhMatrix.Desktop
```

## Code Style

See [code-style.md](code-style.md) for AOT and C#-only UI requirements.

## Dependencies

- Avalonia 12.1.5
- .NET 9.0
- Rust SDK (via uniffi, to be integrated)
