using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Settings;

/// <summary>The language picker (<c>LanguagePage</c>): every language by its own name, the one in use checked; choosing one changes the interface at once.</summary>
public sealed class LanguagePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(0, 0, 0, 24)
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static LanguagePage()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<LanguagePage>((p, _) => p.Apply());
    }

    public LanguagePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = rows,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public StackPanel Rows => rows;

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var locale = controller.Store.Value.Locale;
        Background = new SolidColorBrush(c.Bg);
        PageBar.Title(bar, c, Strings.T(locale, "language"));
        rows.Children.Clear();
        foreach (var language in Strings.Languages) {
            var id = language.Id;
            rows.Children.Add(SettingsRows.Choice(c, language.Label,
                id == locale, () => controller.SetPreferences(p => p with {
                    Locale = id
                })));
        }
    }
}
