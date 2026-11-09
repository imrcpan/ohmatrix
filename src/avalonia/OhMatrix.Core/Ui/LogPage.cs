using Avalonia;
using Avalonia.Controls;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>The app's log (<c>LogPage</c>): the last lines in a monospaced font, the newest at the bottom, with buttons to copy and to empty it.</summary>
public sealed class LogPage : Grid {
    private readonly AppController controller;
    private readonly StackPanel lines = new();
    private readonly ScrollViewer scroller = new();
    private readonly TextBlock empty = new();
    private readonly TextButton copy = new();
    private readonly TextButton clear = new();
    private bool copied;
    private bool refreshQueued;

    // The page is not built while it is not on the screen (it is not, most
    // of the time): stale says it has to catch up when it is shown. The lines it shows
    // are kept, so a new line adds one control instead of making 2000.
    private bool stale;
    private readonly List<LogLine> shown = [];
    private ColorTokens? shownColors;

    private readonly Border bar = new() {
        Height = 56,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static LogPage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<LogPage>((p, _) =>
            p.Apply());
    }

    public LogPage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        Children.Add(bar);
        var buttons = new StackPanel {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 12,
        };
        buttons.Children.Add(copy);
        buttons.Children.Add(clear);
        Grid.SetRow(buttons, 1);
        Children.Add(buttons);
        var body = new StackPanel();
        body.Children.Add(empty);
        body.Children.Add(lines);
        scroller.Content = body;
        scroller.HorizontalScrollBarVisibility =
            Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);
        copy.Click += async (_, _) => {
            if (TopLevel.GetTopLevel(this)?.Clipboard is not { } clipboard)
                return;
            await clipboard.SetTextAsync(AppLog.Text(AppLog.Snapshot()));
            copied = true;
            Apply();
        };
        clear.Click += (_, _) => AppLog.Clear();
        // The page follows the log, but not line by line: a burst of lines is one refresh.
        AppLog.Changed += () => {
            if (refreshQueued)
                return;
            refreshQueued = true;
            Dispatcher.UIThread.Post(() => {
                refreshQueued = false;
                Apply();
            }, DispatcherPriority.Background);
        };
        controller.Store.Changed += _ => Apply();
        Apply();
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        if (stale)
            Apply();
    }

    public int LineCount => lines.Children.Count;

    public TextButton CopyButton => copy;
    public TextButton ClearButton => clear;

    private string T(string key)
    {
        return Strings.T(controller.Store.Value.Locale, key);
    }

    private void Apply()
    {
        if (!this.IsAttachedToVisualTree()) {
            stale = true;
            return;
        }

        stale = false;
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        PageBar.Fill(bar, c, T("logs"), T("advanced.options"),
            () => controller.OpenSidebarPage(SidebarPage.Advanced));
        copy.Title = copied ? T("copied") : T("copy");
        clear.Title = T("logs.clear");
        ThemeScope.SetColors(copy, c);
        ThemeScope.SetColors(clear, c);
        var all = AppLog.Snapshot();
        empty.Text = T("logs.empty");
        empty.IsVisible = all.Count == 0;
        empty.Foreground = new SolidColorBrush(c.TextSecondary);
        empty.FontFamily = Fonts.System;
        empty.TextAlignment = TextAlignment.Center;
        empty.Margin = new Thickness(0, 24);
        var grew = SyncLines(all, c);
        if (grew && all.Count > 0)
            Dispatcher.UIThread.Post(() => scroller.ScrollToEnd(),
                DispatcherPriority.Background);
    }

    // Makes the controls the lines of the log. The log only loses its
    // oldest lines and gets new ones at the end, so when the lines that are
    // shown still lead to the new log, the old ones are taken off the start
    // and the new ones put at the end. In any other case (another theme, the
    // log emptied) all are made again. True when a line was added.
    private bool SyncLines(IReadOnlyList<LogLine> all, ColorTokens c)
    {
        var dropped = ReferenceEquals(shownColors, c)
            ? Dropped(all)
            : -1;
        if (dropped < 0) {
            lines.Children.Clear();
            shown.Clear();
        } else {
            lines.Children.RemoveRange(0, dropped);
            shown.RemoveRange(0, dropped);
        }

        shownColors = c;
        var before = shown.Count;
        for (var i = before; i < all.Count; i++) {
            lines.Children.Add(Row(all[i], c));
            shown.Add(all[i]);
        }

        return all.Count > before;
    }

    // How many of the lines shown have left the start of the log, or -1
    // when the shown ones are not the start of it any more.
    private int Dropped(IReadOnlyList<LogLine> all)
    {
        if (shown.Count == 0)
            return 0;
        if (all.Count == 0)
            return -1;
        var dropped = shown.FindIndex(l => ReferenceEquals(l, all[0]));
        if (dropped < 0)
            return -1;
        var left = shown.Count - dropped;
        return left <= all.Count &&
               ReferenceEquals(shown[^1], all[left - 1])
            ? dropped
            : -1;
    }

    private static SelectableTextBlock Row(LogLine line, ColorTokens c)
    {
        var color = line.Level switch {
            LogLevel.Error => c.Danger,
            LogLevel.Warn => Color.FromRgb(0xE0, 0xA1, 0x00),
            _ => c.Text,
        };
        return new SelectableTextBlock {
            Text = $"{line.Time:HH:mm:ss.fff} {line.Text}",
            FontFamily = new FontFamily("monospace"),
            FontSize = 12,
            LineHeight = 17,
            Foreground = new SolidColorBrush(color),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(14, 2),
        };
    }
}
