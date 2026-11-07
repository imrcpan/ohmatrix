using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The emoji grid (<c>EmojiPicker</c>): a search field, the emoji of a group in rows of 36 px tiles, and a bar of group tabs below with the recent
/// ones first. A press on an emoji hands it over and shuts the picker. It floats above the anchor, at its left edge.
/// </summary>
public sealed class EmojiPicker {
    private const double PickerWidth = 320;
    private const double PickerHeight = 340;
    private const double Margin = 8;
    public const int RecentMax = 24;

    private OverlayLayer? layer;

    private Action<string> pick = _ => {
    };

    private IReadOnlyList<string> recent = [];
    private string group = EmojiData.Groups[0].Id;
    private string query = "";
    private ColorTokens colors = null!;

    private readonly Canvas shade = new() {
        Background = Brushes.Transparent
    };

    private readonly Border surface = new() {
        CornerRadius = new CornerRadius(14),
        Width = PickerWidth,
        Height = PickerHeight,
    };

    private readonly Grid emojiRoot = new();

    private readonly Border clip = new() {
        CornerRadius = new CornerRadius(14),
        ClipToBounds = true
    };

    private readonly TextBox search = new() {
        Height = 32,
        MinHeight = 32,
        FontSize = 14,
        Padding = new Thickness(12, 6),
        CornerRadius = new CornerRadius(16),
        BorderThickness = new Thickness(0),
        VerticalContentAlignment = VerticalAlignment.Center,
    };

    private readonly WrapPanel grid = new() {
        Margin = new Thickness(8)
    };

    private readonly StackPanel tabs = new() {
        Orientation = Orientation.Horizontal
    };

    private readonly Border tabBar = new() {
        BorderThickness = new Thickness(0, 1, 0, 0),
        Padding = new Thickness(0, 4),
    };

    public EmojiPicker()
    {
        var root = emojiRoot;
        root.RowDefinitions = new RowDefinitions("Auto,*,Auto");
        var top = new Border {
            Padding = new Thickness(10, 10, 10, 0),
            Child = search
        };
        root.Children.Add(top);
        var scroller = new ScrollViewer {
            Content = grid,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        root.Children.Add(scroller);
        tabBar.Child = tabs;
        Grid.SetRow(tabBar, 2);
        root.Children.Add(tabBar);
        clip.Child = root;
        surface.Child = clip;
        shade.Children.Add(surface);
        search.TextChanged += (_, _) => {
            query = search.Text?.Trim() ?? "";
            Build();
        };
        // A press outside the picker shuts it; a press on it is its own.
        shade.PointerPressed += (_, e) => {
            if (e.Source is Visual v && !surface.IsVisualAncestorOf(v) &&
                !ReferenceEquals(v, surface))
                Close();
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
        };
    }

    public bool IsOpen => shade.Parent is not null;

    /// <summary>The field that filters the emoji.</summary>
    public TextBox Search => search;

    /// <summary>The emoji shown now, in order.</summary>
    public IReadOnlyList<string> Shown => Current();

    /// <summary>The tiles as they are laid out now.</summary>
    public IReadOnlyList<Control> Tiles => grid.Children;

    /// <summary>The ids of the tabs, the recent one first when there are recent emoji.</summary>
    public IReadOnlyList<string> TabIds => TabList().Select(t => t.Id).ToList();

    /// <summary>Shows the picker above <paramref name="anchor"/> in <paramref name="window"/>.</summary>
    public void Show(Control anchor, TopLevel window, ColorTokens tokens,
        IReadOnlyList<string> recentEmoji, string searchLabel, Action<string> onPick)
    {
        colors = tokens;
        recent = recentEmoji;
        pick = onPick;
        query = "";
        search.Text = "";
        search.Watermark = searchLabel;
        Avalonia.Automation.AutomationProperties.SetName(search, searchLabel);
        group = recent.Count > 0 ? "recent" : EmojiData.Groups[0].Id;
        clip.Child = emojiRoot;
        Style();
        Build();
        Place(anchor, window, PickerWidth, PickerHeight);
        search.Focus();
    }

    /// <summary>Shows the stickers over the same surface: the picker is the sticker pane alone (no emoji groups, no search, no tabs).</summary>
    public void ShowStickers(Control anchor, TopLevel window, ColorTokens tokens, StickerPane pane)
    {
        colors = tokens;
        clip.Child = pane;
        Style();
        var width = StickerPane.WidthOf(StickerPane.Columns(window.ClientSize.Width - 2 * Margin));
        Place(anchor, window, width, pane.Height);
    }

    private void Style()
    {
        var dark = colors.Bg.R < 128;
        clip.Background = new SolidColorBrush(colors.Bg);
        surface.BorderThickness = dark ? new Thickness(1) : new Thickness(0);
        surface.BorderBrush = new SolidColorBrush(colors.TextTertiary);
        surface.BoxShadow = dark
            ? new BoxShadows(new BoxShadow {
                OffsetY = 6,
                Blur = 22,
                Color = Color.FromArgb(140, 0, 0, 0)
            })
            : new BoxShadows(new BoxShadow {
                OffsetY = 4,
                Blur = 18,
                Color = Color.FromArgb(60, 0, 0, 0)
            });
        search.Background = new SolidColorBrush(colors.BgSecondary);
        search.Foreground = new SolidColorBrush(colors.Text);
        search.CaretBrush = new SolidColorBrush(colors.Text);
        search.Resources["TextControlPlaceholderForeground"] =
            new SolidColorBrush(colors.TextSecondary);
        search.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(colors.TextSecondary);
        search.Resources["TextControlBackgroundFocused"] = new SolidColorBrush(colors.BgSecondary);
        search.Resources["TextControlBackgroundPointerOver"] =
            new SolidColorBrush(colors.BgSecondary);
        search.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        search.Resources["TextControlBorderBrushPointerOver"] = Brushes.Transparent;
        tabBar.BorderBrush = new SolidColorBrush(colors.Separator);
    }

    private void Place(Control anchor, TopLevel window, double wanted, double tall)
    {
        Close();
        layer = OverlayLayer.GetOverlayLayer(window);
        if (layer is null)
            return;
        var origin = anchor.TranslatePoint(new Point(0, 0), window) ?? new Point();
        var width = Math.Min(wanted, window.ClientSize.Width - 2 * Margin);
        surface.Width = width;
        var height = Math.Min(tall, Math.Max(160, origin.Y - 2 * Margin));
        surface.Height = height;
        // Above the anchor with a gap of 8, at its left edge, and inside the window.
        var left = Math.Max(Margin, Math.Min(origin.X, window.ClientSize.Width - width - Margin));
        Canvas.SetLeft(surface, left);
        Canvas.SetTop(surface, Math.Max(Margin, origin.Y - height - Margin));
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        layer.Children.Add(shade);
    }

    public void Close()
    {
        layer?.Children.Remove(shade);
    }

    private record Tab(string Id, string Glyph);

    private List<Tab> TabList()
    {
        var list = new List<Tab>();
        if (recent.Count > 0)
            list.Add(new Tab("recent", ""));
        foreach (var g in EmojiData.Groups)
            list.Add(new Tab(g.Id, g.Emojis[0]));
        return list;
    }

    private IReadOnlyList<string> Current()
    {
        if (query.Length > 0)
            return EmojiData.Groups.SelectMany(g => g.Emojis)
                .Where(e => e.Contains(query, StringComparison.Ordinal)).ToList();
        if (group == "recent")
            return recent;
        return EmojiData.Groups.FirstOrDefault(g => g.Id == group)?.Emojis ?? [];
    }

    /// <summary>Opens the tab of a group.</summary>
    public void ChooseGroup(string id)
    {
        search.Text = "";
        query = "";
        group = id;
        Build();
    }

    private void Build()
    {
        grid.Children.Clear();
        foreach (var emoji in Current()) {
            var tile = new Border {
                Width = 36,
                Height = 36,
                Margin = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Background = Brushes.Transparent,
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = new TextBlock {
                    Text = emoji,
                    FontSize = 22,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            tile.PointerEntered += (_, _) => tile.Background = new SolidColorBrush(colors.Hover);
            tile.PointerExited += (_, _) => tile.Background = Brushes.Transparent;
            tile.PointerPressed += (_, e) => {
                e.Handled = true;
                Close();
                pick(emoji);
            };
            Avalonia.Automation.AutomationProperties.SetName(tile, $"Emoji {emoji}");
            grid.Children.Add(tile);
        }

        tabs.Children.Clear();
        foreach (var tab in TabList()) {
            var on = tab.Id == group && query.Length == 0;
            var cell = new Border {
                Width = (PickerWidth - 0) / TabList().Count,
                Height = 32,
                Background = new SolidColorBrush(on ? colors.BgSecondary : Colors.Transparent),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = tab.Id == "recent"
                    ? new Icon {
                        Glyph = "clock",
                        Size = 16,
                        Color = new SolidColorBrush(colors.TextSecondary),
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    }
                    : new TextBlock {
                        Text = tab.Glyph,
                        FontSize = 16,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
            };
            var id = tab.Id;
            cell.PointerPressed += (_, e) => {
                e.Handled = true;
                ChooseGroup(id);
            };
            Avalonia.Automation.AutomationProperties.SetName(cell, id);
            tabs.Children.Add(cell);
        }
    }
}
