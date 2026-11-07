using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The picture of a person or a room (<c>Avatar</c>): a circle for chats and people, a rounded square for spaces, with the picture when there is
/// one and otherwise the initials on a colour that comes from the id.
/// </summary>
public sealed class Avatar : Border {
    private static readonly Color[] PeerColors = [
        Color.Parse("#E17076"), Color.Parse("#E5A346"), Color.Parse("#A695E7"),
        Color.Parse("#7BC862"), Color.Parse("#6EC9CB"), Color.Parse("#65AADD"),
        Color.Parse("#EE7AAE"),
    ];

    private readonly TextBlock initials = new() {
        Foreground = Brushes.White,
        FontFamily = Fonts.System,
        FontWeight = FontWeight.SemiBold,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Image picture = new() {
        Stretch = Stretch.UniformToFill
    };

    public Avatar(string id, string name, double size = 52, bool square = false)
    {
        Width = size;
        Height = size;
        CornerRadius =
            new CornerRadius(square ? Math.Round(size * 0.28) : size / 2);
        ClipToBounds = true;
        Background = new SolidColorBrush(PeerColor(id));
        initials.FontSize = size * 0.38;
        initials.Text = Initials(name);
        Child = initials;
        Avalonia.Automation.AutomationProperties.SetName(this, name);
    }

    /// <summary>The picture to show instead of the initials; null shows the initials.</summary>
    public Avalonia.Media.IImage? Source {
        set {
            picture.Source = value;
            Child = value is null ? initials : picture;
        }
    }

    public static Color PeerColor(string id)
    {
        uint h = 0;
        foreach (var c in id)
            h = unchecked(h * 31 + c);
        return PeerColors[h % PeerColors.Length];
    }

    public static string Initials(string name)
    {
        var clean = name.TrimStart('@', '#', '!').Trim();
        var parts = clean.Split([' ', '.', '_', '-', '\t', '\n'],
            StringSplitOptions.RemoveEmptyEntries);
        string result;
        if (parts.Length > 1) {
            result = FirstChar(parts[0]) + FirstChar(parts[1]);
        } else {
            var e =
                System.Globalization.StringInfo.GetTextElementEnumerator(clean);
            result = "";
            for (var i = 0; i < 2 && e.MoveNext(); i++)
                result += (string)e.Current;
        }

        return result.Length == 0 ? "?" : result.ToUpperInvariant();
    }

    private static string FirstChar(string s)
    {
        var e = System.Globalization.StringInfo.GetTextElementEnumerator(s);
        return e.MoveNext() ? (string)e.Current : "";
    }
}
