# Code Style

## AOT Compliance

This project is fully AOT-compiled. The following are strictly prohibited:

- Any method that bypasses AOT compilation
- Runtime reflection of any kind
- Namespace-based reflection symbol preservation directives
- Dynamic code generation at runtime

All code must be statically analyzable and AOT-compatible.

## UI Construction

This project does not use AXAML. All UI is created entirely in C# code.

- No `.axaml` files
- All controls, layouts, styles, and templates defined in C#
- Declarative UI through C# fluent APIs or object initializers
