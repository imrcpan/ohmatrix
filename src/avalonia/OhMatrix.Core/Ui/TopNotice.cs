using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// A short message in a pill at the top of the screen (<c>TopNotice</c>): the surface of the theme with an outline and a mark: a check for good
/// news, a cross for an error, a turning ring while something is going on. It shows what <see cref="AppState.Notice"/> holds.
/// </summary>
public sealed class TopNotice : Border {
    private readonly AppController controller;

    public TopNotice(AppController controller)
    {
        this.controller = controller;
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Top;
        Margin = new Thickness(0, 12, 0, 0);
        MaxWidth = 560;
        CornerRadius = new CornerRadius(24);
        BorderThickness = new Thickness(1);
        Padding = new Thickness(12, 10, 18, 10);
        IsHitTestVisible = false;
        BoxShadow = new BoxShadows(new BoxShadow {
            OffsetY = 4,
            Blur = 12,
            Color = Color.FromArgb(90, 0, 0, 0)
        });
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<TopNotice>((n, _) =>
            n.Apply());
        Apply();
    }

    /// <summary>The text shown, or null when no message is on.</summary>
    public string? Text => IsVisible ? text : null;

    private string? text;

    private void Apply()
    {
        var notice = controller.Store.Value.Notice;
        IsVisible = notice is not null;
        if (notice is null)
            return;
        var c = ThemeScope.GetColors(this);
        text = notice.Message;
        Background = new SolidColorBrush(c.Bg);
        BorderBrush = new SolidColorBrush(Color.FromArgb(128, 128, 128, 128));
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
        if (notice.Kind == NoticeKind.Progress) {
            row.Children.Add(new Spinner {
                Size = 20,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(2),
            });
        } else {
            var error = notice.Kind == NoticeKind.Error;
            row.Children.Add(new Border {
                Width = 24,
                Height = 24,
                CornerRadius = new CornerRadius(12),
                Background = new SolidColorBrush(error
                    ? Color.FromRgb(0xFF, 0x3B, 0x30)
                    : Color.FromRgb(0x34, 0xC7, 0x59)),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new Icon {
                    Glyph = error ? "close" : "check",
                    Size = 16,
                    Color = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
        }

        row.Children.Add(new TextBlock {
            Text = notice.Message,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 3,
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        });
        Child = row;
        Avalonia.Automation.AutomationProperties.SetName(this, notice.Message);
    }
}
