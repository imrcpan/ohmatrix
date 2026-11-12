using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// The folders of <c>OhMatrix.Core/Ui</c> (see code-style.md): the namespace of a file is the one of its folder, no file stands outside a folder,
/// and a folder uses only the folders below it, so the folders have no cycles and a part that knows a page cannot grow among the widgets.
/// </summary>
public class UiStructureTests {
    private const string Prefix = "OhMatrix.Core.Ui.";

    // The folders each folder may use, besides itself and the folders it is in.
    private static readonly Dictionary<string, string[]> Allowed = new() {
        ["Appearance"] = [],
        ["Support"] = [],
        ["Widgets"] = ["Appearance"],
        ["Overlays"] = ["Appearance", "Support", "Widgets"],
        ["Media"] = ["Appearance", "Support", "Widgets", "Overlays"],
        ["Account"] = ["Appearance", "Support", "Widgets", "Overlays", "Media"],
        ["Rooms"] = ["Appearance", "Support", "Widgets", "Overlays", "Media"],
        ["Chat.Messages"] = [
            "Appearance", "Support", "Widgets", "Overlays", "Media"
        ],
        ["Chat.Composer"] = [
            "Appearance", "Support", "Widgets", "Overlays", "Media"
        ],
        ["Chat"] = [
            "Appearance", "Support", "Widgets", "Overlays", "Media", "Rooms",
            "Chat.Messages", "Chat.Composer"
        ],
        ["Settings"] = [
            "Appearance", "Support", "Widgets", "Overlays", "Media",
            "Chat.Messages"
        ],
        ["Shell"] = [
            "Appearance", "Support", "Widgets", "Overlays", "Media", "Account",
            "Rooms", "Chat", "Chat.Messages", "Chat.Composer", "Settings"
        ],
    };

    // What the rest of the app uses of the Ui: the folder of the code and
    // what it may use of it.
    private static readonly Dictionary<string, string[]> Outside = new() {
        ["State"] = ["Appearance", "Media"],
        ["."] = ["Appearance", "Widgets"],
    };

    private static string Core([CallerFilePath] string here = "")
    {
        var path = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!,
            "..", "..", "OhMatrix.Core"));
        if (!Directory.Exists(path))
            Assert.Skip("The sources are not where they were built.");
        return path;
    }

    private static IEnumerable<string> Sources(string folder)
    {
        return Directory.EnumerateFiles(folder, "*.cs",
                SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" +
                                    Path.DirectorySeparatorChar) &&
                        !f.Contains(Path.DirectorySeparatorChar + "bin" +
                                    Path.DirectorySeparatorChar));
    }

    // The folders a text names: `Ui.Chat.Messages.X`, `OhMatrix.Core.Ui.Rooms`
    // and the like (a using, an alias or a name that is written out).
    private static readonly Regex Named = new(
        @"(?<![\w.])(?:OhMatrix\.Core\.)?Ui\.(Chat\.Messages|Chat\.Composer|[A-Z]\w*)");

    private static IEnumerable<string> Folders(string text)
    {
        return Named.Matches(text).Select(m => m.Groups[1].Value).Distinct();
    }

    [Fact]
    public void Every_file_is_in_a_folder_and_has_the_namespace_of_it()
    {
        var ui = Path.Combine(Core(), "Ui");
        Assert.Empty(Directory.GetFiles(ui, "*.cs"));
        var wrong = new List<string>();
        foreach (var file in Sources(ui)) {
            var folder = Path.GetRelativePath(ui,
                    Path.GetDirectoryName(file)!)
                .Replace(Path.DirectorySeparatorChar, '.');
            var text = File.ReadAllText(file);
            var expected = $"namespace {Prefix}{folder};";
            if (!text.Contains("\n" + expected + "\n") &&
                !text.StartsWith(expected))
                wrong.Add(
                    $"{Path.GetRelativePath(ui, file)} is not in {expected}");
        }

        Assert.True(wrong.Count == 0, string.Join("\n", wrong));
    }

    [Fact]
    public void The_folders_are_the_ones_that_are_known()
    {
        var ui = Path.Combine(Core(), "Ui");
        var found = Directory.EnumerateDirectories(ui, "*",
                SearchOption.AllDirectories)
            .Select(d => Path.GetRelativePath(ui, d)
                .Replace(Path.DirectorySeparatorChar, '.'))
            .Where(d => Sources(Path.Combine(ui,
                            d.Replace('.', Path.DirectorySeparatorChar))).Any()
                        && Directory.GetFiles(Path.Combine(ui,
                                d.Replace('.', Path.DirectorySeparatorChar)),
                            "*.cs").Length > 0)
            .Order().ToList();
        Assert.Equal(Allowed.Keys.Order(), found);
    }

    [Fact]
    public void A_folder_uses_only_the_folders_below_it()
    {
        var ui = Path.Combine(Core(), "Ui");
        var wrong = new List<string>();
        foreach (var file in Sources(ui)) {
            var folder = Path.GetRelativePath(ui,
                    Path.GetDirectoryName(file)!)
                .Replace(Path.DirectorySeparatorChar, '.');
            var may = Allowed[folder];
            foreach (var used in Folders(File.ReadAllText(file))) {
                if (used == folder || folder.StartsWith(used + ".") ||
                    may.Contains(used))
                    continue;
                wrong.Add($"{Path.GetRelativePath(ui, file)} uses {used}");
            }
        }

        Assert.True(wrong.Count == 0, string.Join("\n", wrong));
    }

    [Fact]
    public void The_rest_of_the_app_uses_the_ui_as_little_as_it_does_now()
    {
        var core = Core();
        var wrong = new List<string>();
        foreach (var file in Sources(core)) {
            var relative = Path.GetRelativePath(core, file)
                .Replace(Path.DirectorySeparatorChar, '/');
            if (relative.StartsWith("Ui/"))
                continue;
            var part = relative.Contains('/') ? relative.Split('/')[0] : ".";
            var may = Outside.GetValueOrDefault(part) ?? [];
            foreach (var used in Folders(File.ReadAllText(file))) {
                if (!may.Contains(used))
                    wrong.Add($"{relative} uses Ui.{used}");
            }
        }

        Assert.True(wrong.Count == 0, string.Join("\n", wrong));
    }
}
