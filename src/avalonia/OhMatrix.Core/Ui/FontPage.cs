using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>The font picker (<c>FontDialog</c>): the installed fonts to choose the interface's from, each name drawn in its own font, with a search; the system's own first.</summary>
public sealed class FontPage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly SearchField search = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(12, 4, 12, 24),
        Spacing = 2
    };

    private IReadOnlyList<string>? installed;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static FontPage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<FontPage>((p, _) =>
            p.Apply());
    }

    public FontPage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        Children.Add(bar);
        search.Margin = new Thickness(16, 10, 16, 6);
        Grid.SetRow(search, 1);
        Children.Add(search);
        var scroller = new ScrollViewer {
            Content = rows,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);
        search.TextChanged += (_, _) => Apply();
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public StackPanel Rows => rows;
    public SearchField Search => search;

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.Bg);
        PageBar.Fill(bar, c, controller.T("font"), controller.T("settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings));
        search.Placeholder = controller.T("font.search");
        installed ??= Fonts.Installed();
        var current = controller.Store.Value.Prefs.Font;
        var query = search.Text.Trim();
        rows.Children.Clear();
        var names = new List<string?>();
        if (query.Length == 0)
            names.Add(null);
        names.AddRange(installed.Where(n =>
            query.Length == 0 || n.Contains(query,
                StringComparison.CurrentCultureIgnoreCase)));
        foreach (var name in names)
            rows.Children.Add(Row(c, name, name == current));
        if (names.Count == 0)
            rows.Children.Add(new TextBlock {
                Text = controller.T("font.empty"),
                Foreground = new SolidColorBrush(c.TextSecondary),
                FontFamily = Fonts.System,
                Margin = new Thickness(8, 16),
                TextAlignment = TextAlignment.Center,
            });
        else
            rows.Children.Add(new TextBlock {
                Text = controller.T("font.footer"),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(8, 12),
            });
    }

    private Control Row(ColorTokens c, string? name, bool active)
    {
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        line.Children.Add(new TextBlock {
            Text = name ?? controller.T("font.system"),
            FontSize = 16,
            FontFamily = name is null ? Fonts.System : new FontFamily(name),
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
        });
        if (active) {
            var check = new Icon {
                Glyph = "check",
                Size = 20,
                Color = new SolidColorBrush(c.Accent),
                VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
            };
            Grid.SetColumn(check, 1);
            line.Children.Add(check);
        }

        var row = new Border {
            Height = 40,
            Padding = new Thickness(14, 0),
            CornerRadius = new CornerRadius(Radius.Control),
            Background = active
                ? new SolidColorBrush(c.BgSecondary)
                : Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = line,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            controller.SetPreferences(p => p with {
                Font = name
            });
        };
        return row;
    }
}
