# OhMatrix Avalonia

Native desktop and mobile client using Avalonia UI and the Rust SDK.

## Structure

- `OhMatrix.Desktop/` — Desktop entry point
- `OhMatrix.Core/` — Shared core library
- Additional platform projects will be added as needed

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
