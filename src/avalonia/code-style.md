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

## UI Folders

`OhMatrix.Core/Ui/` has no files of its own: every file is in a folder, and the namespace of a file is the namespace of its folder
(`OhMatrix.Core.Ui.Chat.Messages` for `Ui/Chat/Messages/`). A folder uses only the folders below it, so there are no cycles:

| Folder                                               | What is in it                                                        | May use                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `Appearance`                                         | colours (`ThemeScope`), fonts, radii, icons and the logo             | nothing                                           |
| `Support`                                            | what pages hang onto (`Lifetime`, `IOverlay`), error texts, times    | nothing                                           |
| `Animations`                                         | the switch, times and curves of motion, how a surface comes and goes | nothing                                           |
| `Widgets`                                            | buttons, fields, rows, text and skeleton parts that any page uses    | `Appearance`, `Animations`                        |
| `Overlays`                                           | dialogs, menus and notices over the window                           | `Widgets` and the above                           |
| `Media`                                              | pictures, viewers and the file picker                                | `Overlays` and the above                          |
| `Account`, `Rooms`, `Chat/Messages`, `Chat/Composer` | the parts of a feature                                               | `Media` and the above                             |
| `Chat`                                               | the open chat                                                        | the parts of a feature, `Rooms`                   |
| `Settings`                                           | the panes of the settings window                                     | `Chat/Messages` (the theme preview) and the above |
| `Shell`                                              | the root, the screens and the frame of the app                       | everything                                        |

A widget that knows a page is in the wrong place: it takes the page's numbers as parameters, or goes next to the page. The rule is kept by
`UiStructureTests`. Code outside `Ui/` uses it as little as it can (`AppController` holds the pictures and sets the fonts).

## Motion

What moves in answer to the person, or to a change of the screen, is made with `Ui/Animations`, so that the whole app moves in one way and
one setting can turn it off. The ring (`Spinner`) and the pulse of the skeletons are the exception: they are loops that say that something is
going on, and they go on when motion is off.

- A time is one of `Durations` and a curve is one of `Curves`: `Curves.Enter` for what comes and `Curves.Exit` for what goes. What goes takes
  one step less time than what comes, and nothing takes more than a third of a second.
- Every time goes through `Motion.Time`, which is nothing when `Motion.Enabled` is false: for people who want less motion, and for the tests,
  which look at where a change ends. `TestApp` turns motion off; a test of motion turns it on with `FrameClock`, which also steps the frames by
  hand.
- Only `Opacity` and render transforms are animated. A property that lays out again (size, margin, position) is not, because it lays out
  every control around it at every frame.
- A surface that comes and goes (a dialog, a menu, a viewer, the notice) uses a `Presence`. Closing it is closing it at once: `IsOpen` is false and
  a press goes through to what is under it while it fades; it is taken out of the tree when its exit is over. A surface that is shown again
  or thrown away does not wait for its exit (`Cancel`).

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

- A `using` nothing uses is an error (IDE0005): the build fails on it, `./format.sh` removes it, and `./format.sh --check` (the pre-commit
  check) lists the file. `Directory.Build.props` turns on what the analyzer needs to see it.
- A namespace is file-scoped (`namespace OhMatrix.Core;`). A namespace with braces is an error.
- An auto property may be written on one line (`{ get; init; }`) or over several; the formatter keeps either.
