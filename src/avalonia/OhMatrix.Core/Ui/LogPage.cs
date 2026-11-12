using Avalonia;
using Avalonia.Controls;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The app's log (<c>LogPage</c>): a toolbar like the one of a text viewer, with Back at its left and Copy and Clear at its right; under it the
/// last lines in a monospaced font, the newest at the bottom.
/// </summary>
public sealed class LogPage : Grid {
    private readonly AppController controller;
    private static readonly Logger logger = Logger.GetDefault();
    private readonly StackPanel lines = new();
    private readonly ScrollViewer scroller = new();
    private readonly TextBlock empty = new();
    private readonly ToolButton copy;
    private readonly ToolButton clear;
    private readonly IconButton back;
    private readonly TextBlock heading = new();
    private readonly Border toolbar = new();
    private bool copied;
    private bool refreshQueued;

    // The page is not built while it is not on the screen (it is not, most
    // of the time): stale says it has to catch up when it is shown. The lines it shows
    // are kept, so a new line adds one control instead of making 2000.
    private bool stale;
    private readonly List<LogLine> shown = [];
    private ColorTokens? shownColors;

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
        copy = new ToolButton("copy");
        clear = new ToolButton("trash") {
            Danger = true
        };
        back = new IconButton("back", "", 22, 36);
        back.Click += (_, _) =>
            controller.OpenSidebarPage(SidebarPage.Advanced);
        // The toolbar: Back at the left, the name of the log beside it, and
        // the two things to do with the log at the right.
        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto"),
            Margin = new Thickness(8, 0),
        };
        bar.Children.Add(back);
        heading.FontSize = 15;
        heading.FontWeight = FontWeight.SemiBold;
        heading.FontFamily = Fonts.System;
        heading.VerticalAlignment = VerticalAlignment.Center;
        heading.Margin = new Thickness(6, 0, 0, 0);
        Grid.SetColumn(heading, 1);
        bar.Children.Add(heading);
        Grid.SetColumn(copy, 2);
        Grid.SetColumn(clear, 3);
        bar.Children.Add(copy);
        bar.Children.Add(clear);
        toolbar.Height = 48;
        toolbar.BorderThickness = new Thickness(0, 0, 0, 1);
        toolbar.Child = bar;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(toolbar);
        var body = new StackPanel();
        body.Children.Add(empty);
        body.Children.Add(lines);
        scroller.Content = body;
        scroller.HorizontalScrollBarVisibility =
            Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        copy.Click += async (_, _) => {
            var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
            if (clipboard == null)
                return;
            await clipboard.SetTextAsync(logger.ReadLog());
            copied = true;
            Apply();
        };
        clear.Click += (_, _) => logger.ClearLog();
        // The page follows the log, but not line by line: a burst of lines is one refresh.
        Action follow = () => {
            if (refreshQueued)
                return;
            refreshQueued = true;
            Dispatcher.UIThread.Post(() => {
                refreshQueued = false;
                Apply();
            }, DispatcherPriority.Background);
        };
        logger.Written += follow;
        Lifetime.OnRelease(this, () => logger.Written -= follow);
        Lifetime.Watch(this, controller, _ => Apply());
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

    private void Apply()
    {
        if (!this.IsAttachedToVisualTree()) {
            stale = true;
            return;
        }

        stale = false;
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        toolbar.BorderBrush = new SolidColorBrush(c.Separator);
        back.Glyph = "back";
        Avalonia.Automation.AutomationProperties.SetName(back,
            controller.T("advanced.options"));
        heading.Text = controller.T("logs");
        heading.Foreground = new SolidColorBrush(c.Text);
        copy.Label = copied ? controller.T("copied") : controller.T("copy");
        clear.Label = controller.T("logs.clear");
        var all = LogLine.Parse(logger.ReadLog());
        empty.Text = controller.T("logs.empty");
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

    // Makes the controls the lines of the log. The file only gets new lines
    // at the end or is emptied, so when the lines that are shown are the
    // start of the log, the new ones are put at the end; in any other case
    // (another theme, the log emptied) all are made again. True when a line
    // was added.
    private bool SyncLines(IReadOnlyList<LogLine> all, ColorTokens c)
    {
        if (!ReferenceEquals(shownColors, c) || !StartsWithShown(all)) {
            lines.Children.Clear();
            shown.Clear();
        }

        shownColors = c;
        var before = shown.Count;
        for (var i = before; i < all.Count; i++) {
            lines.Children.Add(Row(all[i], c));
            shown.Add(all[i]);
        }

        return all.Count > before;
    }

    // A line that is told again with more text (the lines of a stack
    // trace come after it) is not the same line any more.
    private bool StartsWithShown(IReadOnlyList<LogLine> all)
    {
        if (shown.Count > all.Count)
            return false;
        for (var i = 0; i < shown.Count; i++) {
            if (shown[i] != all[i])
                return false;
        }

        return true;
    }

    /// <summary>
    /// A button of the toolbar: an icon and its words, with no field of its own; it takes the tint under the pointer. Danger draws it in the
    /// colour of danger, as Clear is.
    /// </summary>
    private sealed class ToolButton : PressableButton {
        private readonly Icon icon;

        private readonly TextBlock text = new() {
            FontSize = 14,
            FontWeight = FontWeight.Medium,
            FontFamily = Fonts.System,
            VerticalAlignment = VerticalAlignment.Center,
        };

        public ToolButton(string glyph)
        {
            icon = new Icon {
                Glyph = glyph,
                Size = 16,
                VerticalAlignment = VerticalAlignment.Center,
            };
            Height = 32;
            Padding = new Thickness(10, 0);
            CornerRadius = new CornerRadius(8);
            Child = new StackPanel {
                Orientation = Orientation.Horizontal,
                Spacing = 6,
                Children = {
                    icon,
                    text,
                },
            };
        }

        public string Label {
            get => text.Text ?? "";
            set => text.Text = value;
        }

        public bool Danger {
            get;
            set {
                field = value;
                Refresh();
            }
        }

        protected override void Refresh()
        {
            var c = Colors;
            var ink = new SolidColorBrush(Danger ? c.Danger : c.Text);
            icon.Color = ink;
            text.Foreground = ink;
            Background = Pressed ? new SolidColorBrush(c.Separator)
                : Hovered ? new SolidColorBrush(c.Hover)
                : Brushes.Transparent;
        }
    }

    private static SelectableTextBlock Row(LogLine line, ColorTokens c)
    {
        var color = line.Level switch {
            LogLevel.Error or LogLevel.Fatal => c.Danger,
            LogLevel.Warn => Color.FromRgb(0xE0, 0xA1, 0x00),
            _ => c.Text,
        };
        return new SelectableTextBlock {
            Text = $"{line.Stamp} {line.Text}",
            FontFamily = new FontFamily("monospace"),
            FontSize = 12,
            LineHeight = 17,
            Foreground = new SolidColorBrush(color),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(14, 2),
        };
    }
}
