using Avalonia.Headless.XUnit;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Rooms;
using OhMatrix.Core.Ui.Shell;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Xunit;

namespace OhMatrix.Tests.Ui;

// Helpers on paths that run for every row, every message and every change of
// the store: what they give has to stay what it was.
public class UiWorkTests {
    [Fact]
    public void Relative_times_read_as_they_did_in_each_language()
    {
        var now = DateTimeOffset.FromUnixTimeMilliseconds(1_800_000_000_000);

        string At(string locale, long ago) => Format.Relative(
            now.ToUnixTimeMilliseconds() - ago - 5, now, locale);

        const long Min = 60_000;
        const long Hour = 3_600_000;
        const long Day = 86_400_000;
        Assert.Equal("1 minute ago", At("en", Min));
        Assert.Equal("5 minutes ago", At("en", 5 * Min));
        Assert.Equal("2 hours ago", At("en", 2 * Hour));
        Assert.Equal("3 days ago", At("en", 3 * Day));
        Assert.Equal("5分钟前", At("zh-CN", 5 * Min));
        Assert.Equal("2小时前", At("zh-CN", 2 * Hour));
        Assert.Equal("3天前", At("zh-CN", 3 * Day));
        Assert.Equal("hace 1 minuto", At("es", Min));
        Assert.Equal("hace 5 horas", At("es", 5 * Hour));
        Assert.Equal("il y a 2 heures", At("fr", 2 * Hour));
        Assert.Equal("il y a 2 jours", At("fr", 2 * Day));
        Assert.Equal("vor 1 Minute", At("de", Min));
        Assert.Equal("vor 5 Minuten", At("de", 5 * Min));
        // Russian: the form follows the number.
        Assert.Equal("1 минуту назад", At("ru", Min));
        Assert.Equal("2 минуты назад", At("ru", 2 * Min));
        Assert.Equal("5 минут назад", At("ru", 5 * Min));
        Assert.Equal("11 минут назад", At("ru", 11 * Min));
        Assert.Equal("21 минуту назад", At("ru", 21 * Min));
        Assert.Equal("22 минуты назад", At("ru", 22 * Min));
        Assert.Equal("1 час назад", At("ru", Hour));
        Assert.Equal("4 часа назад", At("ru", 4 * Hour));
        Assert.Equal("12 часов назад", At("ru", 12 * Hour));
        Assert.Equal("3 дня назад", At("ru", 3 * Day));
        Assert.Equal("5 дней назад", At("ru", 5 * Day));
    }

    [Fact]
    public void Sizes_read_as_they_did()
    {
        Assert.Equal("", Format.Bytes(0));
        Assert.Equal("", Format.Bytes(-1));
        Assert.Equal("1 B", Format.Bytes(1));
        Assert.Equal("1023 B", Format.Bytes(1023));
        Assert.Equal("1.0 KB", Format.Bytes(1024));
        Assert.Equal("1.5 KB", Format.Bytes(1536));
        Assert.Equal("10 KB", Format.Bytes(10240));
        Assert.Equal("3.4 MB", Format.Bytes(3_400_000 + 200_000));
        Assert.Equal("1.0 GB", Format.Bytes(1L << 30));
        Assert.Equal("1024 GB", Format.Bytes(1L << 40));
    }

    // What Initials did before: the elements of the text found for each name.
    private static string OldInitials(string name)
    {
        string First(string s)
        {
            var e = System.Globalization.StringInfo
                .GetTextElementEnumerator(s);
            return e.MoveNext() ? (string)e.Current : "";
        }

        var clean = name.TrimStart('@', '#', '!').Trim();
        var parts = clean.Split([' ', '.', '_', '-', '\t', '\n'],
            StringSplitOptions.RemoveEmptyEntries);
        string result;
        if (parts.Length > 1) {
            result = First(parts[0]) + First(parts[1]);
        } else {
            var e = System.Globalization.StringInfo
                .GetTextElementEnumerator(clean);
            result = "";
            for (var i = 0; i < 2 && e.MoveNext(); i++)
                result += (string)e.Current;
        }

        return result.Length == 0 ? "?" : result.ToUpperInvariant();
    }

    [Fact]
    public void Initials_are_those_of_the_text_elements_as_before()
    {
        string[] names = [
            "Alice", "alice bob", "ab cd", "@alice:server", "#room", "!x:y",
            "a", "", "  ", "Ann-Lee", "john.smith", "x_y", "李雷", "李 雷",
            "😀 smile", "😀😀😀", "éa", "aé", "ábc", "1234",
            "12 34", "ab.cd", "ab-", "-ab", "A\tB", "Zoë", "ÉCOLE", "a b c",
            "éé", "ab̀c", "ab́", "a1", "9z", "a\rb",
            "Abc Def Ghi",
        ];
        foreach (var name in names)
            Assert.Equal(OldInitials(name), Avatar.Initials(name));
        Assert.Equal("AL", Avatar.Initials("alice"));
        Assert.Equal("AC", Avatar.Initials("ab cd"));
        Assert.Equal("?", Avatar.Initials(""));
    }

    // What the preview did before: split on white space and join with one space.
    private static string OldBody(string text) => string.Join(" ",
        text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    [Fact]
    public void A_preview_collapses_white_space_as_before()
    {
        string[] texts = [
            "hello", "  hello   world  ", "a\tb\nc", "a\r\nb", "x y",
            "x y", "\n\n", "", " ", "a  b", "multi\n\nline  text",
            "tail ", "a​b", "　x　", "one two  three",
        ];
        foreach (var text in texts) {
            var room = new RoomSummary {
                Id = "!a",
                LastMessage = text,
                LastIsLine = true
            };
            Assert.Equal(OldBody(text),
                RoomListPane.PreviewOf(room, (k, _) => k));
            var direct = room with {
                LastIsLine = false,
                LastSender = "Ann",
                IsDirect = true
            };
            Assert.Equal(OldBody(text),
                RoomListPane.PreviewOf(direct, (k, _) => k));
            var group = direct with {
                IsDirect = false
            };
            Assert.Equal("Ann: " + OldBody(text),
                RoomListPane.PreviewOf(group, (k, _) => k));
        }
    }

    private sealed class Auth : IAuthEngine {
        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password) => Task.FromResult(
            new Session(homeserver, "@" + username, "D", "T"));

        public Task<Session> Register(string homeserver, string username,
            string password, string? token) =>
            LoginWithPassword(homeserver, username, password);

        public Task Restore(Session session) => Task.CompletedTask;
        public Task Logout() => Task.CompletedTask;
    }

    [AvaloniaFact]
    public async Task
        The_root_makes_its_brush_and_zoom_again_only_when_they_change()
    {
        var dir = Path.Combine(Path.GetTempPath(),
            "ohm-work-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var controller = new AppController(new Auth(),
            new FileSessionStore(dir), new FilePreferencesStore(dir));
        var dark = false;
        var root = new AppRoot(controller, "matrix.org", () => dark);
        await controller.Login("matrix.org", "alice", "pw");
        var brush = root.Background;
        var colors = ThemeScope.GetColors(root);

        // Many changes of the store that are not a theme or a zoom.
        for (var i = 0; i < 10; i++)
            controller.Store.Update(s => s with {
                Typing = [$"user {i}"]
            });
        Assert.Same(brush, root.Background);

        // Another theme is another brush with its colours.
        controller.SetPreferences(p => p with {
            Theme = "dark"
        });
        Assert.NotSame(brush, root.Background);
        Assert.NotEqual(colors, ThemeScope.GetColors(root));
        var darkBrush = root.Background;
        controller.Store.Update(s => s with {
            Typing = []
        });
        Assert.Same(darkBrush, root.Background);

        // The system's dark mode matters for the system theme.
        controller.SetPreferences(p => p with {
            Theme = Themes.System
        });
        var light = root.Background;
        var lightColors = ThemeScope.GetColors(root);
        dark = true;
        controller.Store.Update(s => s with {
            Typing = ["x"]
        });
        Assert.NotSame(light, root.Background);
        Assert.NotEqual(lightColors, ThemeScope.GetColors(root));
        await Task.CompletedTask;
    }

    [Fact]
    public async Task
        Clearing_the_session_removes_the_file_after_a_save_in_progress()
    {
        var dir = Path.Combine(Path.GetTempPath(),
            "ohm-store-" + Guid.NewGuid().ToString("N"));
        var store = new FileSessionStore(dir);
        // No file, no directory: there is nothing to remove.
        await Assert.ThrowsAnyAsync<IOException>(() => store.Clear());

        Directory.CreateDirectory(dir);
        await store.Clear();
        var session = new Session("matrix.org", "@a", "D", "T");
        await store.Save(session);
        var file = Path.Combine(dir, "session.json");
        Assert.True(File.Exists(file));
        Assert.NotNull(await store.Load());
        await store.Clear();
        Assert.False(File.Exists(file));
        Assert.Null(await store.Load());

        // A save and a clear asked for one after the other end in that order:
        // the file is not back after the clear.
        var save = store.Save(session);
        var clear = store.Clear();
        await Task.WhenAll(save, clear);
        Assert.False(File.Exists(file));
        Directory.Delete(dir, true);
    }
}
