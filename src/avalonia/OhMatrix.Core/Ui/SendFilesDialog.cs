using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>Asks before anything dropped on a chat is uploaded, listing what would be sent (<c>SendFilesDialog</c>): up to five files with their kind and size, and how many more.</summary>
public sealed class SendFilesDialog : IOverlay {
    public const int MaxRows = 5;

    private readonly AppController controller;
    private readonly Dialog dialog = new();

    public SendFilesDialog(AppController controller)
    {
        this.controller = controller;
    }

    public Dialog Dialog => dialog;
    public PrimaryButton? SendButton { get; private set; }


    /// <summary>The kind of a file by its type, as the list words it.</summary>
    public static string KindOf(string path)
    {
        var mime = MimeTypes.For(path);
        return mime.StartsWith("image/", StringComparison.Ordinal)
            ? "photo"
            : mime.StartsWith("video/", StringComparison.Ordinal)
                ? "video"
                : mime.StartsWith("audio/", StringComparison.Ordinal)
                    ? "send.files.audio"
                    : "send.files.file";
    }

    public void Show(TopLevel window, IReadOnlyList<string> paths, Action send)
    {
        if (paths.Count == 0)
            return;
        var c = ThemeScope.GetColors(window);
        var sizes = paths
            .Select(p => File.Exists(p) ? new FileInfo(p).Length : 0).ToList();
        var list = new StackPanel {
            Spacing = 8
        };
        for (var i = 0; i < Math.Min(MaxRows, paths.Count); i++) {
            var kind = KindOf(paths[i]);
            var row = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*"),
                Margin = new Thickness(0)
            };
            row.Children.Add(new Border {
                Width = 44,
                Height = 44,
                CornerRadius = new CornerRadius(8),
                Background = new SolidColorBrush(c.Accent),
                Margin = new Thickness(0, 0, 12, 0),
                Child = new Icon {
                    Glyph = kind == "video" ? "video" :
                        kind == "send.files.audio" ? "mic" :
                        kind == "photo" ? "image" : "file",
                    Size = 22,
                    Color = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
            var text = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center
            };
            text.Children.Add(new TextBlock {
                Text = Path.GetFileName(paths[i]),
                FontSize = 15,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
            text.Children.Add(new TextBlock {
                Text = $"{controller.T(kind)} · {Format.Bytes(sizes[i])}",
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
            });
            Grid.SetColumn(text, 1);
            row.Children.Add(text);
            list.Children.Add(row);
        }

        if (paths.Count > MaxRows)
            list.Children.Add(new TextBlock {
                Text = controller.T("send.files.more",
                    ("n", paths.Count - MaxRows)),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
            });
        var yes = new PrimaryButton {
            Title = controller.T("send.files.send")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        SendButton = yes;
        yes.Click += (_, _) => {
            dialog.Close();
            send();
        };
        no.Click += (_, _) => dialog.Close();
        dialog.Show(window, c,
            paths.Count == 1
                ? controller.T("send.files.one")
                : controller.T("send.files.title", ("n", paths.Count)),
            paths.Count > 1
                ? controller.T("send.files.total",
                    ("size", Format.Bytes(sizes.Sum())))
                : null,
            list, yes, no);
    }

    public void Close()
    {
        dialog.Close();
    }

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        Close();
        dialog.Retire();
    }
}
