using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>The language picker (<c>LanguagePage</c>): every language by its own name, the one in use checked; choosing one changes the interface at once.</summary>
public sealed class LanguagePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();

    private readonly StackPanel rows = new() {
        Margin = new Thickness(12, 12, 12, 24),
        Spacing = 2
    };

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
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<LanguagePage>((p, _) => p.Apply());
        Apply();
    }

    public StackPanel Rows => rows;

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var locale = controller.Store.Value.Locale;
        Background = new SolidColorBrush(c.Bg);
        PageBar.Fill(bar, c, Strings.T(locale, "language"), Strings.T(locale, "profile"),
            () => controller.OpenSidebarPage(SidebarPage.Profile));
        rows.Children.Clear();
        foreach (var language in Strings.Languages) {
            var active = language.Id == locale;
            var line = new Grid {
                ColumnDefinitions = new ColumnDefinitions("*,Auto")
            };
            line.Children.Add(new TextBlock {
                Text = language.Label,
                FontSize = 16,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                VerticalAlignment = VerticalAlignment.Center,
            });
            if (active) {
                var check = new Icon {
                    Glyph = "check",
                    Size = 20,
                    Color = new SolidColorBrush(c.Accent),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(check, 1);
                line.Children.Add(check);
            }

            var row = new Border {
                Height = 44,
                Padding = new Thickness(14, 0),
                CornerRadius = new CornerRadius(Radius.Control),
                Background = active ? new SolidColorBrush(c.BgSecondary) : Brushes.Transparent,
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = line,
            };
            var id = language.Id;
            row.PointerPressed += (_, e) => {
                e.Handled = true;
                controller.SetPreferences(p => p with {
                    Locale = id
                });
            };
            Avalonia.Automation.AutomationProperties.SetName(row, language.Label);
            rows.Children.Add(row);
        }
    }
}
