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
