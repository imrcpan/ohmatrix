using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>
/// A short message in a pill at the top of the screen (<c>TopNotice</c>): the surface of the theme with an outline and a mark: a check for good
/// news, a cross for an error, a turning ring while something is going on. It shows what <see cref="AppState.Notice"/> holds.
/// </summary>
public sealed class TopNotice : Border {
    private readonly AppController controller;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static TopNotice()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<TopNotice>((n, _) =>
            n.Apply());
    }

    // The pill comes down from above the edge of the window, with a small
    // bounce, and goes up again.
    private readonly Presence presence;

    public TopNotice(AppController controller)
    {
        this.controller = controller;
        presence = Presences.Banner(this);
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Top;
        Margin = new Thickness(0, 12, 0, 0);
        CornerRadius = new CornerRadius(24);
        BorderThickness = new Thickness(1);
        Padding = new Thickness(12, 10, 18, 10);
        IsHitTestVisible = false;
        BoxShadow = new BoxShadows(new BoxShadow {
            OffsetY = 4,
            Blur = 12,
            Color = Color.FromArgb(90, 0, 0, 0)
        });
        Lifetime.Watch(this, controller, state => {
            if (!ReferenceEquals(state.Notice, shownNotice))
                Apply();
        });
        Apply();
    }

    // At most 92% of the width, as in the app of React Native.
    protected override Size MeasureOverride(Size availableSize)
    {
        return base.MeasureOverride(
            new Size(availableSize.Width * 0.92, availableSize.Height));
    }

    /// <summary>The text shown, or null when no message is on (a message that is fading away is not on).</summary>
    public string? Text => IsVisible && !presence.Leaving ? text : null;

    private string? text;

    // What is shown is kept and changed in place: a turning ring that was
    // made again would start from the top, and the store changes for many
    // reasons that are not a notice.
    private Notice? shownNotice;
    private Control? mark;

    private readonly StackPanel row = new() {
        Orientation = Orientation.Horizontal,
        Spacing = 8
    };

    private readonly TextBlock label = new() {
        FontSize = 16,
        FontWeight = Fonts.Bold,
        TextWrapping = TextWrapping.Wrap,
        MaxLines = 3,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private void Apply()
    {
        var notice = controller.Store.Value.Notice;
        var before = shownNotice;
        shownNotice = notice;
        if (notice == null) {
            // It goes with a motion when it was shown, and is just not
            // there when it was not (one that is going already is left to
            // go: the theme can change while it does).
            if (before != null)
                presence.Leave(() => IsVisible = false);
            else if (!presence.Leaving)
                IsVisible = false;
            return;
        }

        // A message that comes in the place of another is changed in place;
        // one that comes when there was none, or while one is going, comes in.
        var enters = before == null || presence.Leaving;
        IsVisible = true;
        var c = ThemeScope.GetColors(this);
        text = notice.Message;
        Background = new SolidColorBrush(c.Bg);
        BorderBrush = new SolidColorBrush(Color.FromArgb(128, 128, 128, 128));
        SetMark(notice.Kind);
        label.Text = notice.Message;
        label.Foreground = new SolidColorBrush(c.Text);
        if (row.Children.Count == 1)
            row.Children.Add(label);
        if (!ReferenceEquals(Child, row))
            Child = row;
        Avalonia.Automation.AutomationProperties.SetName(this, notice.Message);
        if (enters)
            presence.Enter();
    }

    // The ring while something goes on, a check or a cross otherwise; the
    // ring that is turning stays when the next message is another one of
    // the same kind.
    private void SetMark(NoticeKind kind)
    {
        if (kind == NoticeKind.Progress) {
            if (mark is Spinner)
                return;
            Place(new Spinner {
                Size = 20,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(2),
            });
            return;
        }

        var error = kind == NoticeKind.Error;
        if (mark is not Border { Child: Icon } badge) {
            badge = new Border {
                Width = 24,
                Height = 24,
                CornerRadius = new CornerRadius(12),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new Icon {
                    Size = 16,
                    StrokeWidth = 3,
                    Color = Brushes.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            Place(badge);
        }

        badge.Background = new SolidColorBrush(error
            ? Color.FromRgb(0xFF, 0x3B, 0x30)
            : Color.FromRgb(0x34, 0xC7, 0x59));
        ((Icon)badge.Child!).Glyph = error ? "close" : "check";
    }

    private void Place(Control next)
    {
        if (row.Children.Count == 0)
            row.Children.Add(next);
        else if (mark != null)
            row.Children[0] = next;
        else
            row.Children.Insert(0, next);
        mark = next;
    }
}
