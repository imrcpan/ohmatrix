using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>The language picker (<c>LanguagePage</c>): every language by its own name, the one in use checked; choosing one changes the interface at once.</summary>
public sealed class LanguagePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(0, 0, 0, 24),
        Spacing = 2
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
        PageBar.Fill(bar, c, Strings.T(locale, "language"),
            Strings.T(locale, "settings"),
            () => controller.OpenSidebarPage(SidebarPage.Settings));
        rows.Children.Clear();
        foreach (var language in Strings.Languages) {
            var active = language.Id == locale;
            var line = new Grid {
                ColumnDefinitions = new ColumnDefinitions("*,Auto")
            };
            var label = new TextBlock {
                Text = language.Label,
                FontSize = 16,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Fonts.Center(label);
            line.Children.Add(label);
            if (active) {
                var check = new Icon {
                    Glyph = "check",
                    Size = 21,
                    Color = new SolidColorBrush(c.Accent),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(check, 1);
                line.Children.Add(check);
            }

            var row = new Border {
                Height = 48,
                Padding = new Thickness(26, 0),
                Background = Brushes.Transparent,
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = line,
            };
            ProfilePage.Hover(row, c);
            var id = language.Id;
            row.PointerPressed += (_, e) => {
                e.Handled = true;
                controller.SetPreferences(p => p with {
                    Locale = id
                });
            };
            Avalonia.Automation.AutomationProperties.SetName(row,
                language.Label);
            rows.Children.Add(row);
        }
    }
}
