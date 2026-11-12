using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;

namespace OhMatrix.Core.Ui;

/// <summary>The font picker (<c>FontDialog</c>): the installed fonts to choose the interface's from, each name drawn in its own font, with a search; the system's own first.</summary>
public sealed class FontPage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly SearchField search = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(0, 4, 0, 24)
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
        search.Margin = new Thickness(SettingsShell.Side, 4,
            SettingsShell.Side, 6);
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
        PageBar.Title(bar, c, controller.T("font"));
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
                FontSize = SettingsShell.NoteFont,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(SettingsShell.Side, 12),
            });
    }

    private Control Row(ColorTokens c, string? name, bool active)
    {
        return SettingsRows.Choice(c, name ?? controller.T("font.system"),
            active, () => controller.SetPreferences(p => p with {
                Font = name
            }), name == null ? Fonts.System : new FontFamily(name));
    }
}
