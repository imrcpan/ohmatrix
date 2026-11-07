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

## Project File Structure

All `.csproj` files must explicitly include the following properties in the first `<PropertyGroup>`, in this exact order:

```xml
<Project Sdk="Microsoft.NET.Sdk">

    <PropertyGroup>
        <RootNamespace></RootNamespace>
        <TargetFramework></TargetFramework>
        <LangVersion></LangVersion>
        <OutputType></OutputType>
        <Nullable></Nullable>
        <IsAotCompatible></IsAotCompatible>
        <EnableTrimAnalyzer>true</EnableTrimAnalyzer>
        <!-- other properties below -->
    </PropertyGroup>

    <!-- other elements -->

</Project>
```

Additional properties may follow after `EnableTrimAnalyzer`.

`PublishAot` is set only for the `Release` configuration (`<PropertyGroup Condition="'$(Configuration)' == 'Release'">`). Debug builds and runs
use the JIT, so that development stays fast. Code still has to be AOT-compatible: `IsAotCompatible` and `EnableTrimAnalyzer` report any
violation in every configuration.

## Formatting

Formatting is enforced by tools, not by review. `./format.sh` rewrites the files and `./format.sh --check` fails (exit 1) when
any `.cs` file is not formatted. The rules are in `.editorconfig`.

- Indent is 4 spaces. A line is at most 80 characters.
- A method's opening brace (constructors and local functions too) is on its own line. The opening brace of everything else is at the end of the
  line: `class`, `struct`, `record`, `interface`, `enum`, `if`, `else`, `for`, `while`, `try`, `catch`, `lambda`, initializers.
- `else`, `catch` and `finally` follow the closing brace on the same line (`} else {`).
- The body of `if`, `for`, `while` and the like is always on its own line. `if (x) return;` is not allowed:

```csharp
if (x)
    return;
```

- A lambda with braces is always broken over lines, however short. A lambda that is an expression may stay on one line:

```csharp
Action a = () => {
    Run();
};
Func<int> f = () => 3;
```

- A namespace is file-scoped (`namespace OhMatrix.Core;`). A namespace with braces is an error.
- An auto property may be written on one line (`{ get; init; }`) or over several; the formatter keeps either.
