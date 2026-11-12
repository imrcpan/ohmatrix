using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Chat.Messages;

/// <summary>
/// The sheet of paper a file shows as its kind (<c>FileTile</c>): a 36 by 44 page with a folded corner, coloured by the extension, and the
/// extension written on it.
/// </summary>
public sealed class FileTile : Grid {
    public FileTile(string name)
    {
        Width = 36;
        Height = 44;
        var dot = name.LastIndexOf('.');
        var ext = dot > 0 && dot < name.Length - 1
            ? name[(dot + 1)..].ToLowerInvariant()
            : "";
        Children.Add(new Avalonia.Controls.Shapes.Path {
            Data = Geometry.Parse(
                "M4 0h19l13 13v27a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z"),
            Fill = new SolidColorBrush(Colour(ext)),
        });
        Children.Add(new Avalonia.Controls.Shapes.Path {
            Data = Geometry.Parse("M23 0l13 13h-9a4 4 0 01-4-4z"),
            Fill = new SolidColorBrush(Color.FromArgb(107, 255, 255, 255)),
        });
        var label = ext.Length > 4 ? ext[..4] : ext;
        if (label.Length > 0) {
            Children.Add(new TextBlock {
                Text = label.ToUpperInvariant(),
                FontSize = label.Length > 3 ? 9 : 11,
                FontWeight = FontWeight.Bold,
                FontFamily = Fonts.System,
                Foreground = Brushes.White,
                TextAlignment = TextAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 6),
            });
        }
    }

    // The colours of the React Native app's file tiles, by extension.
    private static Color Colour(string ext)
    {
        return ext switch {
            "pdf" => Color.Parse("#E5483E"),
            "doc" or "docx" or "rtf" or "pages" or "odt" => Color.Parse(
                "#2F6FDE"),
            "xls" or "xlsx" or "csv" or "numbers" or "ods" => Color.Parse(
                "#1F9D57"),
            "ppt" or "pptx" or "key" or "odp" => Color.Parse("#E8762B"),
            "zip" or "rar" or "7z" or "tar" or "gz" or "tgz" or "bz2" or "xz"
                => Color.Parse("#E0A21C"),
            "mp3" or "m4a" or "aac" or "ogg" or "opus" or "wav" or "flac"
                => Color.Parse("#8A63D2"),
            "mp4" or "mov" or "mkv" or "avi" or "webm" =>
                Color.Parse("#D6477F"),
            "apk" or "ipa" or "exe" or "dmg" or "msi" or "deb" or "rpm"
                => Color.Parse("#3FA34D"),
            _ => Color.Parse("#8E8E93"),
        };
    }
}
